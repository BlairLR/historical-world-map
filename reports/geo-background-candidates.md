# Geo background candidate 分析 —— 可固定补全对象筛选（只读分析，未实施）

- 阶段定位：P4.4-7 前置分析（**本阶段不实施**，仅输出候选、推荐、来源年份、风险与影响面）
- 授权：User said (m06148)「继续进行 geo background candidate 分析…按 P4.4-6 Antarctica 的 data/geo 注入方案，筛选可以固定补全的自然地理对象。**不修改代码和数据**。**不考虑历史真实性，只考虑地图显示逻辑**。输出：候选对象 / 推荐是否加入 data/geo / 几何来源年份 / 风险 / 如果加入会影响哪些文件。**不要执行实施**。」
- 分析日期：2026-10-05
- 输入：`reports/geo-background-audit.md`（43,788 B / SHA-256 `99724178BA220A4BAE9AED8EEA51B9164335ABC921D9C2DE16A86B38A51181C3`）、`reports/p4.4-6-antarctica-data-implementation.md`、`data/geo/*`、`scripts/build-data.mjs`、`scripts/verify-data.mjs`、`tests/relations/run.mjs`
- 只读保证：8 个一次性探针（`.tmp-cand-*.mjs`）跑完即删；113 个受保护文件与 P4.4-6 基线逐文件 bytes+SHA-256 比对 **0 变化**（§8）

---

## 0. 结论摘要

三层建议（「推荐」＝可以按 P4.4-6 的 `data/geo` 注入方案固定补全；**Tier 1 是本阶段唯一建议立即实施的范围**）：

| 层 | 对象 | 缺失年份 | 几何来源年 | 建议 |
|---|---|---|---|---|
| **Tier 1** | **Sardinia（撒丁岛）** | **1783（1 年）** | **-700** | **推荐加入** |
| **Tier 1** | **Novaya Zemlya（新地岛，南北两岛）** | **700、1815（2 年）** | **600（北岛 + 南岛各 1 个要素）** | **推荐加入** |
| **Tier 1** | **Hawaii（夏威夷群岛）** | **-200、-100（2 年）** | **-5000（3 岛，或 -400 与相邻年一致）** | **推荐加入** |
| Tier 2 | Fiji（斐济） | 24 年 | 1878 | 有条件（先裁定属性中性化与反经线渲染） |
| Tier 2 | New Caledonia（新喀里多尼亚） | 53 年 | 1938 | 有条件（注入年份量大、属性非 null） |
| Tier 3 | Franz Josef Land（法兰士约瑟夫地） | 53 年 | 仅 1920 内嵌于 USSR 巨要素 | 不建议本期（需环级裁剪新能力） |
| Tier 3 | Kerguelen / South Georgia / Falklands / Galápagos | 各 54 年 | **无**（上游 raw 亦无几何） | 不建议（需外部数据源＝新授权） |

- Tier 1 合计影响：**5 个年份文件、5 个 sidecar、3 个新资产、+11 个 feature**（Sardinia +1、Novaya Zemlya +4、Hawaii +6），磁盘增量约 **0.4 MB**（资产 ≈0.2 MB + 注入副本 ≈0.2 MB）。
- Tier 1 的共同特征：**缺口年份该处「完全没有几何」**（点内测试与 bbox 顶点普查双重确认），且存在**自包含、`NAME` 为 null、单要素/可用单 MultiPolygon 表达的专用几何**可用作来源 → 不产生身份、颜色、遮挡副作用。
- **重要前提**：即便资产就绪，**当前管线不会注入它们**——R-A 的触发条件是「该年极地要素数 = 0」，而 54 年中只有 -5000 满足（§2 M1）。因此本方案的推荐都隐含「必须先做一次 §5 的管线泛化改动」。
- 审计 C2 的 38 个「永续陆地但身份在 `UNNAMED` ↔ 政权间切换」对象（格陵兰、斯瓦尔巴、冰岛、新西兰两岛、吕宋、西西里、撒丁岛等）**不属于**本方案：它们每一年都有几何，缺的是**颜色语义的稳定性**而非陆地，注入反而会把政权色盖成灰色 → 归入 OPEN **G-O1（neutral land base layer）**，本阶段不处理。
- 审计 C4（政权边界/扩张/殖民导致的正常变化）用户已明确排除，本阶段不涉及。

---

## 1. 范围与方法

只读探针（全部为一次性脚本，已删除；口径与命令见 §8）：

