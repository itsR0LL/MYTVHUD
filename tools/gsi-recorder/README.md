# MYTVHUD GSI 完整录制器

这是一个独立的 Windows 录制工具，用来保存 CS2 发送的原始 GSI 请求。

## 使用方法

1. 双击 `MYTVHUD-GSI完整录制器.exe`。
2. 在资源管理器中找到 `game\bin\win64\cs2.exe`，把它拖进录制器的黑色窗口，然后按 Enter。
3. 等待窗口显示“监听地址”后，再通过完美平台启动 CS2。
4. 播放需要分析的 DEMO。
5. 回到录制器窗口按 Enter 停止。
6. 将桌面 `MYTVHUD-GSI完整记录` 文件夹内生成的 `.jsonl` 文件交给 Codex。

录制器使用独立的 `5032` 端口，不会占用 MYTVHUD 的 `5031` 端口。运行时会临时写入
`gamestate_integration_mytvhud_recorder.cfg`，正常停止后自动删除该配置。

如果 CS2 在启动录制器之前已经运行，必须重新启动 CS2，新增的 GSI 配置才会生效。
