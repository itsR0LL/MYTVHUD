# MYTVHUD 小鸡矢量标志来源与结构

## 本地来源

- 原始像素源：`src/main/logo.png`
- 交叉核对文件：`build/icon.svg`
- 原始像素尺寸：256 × 256

`build/icon.svg` 的实际内容是一个指向 `icon.png` 的 `<image>`，没有可复用的矢量路径。因此本目录的 `mytvhud-chicken-mark.svg` 以 `src/main/logo.png` 的上半部小鸡电视标志为唯一图形依据，没有复用或嵌入该 PNG。

## 重绘范围

保留：

- 黑色天线；
- 蓝色电视外壳；
- 橙色内部面板；
- 白色小鸡轮廓。

删除：

- 下方 `MYTV HUD` 字样；
- 白色圆角应用底板；
- 底板阴影。

## 重绘方法与误差

源图只有 256 × 256 像素，没有原始矢量母版。重绘时读取源图的实际像素边界与颜色：

- 电视彩色区域的可见边界约为 `x=51..204`、`y=51..156`；
- 天线深色区域约为 `x=82..147`、`y=5..51`；
- 蓝色主体取样值包含 `#1a91db`；
- 橙色区域取样值包含 `#f9ca5b`、`#ecad37`、`#e18e3c`；
- 小鸡主体取样值为 `#fcfcff`。

电视外壳和橙色区域使用像素色域的外轮廓重新拟合为平滑路径；被小鸡遮挡的内部填充只延伸到已测得的色域外包络，再由小鸡路径覆盖。小鸡轮廓来自电视外包络内部高亮像素的轮廓点，使用圆角描边消除源图抗锯齿产生的单像素锯齿。由于源图分辨率有限，边缘与原位图存在约 1–2 个源像素的拟合误差；没有添加源图中无法核对的羽毛、眼睛或文字细节。

## 可动画分组

SVG 保留以下稳定分组与路径 ID：

- `mytvhud-chicken-mark`
- `antenna`
  - `antenna-left`
  - `antenna-right`
  - `antenna-base`
- `television`
  - `television-shell`
  - `television-panel-orange`
- `chicken`
  - `chicken-silhouette`

转场可以分别对 `antenna`、`television`、`chicken` 应用 `transform`、`opacity`、`clip-path` 或路径动画。

## 透明与格式边界

`mytvhud-chicken-mark.svg`：

- 不含 `<image>`；
- 不含 `<text>`；
- 不含背景 `<rect>`；
- 不引用外部文件；
- 所有可见图形均由 SVG `<path>` 和渐变定义组成；
- 根节点使用紧边界 `viewBox="48 4 160 155"`，适合小尺寸组件和全屏转场缩放。

## 白色圆角底板应用图标

`mytvhud-chicken-app-icon.svg` 使用与 `mytvhud-chicken-mark.svg` 相同的天线、电视外壳、橙色面板和小鸡路径，并在 256 × 256 画布中增加：

- `application-icon-background`：256 × 256、圆角半径 32 的纯白矢量底板；
- `application-icon-mark`：将纯标志等比放入底板安全范围的组合层；
- 独立的应用版天线、电视和小鸡分组 ID。

应用图标不包含原位图下方的 `MYTV HUD` 字样、位图阴影或任何外部图片。四个画布角位于圆角底板外，继续保持透明。

当前只提供品牌资源本身，不把透明标志、应用图标或 Counter-Strike 2 字标绑定到具体页面或动画职责；最终使用职责等待用户确认。

# Counter-Strike 2 横向字标来源与结构

## 本地来源

- 转换说明：当前 SVG 由旧版像素字标重新描摹，运行时只使用本目录中的矢量资源。
- 原始像素尺寸：805 × 166
- 原始非透明像素边界：`x=0..804`、`y=0..165`

`counter-strike-2-wordmark.svg` 只读取上述本地 PNG 的实际透明度、灰度和连通轮廓，不使用字体文件，也不嵌入原 PNG。

## 分组依据

原图透明像素可精确分为六个连通区域：

- 顶部 `COUNTER` 由三个相邻连通区域组成；
- 底部 `STRIKE` 由两个相邻连通区域组成；
- 数字 `2` 是贯穿上下高度的独立连通区域。

SVG 将它们收敛为三个稳定动画组：

- `counter`
  - `counter-outline`
  - `counter-depth`
  - `counter-face`
- `strike`
  - `strike-outline`
  - `strike-depth`
  - `strike-face`
- `number-2`
  - `number-2-outline`
  - `number-2-depth`
  - `number-2-face`

`COUNTER`、`STRIKE` 和数字 `2` 可以分别执行进入、退出、位移、缩放、透明度或裁剪动画。

## 矢量化方法

每个动画组按源图像素生成三层闭合复合路径：

1. 使用透明度轮廓形成黑色外轮廓层；
2. 使用中高灰度轮廓形成灰色立体层；
3. 使用高亮灰度轮廓形成白色主体层。

各层使用 `fill-rule="evenodd"` 保留 `O`、`R`、`2` 等字形内部镂空。轮廓点由源图边缘直接提取并以小于一个源像素的折线容差压缩，不依赖系统字体或第三方字标字体。

原图自身包含抗锯齿、半透明黑边和低像素灰度过渡，SVG 将其收敛为黑、灰、白三组实路径及纵向渐变。因此细微阴影和抗锯齿强度不会逐像素相同，但字形边界、斜切轮廓、内部镂空与三层关系均来自本地源图，没有补写源图中不存在的字形细节。

## 透明与格式边界

`counter-strike-2-wordmark.svg`：

- 不含 `<image>`；
- 不含可见 `<text>`，可访问名称只使用不参与绘制的 `<title>` 与 `<desc>`；
- 不含背景 `<rect>`；
- 不含外部 `href`；
- 不依赖本地或网络字体；
- 所有可见字形均由 SVG `<path>` 与内部渐变构成；
- 保留原始 `viewBox="0 0 805 166"`，便于按源图比例替换现有位图。
