# 赛间播出地图素材

本目录收录 `src/shared/bp.ts` 当前十张地图对应的本地展示资源。运行时只能读取本目录文件，不依赖外部网络。

## 来源

- 上游仓库：`https://github.com/MurkyYT/cs2-map-icons`
- 上游分支：`main`
- 固定提交：`7062c5213e7ce34c0fa4d015a777890f36ae353d`
- 提交作者：`MurkyYT`
- 提交时间：`2026-07-29T02:41:20Z`
- 提交说明：`chore: manifest 7357001356549703767`
- 映射元数据：`data/available.json`
- 映射元数据 SHA-256：`a8bbe7ca59a028850a33b65fe1e4d0918de90713b2a3948eef96a17048316973`

地图图标、雷达和缩略图的权利归 Valve Corporation 所有；上游仓库用于自动提取并公开游戏仓库中的资源。

## 目录约定

每张地图包含以下三类文件：

- `display/*.png`：上游原始 1920×1080 PNG，保留全部可用画面，用于大型地图展示、缓慢平移、缩放与交叉淡化。
- `component/*.jpg`：由对应展示图生成的 640×360 JPEG，使用高质量双三次缩放和质量 84 编码，用于小型地图条或管理端预览。
- `fallback.png`：上游原始 512×512 透明地图图标，用于展示图缺失或加载失败时的明确回退。

`manifest.json` 保存合同名称、逐文件上游路径、固定提交下载地址、本地路径、尺寸、字节数和 SHA-256。组件图还记录其对应的原始展示图。

## 覆盖范围

| 地图 ID | 项目名称 | 展示图 | 组件图 | 回退图 |
| --- | --- | ---: | ---: | ---: |
| `de_ancient` | Ancient | 5 | 5 | 1 |
| `de_anubis` | Anubis | 6 | 6 | 1 |
| `de_dust2` | Dust2 | 4 | 4 | 1 |
| `de_inferno` | Inferno | 5 | 5 | 1 |
| `de_mirage` | Mirage | 5 | 5 | 1 |
| `de_nuke` | Nuke | 5 | 5 | 1 |
| `de_overpass` | Overpass | 6 | 6 | 1 |
| `de_vertigo` | Vertigo | 5 | 5 | 1 |
| `de_cache` | Cache | 5 | 5 | 1 |
| `de_train` | Train | 5 | 5 | 1 |

合计 51 张原始展示图、51 张组件图和 10 张回退图。
