using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MYTVHUD.GSIRecorder;

internal static class Program
{
    private const string ListenUrl = "http://127.0.0.1:5032";
    private const string ConfigFileName = "gamestate_integration_mytvhud_recorder.cfg";

    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        Console.WriteLine("MYTVHUD GSI 完整录制器");
        Console.WriteLine("用途：保存 CS2 发出的每一条原始 GSI 请求，不影响 MYTVHUD 正常接收。\n");

        string? configPath = null;
        RawGsiWriter? writer = null;
        WebApplication? app = null;

        try
        {
            var cs2Path = SelectCs2Executable(args);
            if (cs2Path is null)
            {
                Console.WriteLine("没有选择 cs2.exe，录制器已退出。");
                WaitBeforeExit();
                return 1;
            }

            configPath = InstallRecorderConfig(cs2Path);
            var outputDirectory = ReadArgument(args, "--output-directory")
                ?? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "MYTVHUD-GSI完整记录"
                );
            Directory.CreateDirectory(outputDirectory);
            var outputPath = Path.Combine(
                outputDirectory,
                $"GSI-{DateTime.Now:yyyyMMdd-HHmmss}.jsonl"
            );
            writer = new RawGsiWriter(outputPath, configPath);

            var builder = WebApplication.CreateBuilder();
            builder.Logging.ClearProviders();
            builder.WebHost.UseUrls(ListenUrl);
            builder.Services.ConfigureHttpJsonOptions(options =>
            {
                options.SerializerOptions.WriteIndented = false;
            });

            app = builder.Build();
            app.MapPost("/gsi", async (HttpContext context) =>
            {
                using var reader = new StreamReader(
                    context.Request.Body,
                    Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: true,
                    leaveOpen: true
                );
                var body = await reader.ReadToEndAsync(context.RequestAborted);
                await writer.WriteFrameAsync(body, context.Request.ContentType, context.RequestAborted);
                context.Response.StatusCode = StatusCodes.Status200OK;
            });

            await app.StartAsync();

            Console.WriteLine($"录制配置已写入：{configPath}");
            Console.WriteLine($"记录文件：{outputPath}");
            Console.WriteLine($"监听地址：{ListenUrl}/gsi");
            Console.WriteLine();
            Console.WriteLine("现在通过完美平台启动 CS2 并播放 DEMO。");
            Console.WriteLine("如果 CS2 已经启动，请关闭 CS2 后重新启动，使新增的 GSI 配置生效。");
            Console.WriteLine("比赛录制完成后回到本窗口，按 Enter 停止并封存记录。\n");

            Console.ReadLine();
            Console.WriteLine("正在停止录制……");
            await app.StopAsync();
            await writer.CompleteAsync();

            Console.WriteLine($"录制完成，共收到 {writer.FrameCount} 条 GSI 请求。");
            Console.WriteLine($"请把这个文件发给 Codex：{outputPath}");
            Console.WriteLine("临时 GSI 配置已移除；下次录制时重新运行本程序即可。");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"录制失败：{exception.Message}");
            if (exception.Message.Contains("5032", StringComparison.Ordinal))
            {
                Console.Error.WriteLine("请关闭其他正在运行的录制器后重试。");
            }
            return 2;
        }
        finally
        {
            if (app is not null)
            {
                await app.DisposeAsync();
            }
            if (writer is not null)
            {
                await writer.DisposeAsync();
            }
            RemoveRecorderConfig(configPath);
            WaitBeforeExit();
        }
    }

    private static string? SelectCs2Executable(string[] args)
    {
        var providedPath = ReadArgument(args, "--cs2");
        if (providedPath is null)
        {
            Console.WriteLine("请在资源管理器中找到 game\\bin\\win64\\cs2.exe。");
            Console.WriteLine("把 cs2.exe 文件拖到这个黑色窗口内，然后按 Enter：");
            Console.Write("> ");
            providedPath = Console.ReadLine();
        }

        if (string.IsNullOrWhiteSpace(providedPath))
        {
            return null;
        }
        var normalizedPath = providedPath.Trim();
        if (
            normalizedPath.Length >= 2 &&
            normalizedPath[0] == '"' &&
            normalizedPath[^1] == '"'
        )
        {
            normalizedPath = normalizedPath[1..^1];
        }
        if (!File.Exists(normalizedPath))
        {
            throw new FileNotFoundException("指定的 cs2.exe 不存在", normalizedPath);
        }
        if (!string.Equals(Path.GetFileName(normalizedPath), "cs2.exe", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("请选择 game\\bin\\win64\\cs2.exe");
        }
        return Path.GetFullPath(normalizedPath);
    }

    private static string? ReadArgument(string[] args, string name)
    {
        for (var index = 0; index < args.Length; index += 1)
        {
            if (!string.Equals(args[index], name, StringComparison.Ordinal))
            {
                continue;
            }
            if (index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1]))
            {
                throw new InvalidOperationException($"参数 {name} 缺少值");
            }
            return args[index + 1];
        }
        return null;
    }

    private static string InstallRecorderConfig(string cs2Path)
    {
        var win64Directory = Directory.GetParent(cs2Path)
            ?? throw new InvalidOperationException("无法读取 cs2.exe 所在目录");
        var binDirectory = win64Directory.Parent
            ?? throw new InvalidOperationException("无法读取 CS2 bin 目录");
        var gameDirectory = binDirectory.Parent
            ?? throw new InvalidOperationException("无法读取 CS2 game 目录");
        var configDirectory = Path.Combine(gameDirectory.FullName, "csgo", "cfg");
        Directory.CreateDirectory(configDirectory);
        var configPath = Path.Combine(configDirectory, ConfigFileName);
        File.WriteAllText(configPath, RecorderConfig, new UTF8Encoding(false));
        return configPath;
    }

    private static void RemoveRecorderConfig(string? configPath)
    {
        if (string.IsNullOrWhiteSpace(configPath))
        {
            return;
        }
        try
        {
            if (File.Exists(configPath))
            {
                File.Delete(configPath);
            }
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"无法移除临时 GSI 配置：{exception.Message}");
        }
    }

    private static void WaitBeforeExit()
    {
        if (!Environment.UserInteractive || Console.IsInputRedirected)
        {
            return;
        }
        Console.WriteLine("按 Enter 关闭窗口。");
        Console.ReadLine();
    }

    private const string RecorderConfig = """
"MYTVHUD GSI Recorder"
{
    "uri"        "http://127.0.0.1:5032/gsi"
    "timeout"    "0.1"
    "buffer"     "0.05"
    "throttle"   "0.05"
    "output"
    {
    }
    "heartbeat"  "1.0"
    "data"
    {
        "provider"                  "1"
        "map"                       "1"
        "round"                     "1"
        "player_id"                 "1"
        "allplayers_id"             "1"
        "player_state"              "1"
        "allplayers_state"          "1"
        "allplayers_match_stats"    "1"
        "allplayers_weapons"        "1"
        "allplayers_position"       "1"
        "phase_countdowns"          "1"
        "allgrenades"               "1"
        "map_round_wins"            "1"
        "player_position"           "1"
        "bomb"                      "1"
    }
}
""";
}