| 探针 | 方法 | 回答的问题 |
|---|---|---|
| `.tmp-cand-src.mjs` | 28 个对象 × 54 个上游 raw 文件，代表点 ±r° 窗口顶点数 ≥3 视为「该年有几何」，并取「包含代表点且面积最小」的要素 | 上游有哪些可用几何、最专用几何是哪一年 |
| `.tmp-cand-rich.mjs` | 专用度 = 窗口顶点/总顶点 ≥ 0.5；输出最丰富/最紧凑要素 + 专用并集 bbox | 哪些对象存在「自包含单要素」几何（可零副作用提取） |
| `.tmp-cand-gap.mjs` | 对缺口年份在**构建产物**上做射线法点内测试（含内环洞） | 「窗口无顶点」是否等于「该处真的没有几何」 |
| `.tmp-cand-bbox.mjs` | 对每个对象紧 bbox 做逐顶点普查，raw 与 built 各 54 年 | 对象是否**上游根本没有几何**（排除点位假阴性） |
| `.tmp-cand-objsrc.mjs` | 列出指定年份 bbox 内的候选源要素（id / entityId / NAME / 顶点 / 多边形 / 面积 / bbox / precision） | 具体「几何来源年份 + 要素」的可执行结论 |
| `.tmp-cand-trigger.mjs` | 复现 `build-data.mjs` 的极地判据（`minLat <= -89.9`），逐年统计 `polarFeatures` | 当前 R-A 触发条件在哪些年份成立 |
| `.tmp-cand-name.mjs` | 用 `%TEMP%\geo-features.json`（17,439 条 feature-year 普查）统计某 NAME 出现在 `name/subject/partOf/abbrev` 的规模 | 「把资产 NAME 加进 `nameMatch`」的全局副作用有多大 |
| `.tmp-cand-verify.mjs` | 复刻 `tests/relations/run.mjs:80-90` 的 `protectedPaths()`，与 `%TEMP%\p446-baseline.txt` 比对 | 本阶段是否动了任何生产文件 |

判据口径说明：**「缺失」= 该年构建产物中该对象所在位置没有任何多边形覆盖（点内测试射线法，含洞）**；对群岛/多点对象用多个代表点，且与 bbox 顶点普查交叉验证（本次即因此修正了 Franz Josef Land 的初判，见 §4.6）。不做「全库缺失陆地」的系统扫描（无参考陆地掩膜），候选清单沿用审计的 48 对象集合。

---

## 2. 机制发现（决定「影响哪些文件」的五条）

### M1　R-A 触发条件是「年级极地判据」，不是「对象级在场判据」
`scripts/build-data.mjs:531`：`if (polarFeatures === 0) { … convertFeature(asset.features[0]) … }`。
逐年实测 `polarFeatures`（`minLat <= poleLatitude = -89.9`）：

| 年份 | features | polarFeatures | R-A |
|---|---|---|---|
| 1492 | 1946 | 1 | SKIP |
| 1783 | 641 | 1 | SKIP |
| 1815 | 436 | 1 | SKIP |
| 1938 | 254 | 1 | SKIP |
| 700 | 253 | 1 | SKIP |
| -100 | 233 | 1 | SKIP |
| -200 | 183 | 1 | SKIP |
| **-5000** | **279** | **0** | **FIRES**（minLat 仅 -55.05） |

结论：**除 -5000 之外的 53 年永远不会触发补全**；任何新增对象的 `enforcePresence` 在这些年份都是死代码。要落地本方案，必须把触发条件改为「该对象/该年是否在场」。

### M2　资产只取 `features[0]`，并断言「恰好 +1 个要素」
`scripts/build-data.mjs:537-540`：`convertFeature(asset.features[0])` 后断言 `features.length === before + 1`，否则 throw「资产几何量化后退化」。
影响：多岛对象（新地岛南北岛、夏威夷三岛、塞浦路斯现代南北分裂）若用「一岛一要素」资产，会直接 throw。
**两个可选解法**（本报告推荐 A）：
- **A（不改管线）**：构建资产时把该对象的全部多边形合并进**一个 MultiPolygon 特征**——这正是南极洲资产的做法（1 feature / 6 polygons / 1,092 顶点）。
- **B（改管线）**：遍历 `asset.features`，把断言放宽为「至少 +1」。

### M3　非极地资产即使 `NAME = null` 也不会被当成地理实体
`scripts/build-data.mjs:471-484`：`isGeographic = isPolar || [name, subject, PARTOF, ABBREVN].some(t => nameMatch.has(t.trim().toLowerCase()))`。
注入要素若既非极地（撒丁岛、新地岛、夏威夷都不触及 -89.9）又 `NAME = null`，`isGeographic = false` → 落入 `build-data.mjs:506-507` 的 `totalUnnamedKey++`（「无 key feature」计数）。颜色**恰好**仍是 `UNNAMED_COLOR #9aa0a6`（`L481-482` 默认值），但语义错位：它被计入「身份缺失」度量、不计入 `geographicFeatures`（汇总日志的「归一要素」数）、且不受 `verify-data.mjs` AR10 约束。
→ 需要给 `convertFeature()` 增加**显式地理实体标记**（例如 `convertFeature(f, { geographic: true })` 或配置字段），使 `isGeographic` 不再依赖「极地 ∨ 名称匹配」。

### M4　把资产 NAME 加进 `nameMatch` 的全局副作用（量化）
`nameMatch` 的匹配对象是 `name / subject / PARTOF / ABBREVN` 四字段的**精确**匹配，作用域是**全库所有年份的所有要素**。实测（17,439 条 feature-year）：

