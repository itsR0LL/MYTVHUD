# MYTVHUD Manager

MYTVHUD Manager 是一套面向中文 CS2 赛事导播的本地 HUD 管理工具。项目通过 CS2 Game State Integration（GSI）接收比赛数据，并向 OBS 提供浏览器源画面。

项目默认在本机运行，不依赖远端更新服务，当前转播流程仅面向 OBS。

## 主要功能

- 管理赛事、地图、战队与选手资料。
- 接收并处理 CS2 GSI 实时数据。
- 提供比分栏、选手状态、雷达和系列赛信息等 HUD 内容。
- 自定义 CT、T 阵营颜色及部分 HUD 显示选项。
- 自动将 GSI 配置写入 CS2 配置目录。
- 使用本地 JSON 文件保存数据。
- 导出和导入战队、选手数据包，便于不同导播之间交接资料。
- 通过 OBS 浏览器源完成转播画面合成。

## 安装

1. 在项目的 [Releases](https://github.com/itsR0LL/MYTVHUD/releases) 页面下载 Windows 安装包。
2. 运行 `mytvhud-<版本号>-setup.exe`。
3. 按照安装向导完成安装并启动 **MYTVHUD Manager**。

当前安装包未配置数字签名。如果 Windows SmartScreen 显示安全提示，请确认文件来源无误后选择“更多信息”并继续运行。

## 使用方法

### 1. 配置战队、选手和比赛

先在管理器中录入战队和选手资料，再创建本场比赛并选择地图。

- 战队的游戏内名称需要与 GSI 数据中的队伍名称一致。
- 选手的 Steam ID 需要与 GSI 数据中的 `steam64id` 一致。
- 头像、队标等图片会作为本地数据的一部分保存。

### 2. 配置 GSI

打开“菜单”页面，执行“配置 GSI”，然后在文件选择窗口中选中 CS2 的 `cs2.exe`。管理器会将配置文件写入游戏的 `game\csgo\cfg` 目录。

### 3. 打开 HUD

启动 CS2 并进入观察者模式，在管理器中打开 HUD 映射。需要隐藏游戏原生 HUD 时，可在 CS2 控制台执行：

```text
cl_draw_only_deathnotices 1
```

### 4. 配置 OBS

在 OBS 中新增“浏览器”源，并填写：

```text
http://localhost:5031/overlay
```

建议将浏览器源设置为 `1920 × 1080`，屏幕为2K用户设置为 `2560 × 1440`，并将其放置在场景的最上层。MYTVHUD Manager 必须保持运行，否则 OBS 无法访问本地 HUD 页面。

## 数据存储与迁移

本地数据目录为：

```text
%APPDATA%\mytvhud\Database
```

目录内包含：

| 文件 | 内容 |
| --- | --- |
| `matchs.json` | 比赛与地图数据 |
| `teams.json` | 战队数据 |
| `players.json` | 选手数据 |
| `settings.json` | 管理器和 HUD 设置 |
| `additional.json` | 扩展数据 |

旧版 `%APPDATA%\voidhud\Database` 中的数据会在首次启动时迁移到新目录，已存在的新数据不会被覆盖。

设置页面提供以下数据工具：

- “打包数据”会将 `players.json` 和 `teams.json` 写入 `.mytvhud` 数据包。
- “导入数据”会覆盖本机现有的战队和选手数据。
- 导入前，程序会在 `Database\Backups` 中自动备份原有数据。

## 本地端口

MYTVHUD Manager 在本机 `5031` 端口提供 GSI、数据接口、实时通信和 HUD 页面。该服务用于本地导播流程，不应直接暴露到公网。

## 开发环境

项目使用 Electron、Vue 3、TypeScript、electron-vite 和 pnpm。

准备环境：

- Node.js
- pnpm
- Windows（生成 Windows 安装包时需要）

获取代码并安装依赖：

```powershell
git clone https://github.com/itsR0LL/MYTVHUD.git
Set-Location MYTVHUD
pnpm install
```

常用命令：

```powershell
# 启动开发环境
pnpm dev

# 执行主进程和前端类型检查
pnpm run typecheck

# 构建应用代码
pnpm run build

# 生成 Windows 安装包
pnpm run build:win
```

也可以使用项目内的打包脚本：

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\package-win.ps1
```

打包结果默认生成在 `dist` 目录。

## 项目结构

```text
src/
├─ main/                 Electron 主进程、GSI、本地服务和数据库
├─ preload/              主进程与渲染进程之间的安全接口
├─ renderer/             Vue 管理界面
└─ gamestate_integration_mytvhud.cfg
                         CS2 GSI 配置模板
build/                   应用图标和打包资源
scripts/                 项目维护脚本
electron-builder.yml     安装包配置
electron.vite.config.ts  构建配置
```

## 相关项目与致谢

- 原项目作者：`@NocYnTwoC`（Occasionally Online）
- 交流社群：[🐧QQ群聊](https://qm.qq.com/q/piGO3Kv3vG)
- 参考项目与社区：`cshuds.com`、`OpenHUD`、`drweissbrot/cs-hud`、`mycstv.cn`
