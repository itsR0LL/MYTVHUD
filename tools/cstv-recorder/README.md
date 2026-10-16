# MYTVHUD CSTV 自动验证器

该工具用于验证完美世界竞技平台观战流能否被 MYTVHUD 独立读取。工具只读取完美平台已经生成的
`pwa_*.log`，不会写入 CS2 配置、注入 DLL、读取游戏内存或修改游戏进程。

## 使用顺序

1. 先通过完美平台启动 CS2，但不要进入观战席。
2. 双击 `MYTVHUD-CSTV验证器.exe`。
3. 等待窗口显示已经定位 `pwa_*.log`。
4. 创建单挑房并允许观战，让导播进入观战席。
5. 等待窗口显示 CSTV 会话抓取完成。
6. 回到验证器窗口按 Enter 停止。
7. 将桌面 `MYTVHUD-CSTV验证记录` 中最新的会话目录交给开发者分析。

验证器必须在导播进入观战席之前启动，因为当前需要确认 `start` 对象是否只在新会话建立阶段可读。

## 输出内容

- `diagnostics.json`：HTTP 状态、重定向次数、同步字段及抓取结果。
- `sync.sanitized.json`：不包含会话令牌值的同步摘要。
- `start.bin`：成功取得的 CSTV 启动数据。
- `full-*.bin`：成功取得的完整帧。
- `delta-*.bin`：连续增量帧。

完整 Broadcast 地址不会写入输出文件。会话目录只使用地址的 SHA-256 摘要前 12 位作为标识。

## 开发命令

```powershell
dotnet build .\tools\cstv-recorder\MYTVHUD.CSTVRecorder.csproj -c Release
```

生成独立 Windows EXE：

```powershell
dotnet publish .\tools\cstv-recorder\MYTVHUD.CSTVRecorder.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

如果自动定位日志失败，可传入经过确认的完整日志路径：

```powershell
MYTVHUD-CSTV验证器.exe --log "E:\完整路径\pwa_账号_日期.log"
```