| NAME | 会被归一为灰色的 feature-year | 涉及年份数 | 主要实体 |
|---|---|---|---|
| `Fiji` | 46 | 12 | `auto:fiji`=46 |
| `Polynesians` | 31 | 18 | `auto:polynesians`=31 |
| `Madagascar` | 26 | 26 | `auto:madagascar`=18、`auto:madagascar#1`=4、`auto:france`=2、`auto:madagascar (france)`=2 |
| `Sardinia` | 19 | 14 | `auto:sardinia`=6、`auto:kingdom of sardinia`=4、`auto:sardinia-piedmont`=3、`auto:sardinia#1`=2、`auto:austrian empire`=2、`auto:spanish habsburg`=1 |
| `Ceylon` | 18 | 17 | `auto:ceylon#1`=8、`auto:ceylon`=4、`auto:sinhalese kingdom(s)`=3+2+1 |
| `Cyprus` | 14 | 14 | `auto:cyprus`=10、`auto:cyprus#1`=4 |
| `Iceland` | 14 | 14 | `auto:iceland`=9、`auto:icelandic commonwealth`=2、`auto:denmark#1`=2、`UNNAMED`=1 |
| `Hainan` | 14 | 14 | `auto:hainan#1`=9、`auto:hainan`=5 |
| `Sicily` | 12 | 11 | `auto:sicily`=4、`auto:kingdom of the two sicilies`=3、… |
| `Cuba` | 11 | 11 | `auto:cuba`=9、`auto:cuba (spain)`=2 |
| `Beothuk` / `Boethuk` | 11 / 3 | 11 / 3 | `auto:beothuk#1`=7、`auto:beothuk`=2、`auto:polynesians`=2 / `auto:boethuk`=3 |
| `Greenland` | 10 | 10 | `auto:greenland#1`=4、`UNNAMED`=3、`auto:denmark#1`=2、`auto:greenland`=1 |
| `Taiwan` | 9 | 9 | `auto:taiwan#2`=5、`auto:taiwan`=2、`auto:taiwan#1`=2 |
| `Ireland` / `Kandy` / `Corsica` | 6 / 6 / 6 | 6 / 5 / 6 | `auto:ireland`=6 / `auto:kandy`=6 / `auto:corsica`=6 |
| `Kingdom of Hawaii` / `Hawaii` | 4 / 1 | 4 / 1 | `auto:kingdom of hawaii`=4 / 1 |
| `Great Britain` / `Sri Lanka` | 2 / 5 | 2 / 5 | `auto:great britain`=2 / `auto:sri lanka`=5 |
| `New Caledonia` | 1 | 1 | `auto:france`=1（1938） |
| `Novaya Zemlya` / `Svalbard` / `Spitsbergen` / `Tasmania` / `Newfoundland` | **0** | 0 | —— |

结论：**`nameMatch` 只能用于「上游政权要素的身份归一」（R-B），不能用于给注入资产贴标签**。资产属性必须像南极洲那样按惯例中性化（7 键保留、值置 null）。这也解释了 P4.4-6 为何把 `NAME` 置 null。

### M5　注入要素追加在数组末尾 → 绘制在最上层
`scripts/build-data.mjs:510-523`：`id: features.length`，注入发生在 `L527` 的所有 raw 要素之后。
- 对 Tier 1 **无遮挡风险**：3 个对象的缺口年份，其位置本来就没有任何多边形（§4 证据），注入只是「补上陆地」。
- 若未来对 C2 类对象（每年都有几何）做类似注入，则会**盖住政权颜色** → 需要遮盖/裁剪能力，当前方案没有（这也是不建议对 C2 使用本方案的原因之一）。

---

## 3. 候选总表（显示逻辑视角）