internal sealed class RawGsiWriter : IAsyncDisposable
{
    private readonly FileStream stream;
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private long sequence;
    private bool completed;

    public RawGsiWriter(string outputPath, string configPath)
    {
        OutputPath = outputPath;
        stream = new FileStream(
            outputPath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.Read,
            bufferSize: 64 * 1024,
            useAsync: true
        );
        WriteRecordAsync(writer =>
        {
            writer.WriteString("recordType", "session-start");
            writer.WriteString("receivedAt", DateTimeOffset.Now);
            writer.WriteNumber("receivedAtUnixMs", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            writer.WriteString("configPath", configPath);
            writer.WriteString("listenUrl", "http://127.0.0.1:5032/gsi");
        }, CancellationToken.None).GetAwaiter().GetResult();
    }

    public string OutputPath { get; }
    public long FrameCount => Interlocked.Read(ref sequence);

    public async Task WriteFrameAsync(
        string body,
        string? contentType,
        CancellationToken cancellationToken
    )
    {
        var currentSequence = Interlocked.Increment(ref sequence);
        var receivedAt = DateTimeOffset.Now;
        JsonDocument? document = null;
        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            // 无效 JSON 仍然原样记录，防止诊断信息丢失。
        }

        await WriteRecordAsync(writer =>
        {
            writer.WriteString("recordType", document is null ? "invalid-json" : "gsi-frame");
            writer.WriteNumber("sequence", currentSequence);
            writer.WriteString("receivedAt", receivedAt);
            writer.WriteNumber("receivedAtUnixMs", receivedAt.ToUnixTimeMilliseconds());
            if (!string.IsNullOrWhiteSpace(contentType))
            {
                writer.WriteString("contentType", contentType);
            }
            writer.WriteNumber("contentLength", Encoding.UTF8.GetByteCount(body));
            if (document is null)
            {
                writer.WriteString("payloadText", body);
            }
            else
            {
                writer.WritePropertyName("payload");
                document.RootElement.WriteTo(writer);
            }
        }, cancellationToken);
        document?.Dispose();

        if (currentSequence == 1 || currentSequence % 100 == 0)
        {
            Console.WriteLine($"已记录 {currentSequence} 条 GSI 请求……");
        }
    }

    public async Task CompleteAsync()
    {
        if (completed)
        {
            return;
        }
        completed = true;
        await WriteRecordAsync(writer =>
        {
            writer.WriteString("recordType", "session-end");
            writer.WriteString("receivedAt", DateTimeOffset.Now);
            writer.WriteNumber("receivedAtUnixMs", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            writer.WriteNumber("frameCount", FrameCount);
        }, CancellationToken.None);
        await stream.FlushAsync();
    }

    private async Task WriteRecordAsync(
        Action<Utf8JsonWriter> writeProperties,
        CancellationToken cancellationToken
    )
    {
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            await using var buffer = new MemoryStream();
            using (var jsonWriter = new Utf8JsonWriter(buffer))
            {
                jsonWriter.WriteStartObject();
                writeProperties(jsonWriter);
                jsonWriter.WriteEndObject();
                jsonWriter.Flush();
            }
            buffer.WriteByte((byte)'\n');
            buffer.Position = 0;
            await buffer.CopyToAsync(stream, cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }
        finally
        {
            writeLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (!completed)
        {
            await CompleteAsync();
        }
        await stream.DisposeAsync();
        writeLock.Dispose();
    }
}
