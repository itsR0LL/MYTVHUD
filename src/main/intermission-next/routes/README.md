# 新版赛间输出路由

此模块只负责注册新版赛间输出所需的 HTTP 路由，不创建 Express 服务，也不修改现有 GSI 服务。

调用方必须显式提供：

- `outputDirectory`：`file` 静态输出目录的绝对路径。
- `brandDirectory`：品牌 SVG 目录的绝对路径。
- `mapDirectory`：地图清单与图片目录的绝对路径。
- `stateProvider`：返回 `IntermissionNextOutputPayloadV1` 的同步或异步函数。
- `backgroundFileRegistry`：以精确 `assetId` 为键、包含绝对文件路径和 MIME 类型的只读 Map。

模块注册：

- `/intermission-next`
- `/intermission-next/preview`
- `/intermission-next/app.js`
- `/intermission-next/runtime.js`
- `/intermission-next/style.css`
- `/intermission-next/assets/brand/*`
- `/intermission-next/assets/maps/*`
- `/api/intermission-next`
- `/intermission-next/background/:assetId`

背景响应复用 `streamBackgroundVideoFile`，支持完整响应、HEAD 和单段 Range。模块不会从 `assetId` 推导文件路径，也不会推断视频 MIME、编码或素材标识。

主服务发布状态时应使用本模块重新导出的 `INTERMISSION_NEXT_SOCKET_EVENT`，本模块不创建新的 Socket 事件名。