| 对象 | 存在年数（built） | 缺失年份 | 缺口处是否有几何 | 可用源要素（年 · 形态） | NAME | 推荐 | 主要风险 |
|---|---|---|---|---|---|---|---|
| **Sardinia** | 53/54 | 1783 | 无（点内测试 2 点均未覆盖） | **-700**：29 顶点 / 1 多边形 / 21,927 km² / precision 1 / bbox [8.1595,38.9769,9.7937,41.1844] | null | **推荐** | 低：形状为 29 顶点概化轮廓；1783 年该岛上游未画，注入后为中性灰 |
| **Novaya Zemlya** | 52/54 | 700、1815 | 无（缺口年 bbox 内仅 16 个顶点，属俄大陆海岸） | **600**：北岛 id=187 1,211 顶点 / 46,479 km² / bbox [53.63,73.243,68.931,77.013]；南岛 id=191 782 顶点 / 33,012 km² / bbox [51.395,70.539,57.64,73.422]（均 1 多边形、precision 1） | null / null | **推荐** | 中低：需按 M2-A 合并为单 MultiPolygon 特征；灰岛会覆盖同年 `RU-EMPIRE`/`auto:samoyèdes` 的少量海岸线 |
| **Hawaii** | 52/54 | -200、-100 | 无（Oahu 与大岛两点均未覆盖） | **-5000**：3 个 UNNAMED/null 单要素——8,638 km²/74 顶点、1,356 km²/47 顶点、664 km²/33 顶点；**-400** 同构更粗版：10,579 km²/22、1,988 km²/12、1,631 km²/14（≈40 个其他年份用的就是这一版） | null | **推荐** | 中：三岛合并为单 MultiPolygon；两种来源各有取舍（-5000 形状细但面积偏小约 -17%，-400 面积接近真实但顶点少） |
| Fiji | 30/54 | 24 年（-123000…-500、-1、100、200、300、400、700、800、900） | 无（抽样 2 点均未覆盖） | **1878**（=1880/1914 同几何）：id=224 `auto:fiji` 885 顶点 / 35 多边形 / 19,326 km² / precision 3 / bbox 跨 ±180 | "Fiji" | 有条件（二期） | 高：35 多边形跨反经线；NAME 非 null，加入 `nameMatch` 会归一 46 个 `auto:fiji` feature-year（M4）；24 年注入量 |
| New Caledonia | 1/54 | 53 年 | 无（1938 以外均未覆盖） | **1938**：id=229 `auto:france` 432 顶点 / 9 多边形 / 19,076 km² / precision 3 / bbox [163.616,-22.674,168.131,-19.626] | "New Caledonia" | 有条件（二期） | 高：53 年注入量；属性需中性化；多数年份该处本属 `auto:france` 的空白海面 |
| Franz Josef Land | 1/54 | 53 年 | **1920 有几何但内嵌于巨要素** | 仅 `world_1920.json` id=124 `RU-RSFSR`（NAME "USSR"、precision 3、61 多边形、19,049,848 km²、7,140 顶点）中落在群岛 bbox 的 2,366 个顶点 | "USSR" | 不建议本期 | 高：需环级/连通体裁剪新能力；精度低；无法验证裁剪结果是否仍是该群岛 |
| Kerguelen | 0/54 | 54 年 | 无 | **无** | — | 不建议 | 需外部数据源（新授权） |
| South Georgia | 0/54 | 54 年 | 无 | **无** | — | 不建议 | 同上 |
| Falklands | 0/54 | 54 年 | 无 | **无** | — | 不建议 | 同上 |
| Galápagos | 0/54 | 54 年 | 无 | **无** | — | 不建议 | 同上 |

（C2 类 38 个对象——格陵兰/斯瓦尔巴/冰岛/新西兰两岛/吕宋/棉兰老/苏拉威西/新几内亚/班克斯/北地群岛/弗兰格尔/西西里/撒丁岛等——每年都有几何，**不在本表推荐范围**，见 §5 与 G-O1。）

---

## 4. 逐候选详情与证据

### 4.1 Sardinia —— 推荐（最高优先级）
- 在场：53/54，缺 **1783**。缺口年点内测试 `(9,40)`、`(8.5,39.5)` 均 **NOT COVERED**；相邻的 1800 年同点由 `auto:kingdom of sardinia (Kingdom of Sardinia)` 覆盖（证明判据有效）。
- 源要素（built `public/data/years/world_bc700.json`，共 173 要素）：
  - `id=77` `UNNAMED` / `NAME=null` / precision 1 / **29 顶点 / 1 多边形 / 21,927 km²** / bbox `[8.1595,38.9769,9.7937,41.1844]`（＝整岛，真实面积 24,090 km²）
  - 同 bbox 内 `id=100`（2/38 顶点）＝科西嘉，**不并入**
- 备选源年份：`-1000`/`-1500`/`-2000` 为同一几何；`1530`/`1600` 有同名 `"Sardinia"` 的同几何要素（但 NAME 非 null，不作首选）。
- 实施影响参考：注入 1 个要素 → 该年 `features` +1。
- 风险：**低**。仅两点需记录：(a) 轮廓仅 29 顶点，高缩放级别下形状粗糙；(b) 1783 年该岛在历史上属撒丁王国，但上游未绘制，注入后显示为中性灰（用户已裁定只看显示逻辑，不判历史真实性）。

### 4.2 Novaya Zemlya —— 推荐
- 在场：52/54，缺 **700、1815**。缺口年两岛代表点 `(55.5,72)`/`(62,76)` 均 **NOT COVERED**；缺口年该 bbox 内仅有 16 个顶点（700：`auto:samoyèdes`；1815：`RU-EMPIRE`），属俄大陆海岸而非群岛本体。在场年份交叉验证：1000 年 `(55.5,72)` 由 `UNNAMED` 覆盖、`(62,76)` 由 `UNNAMED` 覆盖 ✓。
- 源要素（built `world_600.json`，共 198 要素）——**同一年同时给出两岛的独立 null 名要素**，是唯一「两岛都自包含」的年份：
  - `id=187` `UNNAMED`/null/precision 1：1,211 顶点 / 1 多边形 / 46,479 km² / bbox `[53.6300,73.2430,68.9310,77.0130]` ＝ 北岛
  - `id=191` `UNNAMED`/null/precision 1：782 顶点 / 1 多边形 / 33,012 km² / bbox `[51.3950,70.5390,57.6400,73.4220]` ＝ 南岛
