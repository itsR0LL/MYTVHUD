using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MYTVHUD.CSTVRecorder;

internal sealed class PwaLogMonitor
{
    private const string BroadcastMarker = "Playing Broadcast (";
    private const string ExpectedBroadcastHost = "seeseetv.wmpvp.com";
    private static readonly Regex ConsoleLogArgumentPattern = new(
        "(?:^|\\s)-consolelog\\s+(?:\"(?<quoted>[^\"]+)\"|(?<plain>\\S+))",
        RegexOptions.CultureInvariant
    );

    private readonly string? providedLogPath;
    private readonly HashSet<string> processedSessions = new(StringComparer.Ordinal);

    public PwaLogMonitor(string? providedLogPath)
    {
        this.providedLogPath = string.IsNullOrWhiteSpace(providedLogPath)
            ? null
            : Path.GetFullPath(providedLogPath);
    }

    public async Task RunAsync(
        Func<Uri, string, CancellationToken, Task> onBroadcast,
        CancellationToken cancellationToken
    )
    {
        var logPath = await ResolveLogPathAsync(cancellationToken);
        Console.WriteLine($"已定位完美平台日志：{logPath}");
        Console.WriteLine("请保持验证器运行，然后让导播进入观战席。\n");

        while (!File.Exists(logPath))
        {
            await Task.Delay(250, cancellationToken);
        }

        await using var stream = new FileStream(
            logPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            bufferSize: 16 * 1024,
            useAsync: true
        );
        stream.Seek(0, SeekOrigin.End);
        using var reader = new StreamReader(
            stream,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: true,
            bufferSize: 16 * 1024,
            leaveOpen: true
        );

        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                await Task.Delay(100, cancellationToken);
                continue;
            }

            var broadcastUrl = ExtractBroadcastUrl(line);
            if (broadcastUrl is null)
            {
                continue;
            }

            var sessionId = CstvCaptureService.CreateSessionId(broadcastUrl);
            if (!processedSessions.Add(sessionId))
            {
                continue;
            }

            Console.WriteLine($"检测到新 CSTV 会话：{sessionId}");
            await onBroadcast(broadcastUrl, Path.GetFileName(logPath), cancellationToken);
        }
    }

    private async Task<string> ResolveLogPathAsync(CancellationToken cancellationToken)
    {
        if (providedLogPath is not null)
        {
            if (!File.Exists(providedLogPath))
            {
                throw new FileNotFoundException("指定的完美平台日志不存在", providedLogPath);
            }
            return providedLogPath;
        }

        Console.WriteLine("正在等待完美平台启动 CS2……");
        while (!cancellationToken.IsCancellationRequested)
        {
            var logPaths = await ReadRunningCs2LogPathsAsync(cancellationToken);
            if (logPaths.Count == 1)
            {
                return logPaths[0];
            }
            if (logPaths.Count > 1)
            {
                throw new InvalidOperationException(
                    "检测到多个带 -consolelog 的 cs2.exe 进程，请关闭多余进程后重新运行验证器。"
                );
            }
            await Task.Delay(1000, cancellationToken);
        }
        throw new OperationCanceledException(cancellationToken);
    }

    private static async Task<IReadOnlyList<string>> ReadRunningCs2LogPathsAsync(
        CancellationToken cancellationToken
    )
    {
        const string command =
            "Get-CimInstance Win32_Process -Filter \"Name='cs2.exe'\" | "
            + "Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-NonInteractive");
        startInfo.ArgumentList.Add("-Command");
        startInfo.ArgumentList.Add(command);

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("无法启动 PowerShell 读取 CS2 启动参数");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var output = await outputTask;
        var error = await errorTask;
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"读取 CS2 启动参数失败：{error.Trim()}");
        }
        if (string.IsNullOrWhiteSpace(output))
        {
            return [];
        }

        using var document = JsonDocument.Parse(output);
        var processes = document.RootElement.ValueKind == JsonValueKind.Array
            ? document.RootElement.EnumerateArray().ToArray()
            : [document.RootElement];
        var paths = new List<string>();
        foreach (var item in processes)
        {
            if (
                !item.TryGetProperty("ExecutablePath", out var executablePathElement)
                || !item.TryGetProperty("CommandLine", out var commandLineElement)
            )
            {
                continue;
            }
            var executablePath = executablePathElement.GetString();
            var commandLine = commandLineElement.GetString();
            if (string.IsNullOrWhiteSpace(executablePath) || string.IsNullOrWhiteSpace(commandLine))
            {
                continue;
            }
            var match = ConsoleLogArgumentPattern.Match(commandLine);
            if (!match.Success)
            {
                continue;
            }
            var consoleLogValue = match.Groups["quoted"].Success
                ? match.Groups["quoted"].Value
                : match.Groups["plain"].Value;
            if (string.IsNullOrWhiteSpace(consoleLogValue))
            {
                continue;
            }
            paths.Add(ResolveConsoleLogPath(executablePath, consoleLogValue));
        }
        return paths.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static string ResolveConsoleLogPath(string executablePath, string consoleLogValue)
    {
        if (Path.IsPathFullyQualified(consoleLogValue))
        {
            return Path.GetFullPath(consoleLogValue);
        }
        var win64Directory = Directory.GetParent(executablePath)
            ?? throw new InvalidOperationException("无法读取 cs2.exe 所在目录");
        var binDirectory = win64Directory.Parent
            ?? throw new InvalidOperationException("无法读取 CS2 bin 目录");
        var gameDirectory = binDirectory.Parent
            ?? throw new InvalidOperationException("无法读取 CS2 game 目录");
        return Path.GetFullPath(Path.Combine(gameDirectory.FullName, "csgo", consoleLogValue));
    }

    private static Uri? ExtractBroadcastUrl(string line)
    {
        var markerIndex = line.IndexOf(BroadcastMarker, StringComparison.Ordinal);
        if (markerIndex < 0)
        {
            return null;
        }
        var urlStart = markerIndex + BroadcastMarker.Length;
        var urlEnd = line.IndexOf(')', urlStart);
        if (urlEnd <= urlStart)
        {
            return null;
        }
        var value = line[urlStart..urlEnd];
        if (
            !Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || !string.Equals(uri.Host, ExpectedBroadcastHost, StringComparison.Ordinal)
            || !uri.AbsolutePath.StartsWith("/match/", StringComparison.Ordinal)
        )
        {
            return null;
        }
        return uri;
    }
}
