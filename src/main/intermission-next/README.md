# 新版赛间播出隔离模块

本目录承载新版地图间播出、系列赛结束和赛事待机实现。模块通过依赖注入读取比赛运行态、当前地图道具回放和权威时钟；管理端 `/intermission` 已挂载新版工作区，正式 OBS 输出统一使用 `/intermission-next`。

## 模块

- `assets/brand`：MYTVHUD 小鸡透明标志、应用图标和 Counter-Strike 2 横向字标真 SVG。
- `assets/maps`：十张地图的本地原图、优化图、回退图和固定来源清单。
- `file`：新版 OBS 浏览器页面。
- `map-media`：严格读取地图清单并按权威时间生成媒体帧。
- `routes`：注册 `/intermission-next`、状态 API、静态资源和背景视频 Range 路由。
- `state`：协调布局、页面流程模板、全局背景、正式转场、地图媒体与正式输出。

## 正式接入边界

现有入口文件解除文件占用后，由入口所有者完成以下连接：

1. 创建 `IntermissionNextStateCoordinator`，显式注入 settings、additional、正式运行状态、背景素材、真实比分时间线、地图媒体、发布器和权威时钟。
2. 调用 `registerIntermissionNextRoutes`，显式传入输出、品牌、地图绝对目录以及精确的背景素材注册表；`stateProvider` 必须在每次调用时读取协调器的最新权威时间状态，不能返回固定缓存。
3. 发布器使用 `INTERMISSION_NEXT_SOCKET_EVENT` 发送协调器生成的完整 payload。
4. 管理页面挂载 `IntermissionNextWorkspace.vue`，预览地址使用 `/intermission-next/preview`，并将模板保存、布局应用和背景命令分别连接到主进程。
5. 正式 OBS 地址统一为 `/intermission-next`；旧 `/intermission` 输出、静态文件和旧编辑面板已删除。

不得从资源标识推导文件路径、MIME、视频编码、转场时长或地图媒体时长。未取得用户明确配置时，协调器返回 `unconfigured`，不会用隐藏默认值替代。

## 正式输出规则

- 只读取 `onAirProgram`，不读取 `preparedProgram`。
- 普通数据修订不增加 `playRevision`，不重播正式转场。
- 管理端预览使用独立 `INTERMISSION_NEXT_PREVIEW_MESSAGE`，不发布到正式 OBS。
- 页面布局跨比赛保存，比赛重置不清除。
- 全局背景不写入单独页面布局。
- 浏览器只保持当前背景与预载背景、当前地图图与预载地图图。
- 地图间页面的地图序列为每张比赛地图分别提供 `sequence` 图片时间线；单个展示位仍只保留当前图与预载图，并按统一绝对时间交叉淡化。
- 图片加载失败先使用本地回退图，再退化为文字，不阻塞页面和倒计时。

## 尚需用户提供的配置

- 三段背景视频的完整路径及媒体信息。
- 每段背景是否保留声音、是否无缝循环。
- 全局背景交叉淡化时长。
- 五段正式转场时长。
- 地图轮播间隔与地图交叉淡化时长。
- 品牌资源的正式动画职责确认。
- 选手突出规则。