- 备选：`-5000` 的 `id=270`（368 顶点 / 28,511 km²，南岛）与 `id=271`（500 顶点 / 39,274 km²，北岛），细节略低于 600。
- 建议：按 **M2-A** 把两岛多边形合并成一个 MultiPolygon 特征，资产=1 要素 → 每次注入 +1（而非 +2）。若坚持「一岛一要素」，则需要 M2-B 的管线改动。
- 风险：**中低**。灰岛会与同年 `RU-EMPIRE`/`auto:samoyèdes` 的少量重叠海岸线竞争绘制，但注入要素在上层（M5），且缺口年份群岛本体原本无几何。

### 4.3 Hawaii —— 推荐
- 在场：52/54，缺 **-200、-100**（bbox 顶点普查亦确认这两年是 0 顶点）。缺口年 Oahu `(-157.9,21.4)` 与夏威夷大岛 `(-155.5,19.6)` 均 **NOT COVERED**；1000 年大岛由 `auto:polynesians` 覆盖 ✓。
- 源要素候选：
  - **`world_bc5000.json`**：`id=53`（74 顶点 / 8,638 km² / bbox `[-156.05,19.001,-154.92,20.2577]`）、`id=59`（47 顶点 / 1,356 km²）、`id=60`（33 顶点 / 664 km²）——三者均 `UNNAMED`/`NAME=null`/precision 1。
  - **`world_bc400.json`**：`id=38`（22 顶点 / 10,579 km²）、`id=39`（12 顶点 / 1,988 km²）、`id=40`（14 顶点 / 1,631 km²）——同一分组方式，但顶点更少、面积更接近真实（大岛真实 10,430 km²）。
- 取舍：`-400` 这一版正是 `-123000…-500`、`-1…900` 等 40 余个年份使用的几何（bbox 普查：这些年份 bbox 内稳定为 22/12/14 顶点），用它做来源可保持**时间轴视觉连续性**；`-5000` 形状更细但面积偏小约 17%。
- 建议：按 M2-A 把三岛多边形合并成一个 MultiPolygon 特征；**推荐 -400 版**（连续性优先），并在资产 `_provenance` 中记录该取舍。
- 风险：**中**。(a) 整链单要素源只存在于 `1530/1600`（NAME `"Polynesians"`）与 `1880`（NAME `"Kingdom of Hawaii"`），**都不是 null**，不可用；(b) 若用 1880/1530 的整链几何并把它加进 `nameMatch`，会归一 31 个 `auto:polynesians` feature-year（M4）——**明确不可取**。

### 4.4 Fiji —— 有条件（二期）
- 在场：30/54，缺 24 年（`-123000,-10000,-8000,-5000,-4000,-3000,-2000,-1500,-1000,-700,-500,-1,100,200,300,400,700,800,900` 等；抽样 `-123000/-5000/-1/100/700/900` × 2 点均 NOT COVERED）。在场：1000 年 `(178,-17.8)` 由 `auto:tuʻi tonga empire#1` 覆盖、1900 由 `auto:fiji` 覆盖 ✓。
- 源要素：`world_1878.json` `id=224` `auto:fiji` / `NAME="Fiji"` / precision 3 / **885 顶点 / 35 多边形 / 19,326 km²** / bbox `[-180,-20.6744,180,-16.1525]`（东半 588 顶点、西半 238 顶点，跨反经线）。
- 阻塞项：(a) `NAME` 非 null → 若走 `nameMatch` 路线会归一 46 个 `auto:fiji` feature-year（M4），必须先做 M3 的显式 geo 标记；(b) 35 个多边形跨 ±180°，资产可原样保存，但需要一次渲染实测确认 24 个新注入年份无接缝异常；(c) 24 个年份文件 + 24 个 sidecar 的重新生成。
- 结论：**技术可行但不建议与 Tier 1 同批**；建议在 Tier 1 落地、管线泛化稳定后再评估。

### 4.5 New Caledonia —— 有条件（二期）
- 在场：1/54（仅 1938）。源要素 `world_1938.json` `id=229` `auto:france` / `NAME="New Caledonia"` / precision 3 / 432 顶点 / **9 多边形** / 19,076 km² / bbox `[163.616,-22.674,168.131,-19.626]`——单要素、完整 territory。
- 阻塞项：(a) 53 年的注入量（年份文件 + sidecar 各 53 个）；(b) NAME 非 null（同 M4/`nameMatch` 只有 1 条命中，副作用小，但仍需 M3 标记）；(c) 注入后该处会从「空白海面/法国空白」变成灰色陆地，需确认与 `auto:france` 的视觉关系。
- 结论：**不建议本期**。

