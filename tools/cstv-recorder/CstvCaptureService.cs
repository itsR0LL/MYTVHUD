using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MYTVHUD.CSTVRecorder;

internal sealed class CstvCaptureService : IDisposable
{
    private const int MaximumRedirects = 5;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(250);
    private static readonly string[] RequiredSyncFields =
    [
        "tick",
        "rtdelay",
        "rcvage",
        "fragment",
        "signup_fragment",
        "tps",
        "protocol"
    ];
    private static readonly Regex UrlPattern = new(
        "https?://[^\\s\"'<>]+",
        RegexOptions.CultureInvariant
    );
    private readonly HttpClient httpClient;
    private readonly string outputDirectory;
    private readonly int deltaCount;
    private readonly JsonSerializerOptions jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public CstvCaptureService(string outputDirectory, int deltaCount)
    {
        this.outputDirectory = Path.GetFullPath(outputDirectory);
        this.deltaCount = deltaCount;
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.GZip
                | DecompressionMethods.Deflate
                | DecompressionMethods.Brotli
        };
        httpClient = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(15)
        };
    }

    public async Task CaptureAsync(
        Uri broadcastUrl,
        string sourceLogFileName,
        CancellationToken cancellationToken
    )
    {
        var detectedAt = DateTimeOffset.Now;
        var sessionId = CreateSessionId(broadcastUrl);
        var sessionDirectory = Path.Combine(
            outputDirectory,
            $"CSTV-{detectedAt:yyyyMMdd-HHmmss}-{sessionId}"
        );
        Directory.CreateDirectory(sessionDirectory);

        EndpointCaptureSummary? syncCapture = null;
        EndpointCaptureSummary? startCapture = null;
        EndpointCaptureSummary? fullCapture = null;
        var deltaCaptures = new List<EndpointCaptureSummary>();
        CstvSyncData? sync = null;
        IReadOnlyList<string> syncFields = [];
        var hasTokenRedirectField = false;
        string state;
        string? error = null;

        try
        {
            var syncResult = await FetchWithRetryAsync(
                new Uri(broadcastUrl.AbsoluteUri.TrimEnd('/') + "/sync"),
                maximumAttempts: 40,
                cancellationToken
            );
            syncCapture = await SaveEndpointAsync(
                sessionDirectory,
                "sync",
                "sync.json",
                syncResult,
                saveSuccessfulBody: false,
                cancellationToken
            );
            if (syncResult.SuccessfulResponse is null)
            {
                throw new InvalidOperationException("在等待时间内未取得 HTTP 200 的 sync 响应");
            }

            using (var document = JsonDocument.Parse(syncResult.SuccessfulResponse.Body))
            {
                if (document.RootElement.ValueKind != JsonValueKind.Object)
                {
                    throw new InvalidOperationException("sync 响应不是 JSON 对象");
                }
                syncFields = document.RootElement.EnumerateObject().Select(item => item.Name).ToArray();
                hasTokenRedirectField = document.RootElement.TryGetProperty("token_redirect", out _);
                var missingFields = RequiredSyncFields
                    .Where(field => !document.RootElement.TryGetProperty(field, out _))
                    .ToArray();
                if (missingFields.Length > 0)
                {
                    throw new InvalidOperationException(
                        $"sync 响应缺少已验证字段：{string.Join("、", missingFields)}"
                    );
                }
                sync = document.RootElement.Deserialize<CstvSyncData>()
                    ?? throw new InvalidOperationException("无法解析 sync 响应");
            }
            await SaveSanitizedSyncAsync(
                sessionDirectory,
                sync,
                syncFields,
                hasTokenRedirectField,
                cancellationToken
            );
            syncCapture = new EndpointCaptureSummary
            {
                Endpoint = "sync",
                Attempts = syncCapture.Attempts,
                Saved = true,
                FileName = "sync.sanitized.json"
            };
            if (hasTokenRedirectField)
            {
                throw new InvalidOperationException(
                    "sync 响应出现未经当前完美平台样本验证的 token_redirect 字段，已停止后续请求"
                );
            }

            var baseUrl = broadcastUrl.AbsoluteUri.TrimEnd('/');
            var startResult = await FetchWithRetryAsync(
                new Uri($"{baseUrl}/{sync.SignupFragment}/start"),
                maximumAttempts: 40,
                cancellationToken
            );
            startCapture = await SaveEndpointAsync(
                sessionDirectory,
                "start",
                "start.bin",
                startResult,
                saveSuccessfulBody: true,
                cancellationToken
            );

            var fullResult = await FetchWithRetryAsync(
                new Uri($"{baseUrl}/{sync.Fragment}/full"),
                maximumAttempts: 40,
                cancellationToken
            );
            fullCapture = await SaveEndpointAsync(
                sessionDirectory,
                "full",
                $"full-{sync.Fragment}.bin",
                fullResult,
                saveSuccessfulBody: true,
                cancellationToken
            );

            for (var offset = 0; offset < deltaCount; offset += 1)
            {
                var fragment = sync.Fragment + offset;
                var deltaResult = await FetchWithRetryAsync(
                    new Uri($"{baseUrl}/{fragment}/delta"),
                    maximumAttempts: 40,
                    cancellationToken
                );
                deltaCaptures.Add(
                    await SaveEndpointAsync(
                        sessionDirectory,
                        $"delta:{fragment}",
                        $"delta-{fragment}.bin",
                        deltaResult,
                        saveSuccessfulBody: true,
                        cancellationToken
                    )
                );
            }

            state = startCapture.Saved && fullCapture.Saved && deltaCaptures.Any(item => item.Saved)
                ? "complete"
                : "incomplete";
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            state = "failed";
            error = SanitizeText(exception.Message);
        }

        var diagnostics = new CstvCaptureDiagnostics
        {
            RecordType = "cstv-capture-diagnostics",
            Schema = CstvCaptureDiagnostics.SchemaVersion,
            SessionId = sessionId,
            DetectedAt = detectedAt,
            CompletedAt = DateTimeOffset.Now,
            SourceLogFileName = sourceLogFileName,
            State = state,
            Error = error,
            SyncFields = syncFields,
            HasTokenRedirectField = hasTokenRedirectField,
            Sync = sync,
            SyncCapture = syncCapture,
            StartCapture = startCapture,
            FullCapture = fullCapture,
            DeltaCaptures = deltaCaptures
        };
        var diagnosticsPath = Path.Combine(sessionDirectory, "diagnostics.json");
        await File.WriteAllTextAsync(
            diagnosticsPath,
            JsonSerializer.Serialize(diagnostics, jsonOptions),
            new UTF8Encoding(false),
            cancellationToken
        );

        Console.WriteLine($"会话 {sessionId} 抓取完成：{state}");
        Console.WriteLine($"记录目录：{sessionDirectory}\n");
    }

    public static string CreateSessionId(Uri broadcastUrl)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(broadcastUrl.AbsoluteUri));
        return Convert.ToHexString(hash)[..12].ToLowerInvariant();
    }

    private async Task<FetchSeries> FetchWithRetryAsync(
        Uri uri,
        int maximumAttempts,
        CancellationToken cancellationToken
    )
    {
        var attempts = new List<HttpAttemptSummary>();
        FetchResponse? successfulResponse = null;
        for (var attempt = 1; attempt <= maximumAttempts; attempt += 1)
        {
            var response = await FetchAsync(uri, cancellationToken);
            attempts.Add(
                new HttpAttemptSummary
                {
                    Attempt = attempt,
                    RequestedAt = response.RequestedAt,
                    StatusCode = response.StatusCode,
                    RedirectCount = response.RedirectCount,
                    FinalHost = response.FinalHost,
                    ContentType = response.ContentType,
                    ContentLength = response.Body.Length,
                    ErrorBody = response.StatusCode == (int)HttpStatusCode.OK
                        ? null
                        : SanitizeBody(response.Body, response.ContentType)
                }
            );
            if (response.StatusCode == (int)HttpStatusCode.OK)
            {
                successfulResponse = response;
                break;
            }
            if (attempt < maximumAttempts)
            {
                await Task.Delay(RetryDelay, cancellationToken);
            }
        }
        return new FetchSeries(attempts, successfulResponse);
    }

    private async Task<FetchResponse> FetchAsync(Uri uri, CancellationToken cancellationToken)
    {
        var requestedAt = DateTimeOffset.Now;
        var currentUri = uri;
        for (var redirectCount = 0; redirectCount <= MaximumRedirects; redirectCount += 1)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, currentUri);
            using var response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseContentRead,
                cancellationToken
            );
            if (IsRedirect(response.StatusCode))
            {
                if (redirectCount == MaximumRedirects || response.Headers.Location is null)
                {
                    return await CreateFetchResponseAsync(
                        response,
                        requestedAt,
                        redirectCount,
                        currentUri,
                        cancellationToken
                    );
                }
                currentUri = response.Headers.Location.IsAbsoluteUri
                    ? response.Headers.Location
                    : new Uri(currentUri, response.Headers.Location);
                continue;
            }
            return await CreateFetchResponseAsync(
                response,
                requestedAt,
                redirectCount,
                currentUri,
                cancellationToken
            );
        }
        throw new InvalidOperationException("CSTV HTTP 重定向处理异常");
    }

    private static async Task<FetchResponse> CreateFetchResponseAsync(
        HttpResponseMessage response,
        DateTimeOffset requestedAt,
        int redirectCount,
        Uri finalUri,
        CancellationToken cancellationToken
    )
    {
        var body = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        return new FetchResponse(
            requestedAt,
            (int)response.StatusCode,
            redirectCount,
            finalUri.Host,
            response.Content.Headers.ContentType?.ToString(),
            body
        );
    }

    private async Task<EndpointCaptureSummary> SaveEndpointAsync(
        string sessionDirectory,
        string endpoint,
        string fileName,
        FetchSeries fetchSeries,
        bool saveSuccessfulBody,
        CancellationToken cancellationToken
    )
    {
        var saved = saveSuccessfulBody && fetchSeries.SuccessfulResponse is not null;
        if (saved)
        {
            await File.WriteAllBytesAsync(
                Path.Combine(sessionDirectory, fileName),
                fetchSeries.SuccessfulResponse!.Body,
                cancellationToken
            );
        }
        return new EndpointCaptureSummary
        {
            Endpoint = endpoint,
            Attempts = fetchSeries.Attempts,
            Saved = saved,
            FileName = saved ? fileName : null
        };
    }

    private async Task SaveSanitizedSyncAsync(
        string sessionDirectory,
        CstvSyncData sync,
        IReadOnlyList<string> fields,
        bool hasTokenRedirectField,
        CancellationToken cancellationToken
    )
    {
        var payload = new
        {
            fields,
            hasTokenRedirectField,
            data = sync
        };
        await File.WriteAllTextAsync(
            Path.Combine(sessionDirectory, "sync.sanitized.json"),
            JsonSerializer.Serialize(payload, jsonOptions),
            new UTF8Encoding(false),
            cancellationToken
        );
    }

    private static bool IsRedirect(HttpStatusCode statusCode)
    {
        var value = (int)statusCode;
        return value is 301 or 302 or 303 or 307 or 308;
    }

    private static string? SanitizeBody(byte[] body, string? contentType)
    {
        if (body.Length == 0)
        {
            return null;
        }
        if (
            contentType is null
            || (!contentType.Contains("json", StringComparison.OrdinalIgnoreCase)
                && !contentType.Contains("text", StringComparison.OrdinalIgnoreCase)
                && !contentType.Contains("xml", StringComparison.OrdinalIgnoreCase))
        )
        {
            return $"[非文本响应，{body.Length} 字节]";
        }
        var length = Math.Min(body.Length, 2048);
        return SanitizeText(Encoding.UTF8.GetString(body, 0, length));
    }

    private static string SanitizeText(string value)
    {
        return UrlPattern.Replace(value, "[已隐藏 URL]");
    }

    public void Dispose()
    {
        httpClient.Dispose();
    }

    private sealed record FetchResponse(
        DateTimeOffset RequestedAt,
        int StatusCode,
        int RedirectCount,
        string FinalHost,
        string? ContentType,
        byte[] Body
    );

    private sealed record FetchSeries(
        IReadOnlyList<HttpAttemptSummary> Attempts,
        FetchResponse? SuccessfulResponse
    );
}
