using System.Text;

namespace MYTVHUD.CSTVRecorder;

internal static class Program
{
    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("MYTVHUD CSTV 自动验证器");
        Console.WriteLine("用途：验证完美平台观战流的 start、full 与 delta 是否可独立读取。");
        Console.WriteLine("工具不会注入游戏，也不会保存完整 Broadcast 地址。\n");

        var waitBeforeExit = true;
        try
        {
            var outputDirectory = ReadArgument(args, "--output-directory")
                ?? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "MYTVHUD-CSTV验证记录"
                );
            var logPath = ReadArgument(args, "--log");
            var deltaCount = ReadPositiveInteger(args, "--delta-count", 8);
            Directory.CreateDirectory(outputDirectory);

            using var cancellation = new CancellationTokenSource();
            Console.CancelKeyPress += (_, eventArgs) =>
            {
                eventArgs.Cancel = true;
                cancellation.Cancel();
            };

            using var captureService = new CstvCaptureService(outputDirectory, deltaCount);
            var monitor = new PwaLogMonitor(logPath);
            var monitorTask = monitor.RunAsync(
                (broadcastUrl, sourceLogFileName, cancellationToken) =>
                    captureService.CaptureAsync(
                        broadcastUrl,
                        sourceLogFileName,
                        cancellationToken
                    ),
                cancellation.Token
            );

            Console.WriteLine("按 Enter 可随时停止验证器。\n");
            var stopTask = Task.Run(Console.ReadLine);
            var completedTask = await Task.WhenAny(monitorTask, stopTask);
            if (completedTask == stopTask)
            {
                cancellation.Cancel();
            }
            try
            {
                await monitorTask;
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
            {
                // 用户主动结束。
            }
            Console.WriteLine("CSTV 验证器已停止。");
            waitBeforeExit = false;
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"验证失败：{exception.Message}");
            return 2;
        }
        finally
        {
            if (waitBeforeExit)
            {
                WaitBeforeExit();
            }
        }
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

    private static int ReadPositiveInteger(string[] args, string name, int fallback)
    {
        var value = ReadArgument(args, name);
        if (value is null)
        {
            return fallback;
        }
        if (!int.TryParse(value, out var parsed) || parsed <= 0)
        {
            throw new InvalidOperationException($"参数 {name} 必须是正整数");
        }
        return parsed;
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
}