### 4.6 Franz Josef Land —— 不建议本期（并修正审计初判）
- 审计初判为「1/54，仅 1920」；本阶段点内测试 `(54.5,80.7)`、`(58,80)` 在**所有**年份（含 1920）均 NOT COVERED —— 一度像是 54/54 缺失。
- bbox 顶点普查（bbox `[43,79.5,66,82.5]`）给出真相：**1920 有 2,366 个顶点落在该 bbox**，全部属于 `id=124 RU-RSFSR`（`NAME="USSR"`，7,140 顶点 / 61 多边形 / 19,049,848 km² / precision 3）。两个代表点落在岛间水域，故点内测试对该对象**不可靠**。
- 结论：1920 年该群岛**是**被绘制的（作为 USSR 的一部分）；其余 53 年确实无几何。要补全就必须从一个 1900 万 km² 的巨要素里做**环级/连通体裁剪**（现有管线没有该能力），且裁剪结果的形态与精度都无法自动验证。
- **方法论教训：对群岛/多岛对象，点内测试会因「点在岛间水域」产生假阴性，必须以 bbox 顶点普查复核（反之，粗多边形覆盖又可能让 bbox 普查产生假阳性，故两种判据需并用）。**

### 4.7 Kerguelen / South Georgia / Falklands / Galápagos —— 无来源，不建议
- 紧 bbox 逐顶点普查：**raw 与 built 均 0/54**（Kerguelen `[68,-50.5,71,-48]`、South Georgia `[-38.5,-55,-35.5,-53.5]`、Falklands `[-62,-52.5,-57,-50.5]`、Galápagos `[-92.5,-1.5,-89,1]`）。
- 也已用点内测试（1900、2010）确认 NOT COVERED，两者一致 → 不是点位问题，是上游数据根本没有这些岛。
- 补全需要引入**外部数据源**（新数据、新授权、新坐标系/精度口径、新的 `_provenance` 规则），超出 P4.4-6 注入方案的适用范围。

### 4.8 不适用：C2 类 38 个对象
它们 54/54 都有几何，问题在**颜色/身份**（同一陆地某年在 `UNNAMED`、某年属某政权，切年时整块陆地变色：格陵兰 `UNNAMED` 36 年、斯瓦尔巴 30、冰岛 29、新西兰北岛/南岛 28、吕宋 25、棉兰老 24、苏拉威西 23、新几内亚 23、班克斯 23；北地群岛/弗兰格尔/西西里/撒丁岛各有 8–22 种身份）。
用本方案注入会把这些年份的政权颜色**盖成灰色**（M5），语义上是「用错工具」。真正的方向是底图层级/中性陆地图层（OPEN G-O1），本阶段不做。

---

## 5. 若加入会影响哪些文件

### 5.1 通用改动面（任何新对象都需要）

| # | 文件 | 现状（基线） | 需要的改动 |
|---|---|---|---|
| 1 | `data/geo/geographic-entities.json` | 1,443 B，`version:1` / `poleLatitude:-89.9` / `nameMatch:["antarctica"]` / 1 个 entity | 新增 `entities[]` 条目（`id`/`label`/`labelEn`/`entityId:"UNNAMED"`/`color:"#9aa0a6"`/`asset`/`enforcePresence`）；若采用「代表点在场判据」还需新增字段（如 `presencePoints: [[lon,lat],…]`） |
| 2 | `data/geo/<object>.geojson`（新增） | 现有 `data/geo` 2 文件 / 110,534 B | 每个对象 1 个资产：`FeatureCollection` + `name` + `_provenance{extractedFrom, featureIndex, upstream, rawGeometrySha256, note}`；**属性 7 键保留、值一律置 null**（M4）；坐标不量化；多岛合并为单 MultiPolygon 特征（M2-A） |
| 3 | `scripts/build-data.mjs` | 693 LF / 28,062 B / `a893f4625cf6b85d3fcc968022e3993d34583803d30bbc888c56b36391fcf4f6` | ① `:531` 触发条件由「年级极地判据」改为**逐实体在场判据**（M1）；② `:421` `convertFeature()` 增加**显式地理实体标记**（M3），并相应调整 `:473-484` 与 `:506-507` 的计数归属；③ `:537-540`：维持单特征资产则不改，支持多要素资产则改为遍历 + 放宽断言（M2-B）；④ `:549-553` D3 告警与 `:665-679` 汇总日志文案 |
| 4 | `scripts/verify-data.mjs` | 399 LF / 17,426 B / `7cfd5eb841731bd134dd181f4ee26c35919b774b52d1bdc8e2de3e97da98f676` | AR10 由「每快照 ≥1 极地要素」（`:267-269`）+「极地/命名要素必须 UNNAMED」（`:217-231`）扩展为**逐实体在场 + 身份**断言；`:381` 汇总打印 |
| 5 | `tests/relations/run.mjs` | 603 LF / 32,053 B / `157d5c3f928033e3f238c4f7db78aee02d043360f741bc7434edf5b20b815eea` | 常量重定基：`:203` feature 合计 `17439 → 17439+N`、`:351` 无 key `7047`、`:526` 有 key `10392`、`:582` `recordsChecked`；并重新生成 `%TEMP%` 式受保护文件基线（T11 比对基准） |
| 6 | 重新生成的数据产物 | — | 受影响 `public/data/years/world_*.json`；`public/data/manifest.json`（逐快照 feature 数 + 全局计数；`entityCount` 预期**不变**，地理实体不登记政权）；每个受影响年份的 `public/data/relations/<year>.json`（新增 feature id → 1 条保守记录 `{"entityId":"UNNAMED","sovereignId":null,"authorityId":null,"relationship":"unknown","resolutionStatus":"unresolved"}`，P4.4-6 的 `-5000` 记录 `"279"` 即先例）；`reports/p4.1-C-pilot-batch-1-coverage.md`（D5 重生成，「无 key feature」计数会变） |
| 7 | `dist/data/**` | 与 `public/data` 110/110 逐文件一致 | 同步第 6 项的全部变化文件（P4.4-6 同步了 8 个） |
| 8 | **不改**：`data/identity/colors.json`、`data/relations/relations.json`、`data/relations/authorities.json`、`src/**`、`package.json` | — | 地理实体不登记颜色/政权；本轮无需新颜色与新规则 |
| 9 | `scripts/lib/relations-build.mjs` | 599 LF / 33,296 B / `2e8b28f466f3528b1cb5ab08ef1371d09e45018e45b71e195c1f7453ef82f045` | 仅当覆盖度报告的「基线差异成因」文案需要再补一条时改动（P4.4-6 只改了 2 处文案，数字均为派生） |
| 10 | `reports/p4.4-7-*.md`（新增） | — | 实施与验证报告（命名待裁定） |

