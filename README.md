# 历史世界地图（Historical World Map）

一个在本地运行的 2D 历史世界地图应用：拖动时间轴即可浏览 54 个历史快照（约公元前 123000 年至公元 2010 年）的疆域边界，并用颜色表达**历史政权身份**——同一政权跨年份保持同一颜色，政权更替显式可辨。

技术栈：React 19 + TypeScript 5.9 + Vite 8 + MapLibre GL 6。

## 功能

- **时间轴**：可拖动、播放/暂停、上一年/下一年、直接输入年份、当前年份显示。年份间距极不均匀，时间轴按快照索引（0–53）工作。
- **按年加载**：任意时刻只加载当前年份数据，常驻缓存上限 6 个年份（LRU 淘汰）。
- **政权身份配色**：颜色表达历史政权身份而非单纯国名，冻结的颜色注册表保证历史颜色稳定不漂移。
- **政权关系层**：附庸、占领等关系以 sidecar 数据（每年一个文件）提供，供后续图层面板与事件视图使用。
- **可扩展架构**：已为后续的国家搜索、国家详情、历史事件、3D 地球与 AI 问答预留结构与数据入口。

## 快速开始

```bash
npm install

npm run data:fetch      # 从上游下载原始 GeoJSON 到 data/raw/（约 68 MB）
npm run data:build      # 生成 public/data/（manifest / entities / years/*.json）
npm run data:relations  # 生成 public/data/relations/*.json（政权关系 sidecar）
npm run data:verify     # 数据完整性断言（AR1–AR12）

npm run dev             # 本地开发服务器
npm run build           # 生产构建（tsc -b && vite build）
npm run preview         # 预览生产构建
```

`data/raw/`（上游原始数据）与 `public/data/`（构建产物）均可由上述命令重新生成，因此不随仓库分发。

## 目录结构

```
src/
  App.tsx                    应用外壳与全局状态（当前年份）
  components/MapView.tsx     MapLibre 地图视图（单 source + setData 更新）
  components/TimeBar.tsx     时间轴与年份控件
  data/                      数据入口：snapshots.ts / loadYear.ts / types.ts
  map/                       地图样式与经纬网

scripts/
  fetch-data.mjs             下载上游 GeoJSON
  build-data.mjs             量化、身份解析、生成 public/data/
  verify-data.mjs            数据断言（AR1–AR12）
  lib/                       身份、颜色、关系与快照处理模块

data/
  identity/                  政权身份与颜色注册表（人工维护，随仓库分发）
  relations/                 关系规则与来源登记（人工维护，随仓库分发）
  geo/                       地理实体与极地规则（人工维护，随仓库分发）
  raw/                       上游原始 GeoJSON（本地生成，不入库）

tests/                       数据与关系层断言
docs/、reports/              设计与验证记录
```

## 数据来源

- 上游项目：[`aourednik/historical-basemaps`](https://github.com/aourednik/historical-basemaps)（`master` 分支的 `geojson/*.geojson` 与 `index.json`）。
- 本项目通过 `npm run data:fetch` 获取数据（优先 jsDelivr CDN，回退 `raw.githubusercontent.com`）。
- 在上游数据之上，本项目自行构建了坐标量化流水线、政权身份与配色注册表、政权关系层；这些派生内容与上游数据文件相互独立。

## 许可说明

- 上游仓库在**仓库级**声明 GPL-3.0（`LICENSE` 为 GPLv3 全文）。
- 上游的 README 与 CONTRIBUTING **未针对 GeoJSON 数据本身单独声明许可**；该问题在上游仓库的公开讨论中仍未结论（issue #3 已关闭且未采纳数据专用许可，issue #74 目前仍为 open）。
- 本仓库**未附带 LICENSE 文件，也未就本项目代码与派生产物单方面声明许可条款**。
- 因此，使用或再分发上游数据前，请自行核对上游仓库的最新声明与适用条件；本项目不对上游数据的授权状态作出任何断言。
