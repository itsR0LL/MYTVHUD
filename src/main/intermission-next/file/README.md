# 新版赛间 OBS 静态输出

此目录是新版赛间播出的隔离静态输出实现。

- `index.html`：正式入口，只读取 `/api/intermission-next` 与 `intermission-next-state`，拒绝预览消息。
- `preview.html`：管理端预览入口，不连接 API 或 Socket。URL 必须提供精确的 `parentOrigin` 查询参数，并且只接收该来源父窗口发出的预览消息。

## 精确输入

- Socket.IO 事件：`intermission-next-state`
- 预览窗口消息类型：`intermission-next-preview-state`
- 输入对象：`IntermissionNextOutputPayloadV1`
- 画布：`1920 × 1080`

正式输入合同以以下共享文件为唯一依据：

- `src/shared/intermission-output-next/output.ts`
- `src/shared/intermission-page-data-next/view-model.ts`
- `src/shared/intermission-transition-next/transition-state.ts`
- `src/shared/intermission-background-next/background-state.ts`
- `src/shared/intermission-background-next/assets.ts`
- `src/shared/intermission-next/contracts.ts`

预览消息结构必须为：

```text
{
  type: "intermission-next-preview-state",
  payload: IntermissionNextOutputPayloadV1
}
```

## 输出边界

- 页面数据更新只刷新文字和组件，不以 `payloadRevision` 重播入场动画。
- 只有 `playRevision` 变化代表一次新的播放。
- 页面实际阶段始终由 `transition`、`transitionTimings` 和服务端时间计算；断线重连后恢复当前阶段。
- 页面透明度、位移、模糊和品牌遮罩直接使用运行时阶段进度，不叠加固定 CSS 时长；背景双视频透明度只使用 `background.transition.durationMs` 计算的进度。
- 背景层持续存在，并严格使用载荷中的 `background` 与 `backgroundAssets`。本目录不提供视频地址、声音、循环或切换时长默认值。
- 地图图片严格使用载荷中的 `mapMedia`。每个展示位只保留 `current` 与 `preload` 两张图片；交叉淡化由 `crossfadeStartedAtMs`、`crossfadeDurationMs` 与服务端时间逐帧计算。每个非空 `frameEndAtMs` 到达时，整页只获取一次最新状态；获取失败时保留预载最终画面。主素材失败后只尝试 `fallbackUrl`，再次失败保留地图文字。
- 页面 DOM 的重建只服从当前 `pageData`、当前页面布局以及该页面使用的地图媒体文件对；时钟、背景、转场、载荷版本和地图媒体时间变化不会清空页面。
- 品牌转场和页面赛事标志只保留独立 SVG 挂点，不绑定任何具体图形职责。
- 正式入口不会构造缺失的赛事数据。图片或视频失败时保留最终文字信息。
- 系统启用减少动态效果时，不播放位移和遮罩动画，直接显示当前最终状态。

## 五个完整页面

- `warmup`：比赛开始前的暖场信息与 BP 准备状态。
- `bp`：固定 BP 核心画面和导播触发后的完整动画。
- `map_break`：本图最终比分、对应本图媒体、真实逐回合比分时间线、双边选手数据、地图序列、下一张地图及其媒体、地图间倒计时。
- `series_end`：获胜方、系列赛最终比分、已完成地图结果、使用 `sequence` 媒体的地图历史、双方累计数据、下一场状态。
- `standby`：上一场结果、下一场配置与 BP 状态、双方信息、已知倒计时或未知时间待机。当前页面数据合同没有地图字段，因此不会从 `mapMedia` 推断待机地图。

页面不会根据缺失数据自行构造比分、队伍、地图或时间。