### 5.2 Tier 1 的具体影响面（最小集）

| 对象 | 注入年份 | 年份文件 | sidecar | 新资产 | 新增 feature |
|---|---|---|---|---|---|
| Sardinia | 1783 | `public/data/years/world_1783.json` | `public/data/relations/1783.json` | 1（29 顶点 ≈1 KB） | +1 |
| Novaya Zemlya | 700、1815 | `world_700.json`、`world_1815.json` | `relations/700.json`、`relations/1815.json` | 1（1,993 顶点 ≈0.19 MB，参照南极洲 1,092 顶点 = 109,091 B） | +4（2 年 × 2 岛；若合并为单特征则 +2） |
| Hawaii | -200、-100 | `world_bc200.json`、`world_bc100.json` | `relations/-200.json`、`relations/-100.json`（文件名以管线现有命名为准） | 1（154 顶点 ≈15 KB） | +6（2 年 × 3 岛；若合并则 +2） |
| **合计** | **5 年** | **5 个年份文件** | **5 个 sidecar** | **3 个资产 ≈0.2 MB** | **+11（或 +5，视是否合并）** |

- 全局计数：`17439 → 17450`（合并方案为 `17444`）；`public/data` 当前 110 文件 / 44.22 MB → 预计 +≈0.4 MB；`dist/data` 需同步 `5 + 1 + 5 = 11` 个文件。
- 顺序副作用小：注入要素追加在每年要素数组末尾（M5），既有 feature 的 `id` 不变 → 其余 sidecar 记录逐字节不受影响（仅新增记录）。

---

## 6. 风险清单与缓解

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 资产属性未中性化（NAME 非 null）→ 走政权身份解析或被 `nameMatch` 归一 | 高 | 沿用南极洲惯例：7 键保留、值置 null；`nameMatch` 只用于 R-B 身份归一（M4 表） |
| R2 | 非极地资产未被判为地理实体（M3）→ 计入「无 key」度量、绕过 AR10 | 高 | 给 `convertFeature()` 加显式 geo 标记；`verify-data.mjs` AR10 同步泛化 |
| R3 | 触发条件未泛化 → 除 -5000 外永不注入（M1） | 高 | 逐实体在场判据；并用「注入年份列表」断言（缺失年份必须全部命中、在场年份必须 0 注入） |
| R4 | 在场判据本身误判（点落在岛间水域 → 假阴性；粗多边形 → 假阳性） | 中 | 多代表点 + bbox 顶点普查双判据；实施时对 Tier 1 的 5 个年份做「注入前后」对比验证（§4.6 已给出教训） |
| R5 | 多岛对象用单要素资产 → `build-data.mjs:538` throw | 中 | M2-A 合并为单 MultiPolygon 特征（南极洲先例） |
| R6 | 注入要素追加在顶层，覆盖同年政权色 | 中低 | Tier 1 缺口年份该处本无几何，无重叠；C2 类不适用本方案 |
| R7 | 概化轮廓（29/48 顶点）在高缩放级别显得粗糙 | 中低 | 资产 `_provenance.note` 记录来源年份与取舍；后续如有多版本可用再择优 |
| R8 | 51 个未变化 sidecar 的 mtime 被统一刷新（`relations-build.mjs` 无 D6 式跳过） | 低 | 已在 P4.4-6 记录；如需消除需单独授权改 `relations-build.mjs` |
| R9 | 测试常量与受保护文件基线需重定基，否则 19 项测试失败 | 低（可控） | 按 §5.1 #5 同步常量并重生成基线，再跑 `node tests/relations/run.mjs` |
| R10 | 完整 `npm run build` 在沙箱内无法运行（`spawn EPERM`） | 低（已知） | 沿用既有做法：`npx tsc -b` + `dist/data` 逐文件哈希复核 |

---

## 7. 未决问题（OPEN）

- **G-O1**（承接审计）中性陆地底图层是否立项 —— C2 类 38 个对象的身份稳定化，与本方案是两条独立路线。
- **G-O6** Tier 1（Sardinia / Novaya Zemlya / Hawaii，5 个年份，+11 feature）是否授权实施？
- **G-O7** 多岛对象是否统一采用「合并为单 MultiPolygon 特征」的资产规范（可避免改 `build-data.mjs:537-540`）？
- **G-O8** 非极地地理实体的显式标记采用何种形式：`convertFeature(f, { geographic: true })` / 配置字段 `geographic: true` / 其它？
- **G-O9** 在场判据形式：配置代表点（射线法）／bbox 顶点计数／两者并用？
- **G-O10** Tier 2（Fiji 24 年、New Caledonia 53 年）是否列二期？Fiji 若做，先决条件是 M3 完成 + 反经线渲染实测。
- **G-O11** Kerguelen / South Georgia / Falklands / Galápagos 是否引入外部数据源（＝新数据授权）？
- **G-O12** 新实体的 `id`/`label` 命名规范（如 `geo:sardinia`）；地理实体当前**不进入** polity 注册表，因此不会出现在实体列表/图例中——是否需要另行暴露？

---

## 8. 复现命令与限制

复现（本阶段实际执行，全部只读；脚本为一次性，已删除）：

```
node .tmp-cand-src.mjs        # 上游专用几何扫描（28 对象 × 54 raw）
node .tmp-cand-rich.mjs       # 最丰富/最紧凑要素 + 专用度
node .tmp-cand-gap.mjs        # 构建产物点内测试（缺口年份是否真的没有覆盖）
node .tmp-cand-bbox.mjs [对象] # 紧 bbox 顶点普查（raw vs built）
node .tmp-cand-objsrc.mjs     # 指定年份 bbox 内的候选源要素明细
node .tmp-cand-trigger.mjs 1783 700 1815 -200 -100 -5000 1492 1938
node .tmp-cand-name.mjs       # nameMatch 归一影响面（用 %TEMP%\geo-features.json）
node .tmp-cand-verify.mjs     # 113 个受保护文件 vs %TEMP%\p446-baseline.txt
```

只读复核结果：113 / 113 受保护文件 **bytes + SHA-256 完全一致（changed 0 / missing 0 / new 0）**；`data/raw/**` 未被触碰；本阶段唯一新增文件为本报告。

限制：
1. 候选范围沿用审计的 48 对象清单，**未做**全库「缺失陆地」系统扫描（缺参考陆地掩膜）。
2. 面积/顶点数取自构建产物（5 位小数量化后）；资产构建时若量化，顶点数可能再减（南极洲先例：1,092 → 1,091）。
3. 在场判据为几何判据，不判历史真实性（用户已明确）。
4. 群岛对象的点内测试存在假阴性（§4.6）；已用 bbox 顶点普查复核 6 个对象，其余对象的结论仍以点内测试为主。
5. 沙箱内无法执行完整 `npm run build`（`spawn EPERM`），故本阶段未做任何构建验证（本阶段本就不允许改数据）。

---

## 9. 五项汇报

1. **改了哪些文件**：**0 个生产文件**（代码、数据、`src/**`、`package.json`、`dist/**` 全未动）；新增 1 个分析报告 `reports/geo-background-candidates.md`；8 个一次性探针 `.tmp-cand-*.mjs` 已全部删除。
2. **装了哪些依赖**：**0**。
3. **占多少磁盘**：本报告约 20 KB；项目内**无**其他新增（`%TEMP%` 中间产物如 `geo-features.json` 4,290,667 B 在项目外）。
4. **有无错误**：无阻塞错误。过程中修正/发现 3 个方法问题——① `.tmp-cand-src.mjs` 首跑 `TypeError: .for is not iterable`（上游 `world_1878` 含 Polygon，未做 MultiPolygon 归一）→ 按 `build-data.mjs:430-436` 修正；② `.tmp-cand-verify.mjs` 基线 SHA-256 大小写比较导致 113 条假「变化」→ 改为大小写无关后 0 变化；③ 点内测试对 Franz Josef Land（群岛、点在岛间水域）产生假阴性 → 改用 bbox 顶点普查复核。
5. **下一步**：**等待裁定**（G-O6..G-O12）。若批准 Tier 1，建议按 §5 的影响面做一次独立实施阶段（含 M1/M3 管线泛化、3 个资产、5 个年份重生成、测试常量与基线重定基、`dist/data` 同步、实施报告）。
