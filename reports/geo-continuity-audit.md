# Geo Continuity 补全任务 — 审计报告（只读阶段，未修改任何实现文件）

- 任务来源：User said (m06272)「执行 geo continuity 补全任务 …… 执行前：先生成审计报告，不修改文件 …… 等待确认后再实施」
- 审计日期：本阶段
- 状态：**审计完成，等待裁定**（未改动任何代码 / 数据 / 资产；受保护文件 113/113 与阶段基线逐字节一致）
- 前置报告：`reports/geo-background-candidates.md`（32,904 B / SHA-256 `6E2F87ED2DCB3F6FB5051EDC75AD09AE8E43ABEC33C96A7CC9C7420ABB8AC4E0`，P4.4-6 `data/geo` 注入机制与南极洲先例）、`reports/p4.4-6-antarctica-data-implementation.md`、`reports/p4.4-5-antarctica-data-design.md`

## 任务原则（本次审计的判据）

1. 只补 geometry，不复制 source 年份的 entityId / color / political identity。
2. 补入后的 feature 必须重新经过现有 `scripts/build-data.mjs` 的 identity 流程。
3. 最终输出必须和原生 feature 一样，不增加前端补丁逻辑。
4. 不修改 `src` 渲染层。

---

## §0 结论摘要

**现状**：54 个快照共 17,439 个 feature。用「对象参考几何的内部采样点是否被该年任意要素多边形覆盖」这一权威判据普查 58 个自然地理对象（57 个候选 + Fiji），发现 **26 个对象存在「长期存在但在地图上消失」的缺口**，合计 **927 个对象-年**。其余 31 个对象 54/54 年都被绘制，无缺口。

**三层分级**

| 分级 | 对象数 | 对象-年 | 上游几何可得性 | 建议 |
|---|---|---|---|---|
| **A 类（小缺口）** | 8 | **14** | 齐全，且多为 `NAME=SUBJECTO=null` 的天然中性几何 | **建议本期实施**（11 个年份文件、+14 feature、+≈0.06 MB） |
| **B 类（整对象长期缺失）** | 9 | **427** | 仅 1–3 个年份有专用几何，或需环级提取 | 需先裁定「是否值得为 39–54 个年份逐一注入」；建议第二阶段 |
| **C 类（上游完全无几何）** | 9 | **486** | raw 54/54 年 **0 顶点** | **超出既有数据授权**，需引入外部几何源后另开阶段 |
| **D 类（范围外）** | — | — | 大陆覆盖缺口（非岛屿消失） | 本期不做，仅记录 |

**identity 结论（本报告最关键的一项）**：现有系统**无法推导**这些岛屿的目标年份政权身份——管线只有「key 精确匹配」，没有任何空间推断；而且注入发生在第 1 遍（key 注册）之后，因此**注入要素携带的新 key 不会解析成新实体，只会落到 `UNNAMED`**。因此：

- 按原则 1（不复制政治身份）与原则 3（输出与原生一致），A/B 类注入应以**纯几何（7 个属性键全为 null）**注入 → 由现有 identity 流程自然解析为 `UNNAMED` + `#9aa0a6`，与南极洲先例完全一致；
- 政权 / 主权归属应留给 **relation layer（P4.1-B）**：sidecar 按 feature id 覆盖全部 feature，注入要素会自动获得 `{entityId:"UNNAMED", relationship:"unknown", resolutionStatus:"unresolved"}` 记录，后续可由规则升级，而**不需要改几何**；
- 若坚持「岛屿继承周边政权颜色」，只能由配置**逐对象逐年份**提供同代 key（机械上可解析，见 §7 表），但最近邻政权在多个案例中是错的（Sardinia 1783 → Tunis 196 km、Corsica 1783 → Tuscany 94 km、Hainan -323 → Yue 701 km、Canaries 500 → Visigoths 955 km、Hawaii -200/-100 → 12° 内无任何命名要素），这属于历史裁决，不是现有系统的能力。

**成本（若全量实施）**：17,439 → 18,366 feature（+927）；`public/data` 44.22 MB → ≈58 MB（+≈14 MB）；54 个年份文件与 54 个 sidecar 全部变化；`tests/relations/run.mjs` 的全部计数常量需重定基。**仅 A 类可在不改动 54 个快照的前提下立即实施。**

---

## §1 判定方法与教训

### 1.1 权威在场判据（探针 5）

- 参考几何：54 年 built 数据中「顶点 ≥85% 落在对象紧 bbox 内」且顶点最多者；内部采样点由扫描线交点中点生成（上限 60 个）。
- `present(Y) = 被任意要素多边形覆盖的采样点比例`；**缺失（missing）= <0.5**；**全缺（absent）= <0.05**。
- 反经线 bbox 用交叉判定（`boxIntersects`）；无专用参考几何的对象改用**手工内部点**（Wrangel / Franz Josef / Kerguelen / South Georgia / Falklands / Galápagos / Azores / Cape Verde / Socotra / Andaman / Bermuda / Luzon）。

### 1.2 被推翻的方法（重要教训，避免后续重踩）

1. **1° 栅格化偶奇填充不可作判据**：year 1000 栅格覆盖 29,150 格 ≈ 350M km²，而地球陆地仅 ≈149M km²；Hawaii Oahu 格被标为 `covered=true`，但点内测试 NONE。→ 栅格只能用于「发现候选」。
2. **窗口 footprint 法对小岛无效**：窗口会被邻近大陆 / 大洋覆盖格占据，Wrangel / Hawaii / Sardinia 全被误判「无缺口」。
3. **按 bbox 距离选「相邻政权」会被巨型 blob 污染**：全球 bbox 的多边形（如 USSR / Russian Empire）会赢得距离排序，产出 `Malta 1960 → USSR`、`Sardinia 1783 → Russian Empire` 这类假 owner。→ 必须用**环-环最小距离**（探针 7）。
4. **群岛点内测试会产生假阴性**：Franz Josef Land 在 1920 有 2,347 个顶点，全部埋在 `RU-RSFSR` 的 61 多边形巨要素里，单点测试命不中。→ 必须用 bbox 顶点普查交叉验证。
5. **raw GeoJSON 里存在 `Polygon`（非全部 MultiPolygon）**：探针必须先做 `type === 'Polygon' ? [coordinates] : coordinates` 归一，否则 `TypeError: .for is not iterable`。

### 1.3 探针清单（一次性脚本，已全部删除）

| 探针 | 职责 |
|---|---|
| `.tmp-cont-scan.mjs` | 1° 栅格 + 分量标记，发现「持续陆地但有缺口」的候选 |
| `.tmp-cont-objs.mjs` | 窗口 footprint 法（已证明无效，保留结论） |
| `.tmp-cont-verify.mjs` | 代表点点内测试（built 与 raw 对照） |
| `.tmp-cont-rastercheck.mjs` | 栅格化器自检，证明栅格判据不可信 |
| `.tmp-cont-coverage.mjs` | **权威在场判据**（参考几何 + 内部采样点覆盖率） |
| `.tmp-cont-identity.mjs` | 邻域 key 可解析性（bbox 距离版，已被探针 7 取代） |
| `.tmp-cont-owner.mjs` | **环-环最小距离**求缺失年份的最近命名要素 + Fiji 在场补测 |
| `.tmp-cont-src.mjs` | raw / built 紧 bbox 顶点普查 + 少量在场年份的专用要素明细 |

中间产物：`%TEMP%\cont-coverage.json`、`cont-identity.json`、`cont-owner.json`、`cont-src.txt`（项目外，不影响仓库）。

---

## §2 候选总表

「现状在场」= 覆盖率 ≥0.5 的年份数 / 54。「缺失年份」= 覆盖率 <0.5 的年份。来源要素 = built 数据中该年的几何明细（`entityId|NAME|SUBJECTO|precision|多边形数|顶点数`）。

### A 类 — 小缺口（8 对象 / 14 对象-年）

| 对象 | 缺失年份 | 现状在场 | 推荐来源年 | 来源要素（built） |
|---|---|---|---|---|
| Sicily | `-300` | 53/54 | **-123000** | `UNNAMED｜null｜null｜p1` 31 v / 6 采样点 |
| Sardinia | `1783` | 53/54 | **-700** | `UNNAMED｜null｜null｜p1` 29 v / 1 多边形 / 21,927 km² / bbox `[8.1595,38.9769,9.7937,41.1844]`（built id=77；同几何亦见 -1000 / -1500 / -2000） |
| Corsica | `1783` | 53/54 | **-123000** | `UNNAMED｜null｜null｜p1` 38 v |
| Cyprus | `-500` | 53/54 | **-5000** | `UNNAMED｜null｜null｜p1` 112 v |
| Novaya Zemlya | `700`、`1500`、`1815` | 51/54 | **600** | 北岛 `UNNAMED｜null｜null｜p1` 1,211 v / 1 多边形 / 46,479 km² / bbox `[53.63,73.243,68.931,77.013]`（id=187）；南岛 `UNNAMED｜null｜null｜p1` 782 v / 1 多边形 / 33,012 km² / bbox `[51.395,70.539,57.64,73.422]`（id=191） → **必须合并为单个 MultiPolygon 特征** |
| Hainan | `-323`、`-300` | 52/54 | **-5000** | `UNNAMED｜null｜null｜p1` 67 v（1492/1500/1530 另有 29,916 km² / 26 v 的 `null` 几何） |
| Hawaii | `-200`、`-100` | 52/54 | **-400** 或 **-5000** | -400：三要素 `UNNAMED｜null｜null｜p1` 22 v / 10,579 km²、12 v / 1,988 km²、14 v / 1,631 km²（约 40 个年份用的就是这一版）；-5000：74 v / 8,638 km²、47 v / 1,356 km²、33 v / 664 km² → 合并为单特征 |
| Canary Islands | `500`、`600`、`700` | 51/54 | **-5000** | `UNNAMED｜null｜null｜p1` 150 v / 7 采样点 |

**A 类收益**：8 个岛屿在 14 个年份恢复绘制；**11 个年份文件**受影响：

| 年份文件 | 注入对象 | 条数 |
|---|---|---|
| `public/data/years/world_bc500.json` | Cyprus | 1 |
| `public/data/years/world_bc323.json` | Hainan | 1 |
| `public/data/years/world_bc300.json` | Sicily、Hainan | 2 |
| `public/data/years/world_bc200.json` | Hawaii | 1 |
| `public/data/years/world_bc100.json` | Hawaii | 1 |
| `public/data/years/world_500.json` | Canaries | 1 |
| `public/data/years/world_600.json` | Canaries | 1 |
| `public/data/years/world_700.json` | Canaries、Novaya Zemlya | 2 |
| `public/data/years/world_1500.json` | Novaya Zemlya | 1 |
| `public/data/years/world_1783.json` | Sardinia、Corsica | 2 |
| `public/data/years/world_1815.json` | Novaya Zemlya | 1 |

### B 类 — 整对象长期缺失（9 对象 / 427 对象-年）

| 对象 | 缺失年数 | 现状在场年 | 推荐来源年 | 来源要素（built） | 备注 |
|---|---|---|---|---|---|
| Severnaya Zemlya | 52 | `600`、`1920` | **600** | `UNNAMED｜null｜null｜p1` 404 v / 1 多边形（全 404 v 落在对象框内）；同年另有 `null` p1 335 v、257 v 两个要素 | 1920 只有 `RU-RSFSR` 巨要素内的 999/7,140 v + 两个 `null` 小要素 108 v / 28 v |
| Wrangel | 54（52 年完全无覆盖） | —（1815/1900/1920 部分覆盖） | **1815** 或 **1900 / 1920** | raw：1815 = 86 v 要素中 25 v 落框（`null`）；1900 = 4,740 v 俄帝国要素中 96 v 落框；1920 = 7,140 v USSR 要素中 96 v 落框 | **上游从无「专用」Wrangel 要素** → 需按框提取多边形 |
| Franz Josef Land | 53 | `1920` | **1920（环级提取）** | `RU-RSFSR｜USSR｜USSR｜p3｜61 多边形｜2,347/7,140 v` 落框 | 上游唯一几何，埋在巨要素内；需新增「按框选多边形」的资产制作能力 |
| New Caledonia | 53 | `1938` | **1938** | `auto:france｜New Caledonia｜France｜p3｜9 多边形｜432 v｜19,076 km²` | 属性必须清空（否则会把 53 个岛屿涂成法国色） |
| Vanuatu（New Hebrides） | 53 | `1938` | **1938** | `auto:france｜New Hebrides｜France｜p3｜24 多边形｜714/793 v` | 属性必须清空 |
| Solomon Islands | 53 | `1938` | **1938** | `UNNAMED｜null｜null｜p3｜1 多边形｜111 v`（另有 92 v、89 v 同类要素） | 来源本身已是中性 |
| Bahamas | 39 | 15 年（`1530,1600,1783,1800,1815,1878,1880,1900,1914,1938,1945,1960,1994,2000,2010`） | **1530 / 1600** | `UNNAMED｜null｜null｜p1｜28 多边形｜1,002 v` | 来源天然中性（1783/1800 = `auto:bahamas`，1815–1914 = UK，1938+ = `auto:bahamas#1`） |
| Malta | 46 | 8 年（`600,1878,1880,1900,1914,1994,2000,2010`） | **1878**（几何更细）或 **600** | 1878：`auto:malta｜Malta｜Malta｜p3｜2 多边形｜44 v`；600：`UNNAMED｜null｜null｜p1` 24 v + 20 v | 若用 1878 需清空属性；600 天然中性 |
| Fiji | 24 | 30/54 | **1878**（=1880=1914 同几何） | `auto:fiji｜Fiji｜Fiji｜p3｜885 v｜35 多边形｜19,326 km²｜bbox [-180,-20.6744,180,-16.1525]`（东半 588 v、西半 238 v，**跨反经线**） | 属性必须清空；需反经线安全的资产与渲染核验 |

### C 类 — 上游完全无几何（9 对象 / 486 对象-年）

raw 与 built **54/54 年均为 0 顶点**（紧 bbox 内）：

| 对象 | bbox |
|---|---|
| Kerguelen | `[68,-50.5,71,-48]` |
| South Georgia | `[-38.5,-55,-35.5,-53.5]` |
| Falkland Islands | `[-62,-52.5,-57,-50.5]` |
| Galápagos | `[-92.5,-1.5,-89,1]` |
| Azores | `[-31.3,36.8,-24.9,39.8]` |
| Cape Verde | `[-25.4,14.8,-22.6,17.2]` |
| Socotra | `[53.2,12.2,54.6,12.8]` |
| Bermuda | `[-65,32.2,-64.6,32.4]` |
| Andaman | `[92.2,10.5,93.2,13.5]`（raw 仅 -123000 有 3 v，属于一个 462 v 的 `Homo erectus` 要素） |

→ **这些对象的几何不存在于上游任何快照**，补全必须引入外部数据源（新授权、新许可审查），本期不建议。

### D 类 — 范围外（记录，不实施）

- 大陆级覆盖缺口（来自探针 1）：萨赫勒 23 格缺 7 个早期年；西伯利亚 / 楚科奇格缺 `-200,-100`；波罗的格缺 `-1,1300,1960`。
- 栅格发现但**未用权威判据核验**的疑似对象：Tierra del Fuego（8 个现代年）、Maldives（`-8000,-5000,-4000,-3000`）、Jan Mayen（栅格误标年份 `1783,1878,1880`）。→ 列为 §11 的 G-1。

---

## §3 §4 §5 详情分级说明

A / B / C 类的逐项事实已并入 §2 三张表（缺失年份、来源年份、来源要素属性、顶点 / 多边形 / 面积 / bbox）。为免重复，本节只补充三类各自的**关键判定依据**：

- **A 类**：对象在几乎全部年份都被绘制，仅个别年份整体消失（Sardinia/Corsica 同缺 1783，Sicily 缺 -300，Cyprus 缺 -500，Hainan 缺 -323/-300，Hawaii 缺 -200/-100，Canaries 缺 500/600/700，Novaya Zemlya 缺 700/1500/1815）。来源几何已由探针逐要素核对为 `UNNAMED` + `NAME/SUBJECTO = null`（零身份副作用）。
- **B 类**：对象**在 54 年中的绝大多数年份根本不存在于上游**，只在 1–3 个「高精度快照」（600 / 1530 / 1878 / 1938 / 1920）里出现过；缺口是「上游覆盖率」问题而非「局部漏绘」。
- **C 类**：raw 与 built 双 0 顶点，最小 bbox 普查亦无命中——上游从未提供这些岛屿。

---

## §7 目标年份 identity 是否可以由现有系统解析

### 7.1 机制（读码结论，行号精确）

`scripts/build-data.mjs`（693 LF / 28,062 B / SHA-256 `a893f4625cf6b85d3fcc968022e3993d34583803d30bbc888c56b36391fcf4f6`）：

1. **第 1 遍只遍历 raw 文件**（L178-222）：`const rawKey = p.SUBJECTO || p.NAME || null`（L184）→ `normalizeKey`（L190）→ `keyYears` / `spellings`；L226-232 选 `canonical`；L243-248 `planEntities({keyYears, canonical, indexOfYear, aliases})` → `{entityOfYear, entities, warnings}`。**`entityOfYear` 只包含「上游当年原生出现的 key」**。
2. **`convertFeature(f)`**（L421-525）：`const rawKey = subject || name || null`（L425）；`isPolar = minLat <= geoConfig.poleLatitude`（L471）；`isGeographic = isPolar || [name, subject, PARTOF, ABBREVN].some(t => nameMatch.has(...))`（L473-477）；地理要素 → 强制 `UNNAMED` + `#9aa0a6`，不登记实体、不计入「身份缺失」（L483-484）；否则 `const nk = normalizeKey(String(rawKey)); const id = entityOfYear.get(nk)?.get(year);`（L486-487）→ 命中用 `colors.get(id) ?? colorForKey(...)`（L489-490）；未命中 → `totalUnnamedKey++`（L503-505）；无 `rawKey` → `totalUnnamedKey++`（L506-508）；feature 写出时 `id: features.length`（L510-523，**追加在数组末尾 → 绘制在最上层**）。
3. **注入路径**（L527-547）：所有原生 feature 转换完成后，`if (polarFeatures === 0) { for (const geo of geoConfig.entities) { if (!geo.enforcePresence) continue; … convertFeature(asset.features[0]); if (features.length !== before + 1) throw new Error('地理实体 … 的资产几何量化后退化，未写出要素') } }`。

**推论（关键）**：

- 注入发生在第 1 遍之后，因此**注入要素携带的任何新 key 都不可能解析成实体**（`entityOfYear` 里没有它）→ 必然落到 `UNNAMED`；
- 若注入要素的 `SUBJECTO` / `NAME` **恰好等于该年某个原生 feature 的 key**，则可正常解析为该年的同一实体（机械上可解析）；
- 现有系统**没有任何空间推断**（不接收 entityId / color / geometry / 邻国 / 空间关系，也不做 containment），所以「这座岛当年属于谁」**不可被系统推导**，只能被外部提供。

### 7.2 两种输出模式

| | 模式 N（中性几何，**推荐**） | 模式 P（继承周边政权色） |
|---|---|---|
| 资产属性 | 7 个键全为 `null`（与 `data/geo/antarctica.geojson` 同构） | 逐对象逐年份写入目标年 key（`SUBJECTO`） |
| 管线结果 | `UNNAMED` + `#9aa0a6`（与南极洲先例一致） | 解析为该 key 当年的 entityId；颜色取 `colors.json` 既有登记（无需新色） |
| 计数器 | 落入 `totalUnnamedKey`（除非扩展 `isGeographic`，见 §8） | 不计入无 key，但**改变该年实体覆盖（`usedEntityYears`）** |
| 原则符合性 | 完全符合原则 1（零政治身份）、原则 3（与原生 `UNNAMED` 要素一致） | 需要逐对象逐年的历史判断 = **历史裁决**，与项目治理（裁决留给 relation layer）冲突 |
| 主要风险 | 岛屿在彩色帝国中显示为灰色（与现有 UNNAMED 语义一致） | 邻域归属错误：见 §7.3 的实测距离 |

### 7.3 缺失年份的最近同代命名要素（环-环最小距离，探针 7）

A 类（全部 14 个对象-年）：

| 对象 · 年份 | 该年最近的同代命名要素 | 距离 |
|---|---|---|
| Sicily · -300 | `auto:carthaginian empire`（Carthaginian Empire） | ~0 km（被迦太基边界紧贴） |
| Sardinia · 1783 | `auto:tunis`（Tunis） | ~196 km（西西里 / 撒丁自身当年无命名要素） |
| Corsica · 1783 | `auto:tuscany`（Tuscany） | ~94 km |
| Cyprus · -500 | `auto:achaemenid empire`（Achaemenid Empire） | ~70 km |
| Novaya Zemlya · 700 | `auto:samoyèdes`（Samoyèdes） | ~359 km |
| Novaya Zemlya · 1500 | `auto:grand duchy of moscow` | ~326 km |
| Novaya Zemlya · 1815 | `RU-EMPIRE`（Russian Empire） | ~359 km |
| Hainan · -323 / -300 | `auto:yue`（Yue） | ~701 km |
| Hawaii · -200 / -100 | **NONE（12° 内无任何命名要素）** | — |
| Canaries · 500 | `auto:visigoths`（Visigoths） | ~955 km |
| Canaries · 600 | `RO-EAST`（Eastern Roman Empire） | ~913 km |
| Canaries · 700 | `auto:saharan nomadic tribes` | ~106 km |

B / C 类（示例，全部 54 年逐条明细见 `%TEMP%\cont-owner.json`）：

- Severnaya Zemlya：52 年中 46 年存在命名邻域（`RU-EMPIRE` ~174–290 km、`RU-USSR` ~167–187 km、`auto:siberians` ~167 km…），6 个最早年份为 NONE。
- Wrangel：54 年中 35 年有命名邻域（`auto:arctic marine mammal hunters` ~129–143 km、`auto:chukchi` ~129 km、1900 `RU-EMPIRE` ~27 km、1920 `RU-RSFSR` ~16 km），19 年为 NONE。
- Franz Josef Land：53 年中 47 年有（多为 `auto:finno-ugric taiga hunter-gatherers` ~746–758 km）。
- New Caledonia / Vanuatu / Solomons：邻域距离 810–1,825 km（`auto:tuʻi tonga empire` / `auto:australian aboriginal hunter-gatherers` / `auto:papuans`）。
- Malta：46 年全部有（西西里岛链，85–143 km）。
- Bahamas：39 年中 33 年有（`auto:caribbean hunter-gatherers` ~128 km、`auto:taino`、`auto:spanish habsburg`…）。
- Fiji：**inferred**——探针 7 的 Fiji 分支因局部实现缺陷未产出（`refs`/`out` 两条 `missing` 数组未共享），可依同域的 Vanuatu / New Caledonia 行推断：`500/600 → auto:tuʻi tonga empire`，`1000–1815 → auto:tuʻi tonga empire#1`，早期年份 NONE，1878+ → `auto:fiji`（其自身）。
- C 类：Kerguelen **54/54 年 NONE**；South Georgia 47 年 NONE；Falklands 邻域 = `auto:patagonian shellfish and marine mammal hunters` ~330 km / `auto:argentina`；Galápagos 邻域 = `auto:valdivia` ~893 km / `auto:ecuador`；Azores 邻域 = `auto:guanches` ~1,183 km / `auto:spain#1`；Bermuda 邻域 = `auto:eastern north american hunter-gatherers` ~1,040–1,079 km；Socotra 邻域 = `auto:west african cereal farmers` ~221 km（明显不合理）；Andaman 邻域 = `auto:austro-asiatic rice cultures` ~296 km。

**判定**：模式 P 在 A 类中有 6/14 条会得到「历史错误或荒谬」的颜色（Sardinia→Tunis、Corsica→Tuscany、Hainan→Yue 701 km、Canaries 500/600 的近千公里、Hawaii 无解），C 类中大量为数千公里外的无关民族。→ **结论：identity 不可由现有系统解析，也不应由 data 层裁决；补几何阶段一律使用模式 N（UNNAMED）**。

---

## §8 实现设计提案（仅提案，未实施）

### 8.1 `data/geo/geographic-entities.json` 扩展（全部为**新增可选字段**，保持既有语义默认值）

```jsonc
{
  "version": 1,
  "poleLatitude": -89.9,
  "nameMatch": ["antarctica"],           // 不改动：仍只服务 R-B 归一
  "entities": [
    { "id": "geo:antarctica", … , "enforcePresence": true },   // P4.4-6 原样保留
    {
      "id": "geo:sardinia",
      "label": "撒丁岛", "labelEn": "Sardinia",
      "entityId": "UNNAMED", "color": "#9aa0a6",
      "asset": "sardinia.geojson",
      "neutral": true,                   // 新增：显式声明「地理对象」→ 走 isGeographic 分支（强制 UNNAMED，且不计入 missing-identity 计数）
      "box": [8.1, 38.9, 9.9, 41.3],     // 新增：构建期安全网用（该年 raw 里此框内不允许已有顶点）
      "injectYears": [1783],             // 新增：对象级在场判据（取代年级的 polarFeatures === 0）
      "sourceYear": -700,                // 新增：资产几何来源年（审计可追溯）
      "sourceNote": "built id=77 · UNNAMED · NAME/SUBJECTO=null · 29v/1poly"
    }
  ]
}
```

- **触发泛化（M1）**：`injectYears` 存在 → 仅这些年份注入（对象级判据）；`enforcePresence: true` 且无 `injectYears` → 保持 P4.4-6 的「该年极地要素数 = 0」年级行为（向后兼容，不动已验收路径）。
- **资产约束（M2）**：每个资产必须是 `FeatureCollection`，且 `features[0]` 是**一个** MultiPolygon（多岛对象必须合并；管线只取 `features[0]` 并断言恰 +1 个要素，多要素会直接 throw）。
- **中性语义（M3）**：`neutral: true` 时把该要素纳入 `isGeographic` 分支（L473-484），既保证 `UNNAMED`/`#9aa0a6`，又**不污染** `totalUnnamedKey` 与覆盖度报告的「无 key feature」列（否则 54 个年份的计数会被地理对象混入）。
- **安全网（新增断言）**：注入前用 `box` 对 raw 该年做顶点普查；若框内已存在原生顶点 → **构建失败**（防止重复注入 / 与上游未来修复叠加）。这条断言把「这份 `injectYears` 是否仍然正确」变成构建期硬校验。
- **资产规范**：与 `data/geo/antarctica.geojson` 同构——`FeatureCollection` + `name` + `_provenance {extractedFrom, featureIndex, upstream, rawGeometrySha256, note}`，属性镜像上游 7 键但**逐键置 null**（模式 N），并新增备注 `note: "geometry-only injection; NAME/SUBJECTO intentionally nulled"`。

### 8.2 验证扩展（`scripts/verify-data.mjs`）

- AR10 在场：由「每年至少 1 个极地要素」泛化为**逐 geo 条目逐 `injectYears` 断言**（模式 N 的要素必须为 `UNNAMED` 且颜色 `#9aa0a6`）。
- AR10 身份：新增「`neutral` 条目注入的要素不得登记为 polity 实体」。
- 新增计数校验：地理对象注入数 / 年份分布与 `geographic-entities.json` 声明一致。

### 8.3 明确不做

- 不新增前端补丁、不改 `src/**`（原则 3/4）。
- 不做历史裁决（模式 P 的逐对象逐年 key 映射不纳入本期；后续若需要，应在 relation layer 用规则实现）。
- 不引入外部数据源（C 类需单独授权）。

---

## §9 需要修改的文件列表与成本

### 9.1 A 类（可立即实施的最小集）

| 文件 | 现状 | 预期变化 |
|---|---|---|
| `data/geo/geographic-entities.json` | 1,443 B / `version:1` / `poleLatitude:-89.9` / `nameMatch:["antarctica"]` / 1 个实体 | 新增 8 个 `geo:*` 条目（`neutral` / `injectYears` / `box` / `sourceYear`）；南极洲条目原样保留 |
| `data/geo/sicily.geojson`、`sardinia.geojson`、`corsica.geojson`、`cyprus.geojson`、`novaya_zemlya.geojson`、`hainan.geojson`、`hawaii.geojson`、`canaries.geojson` | 不存在 | **8 个新资产**（`features[0]` = 单个 MultiPolygon；属性全 null；含 `_provenance`）；合计 ≈60 KB |
| `scripts/build-data.mjs` | 693 LF / 28,062 B / `a893f462…fcf4f6` | 触发器泛化（`injectYears` + 向后兼容）、`neutral` 语义、构建期安全网断言；预计 +40～70 行 |
| `scripts/verify-data.mjs` | 399 LF / 17,426 B / `7cfd5eb8…da98f676` | AR10 泛化为逐条目在场 + 身份断言 |
| `tests/relations/run.mjs` | 603 LF / 32,053 B / `157d5c3f…b815eea` | 常量重定基：L203 `17439 → 17453`、L351 `7047 → 7047`（若启用 `neutral` 计数不变）或 `→ 7061`（若不启用）、L526 `10392`、L582 `recordsChecked 17439 → 17453`；T11 基线重生成 |
| `public/data/years/world_bc500.json`、`world_bc323.json`、`world_bc300.json`、`world_bc200.json`、`world_bc100.json`、`world_500.json`、`world_600.json`、`world_700.json`、`world_1500.json`、`world_1783.json`、`world_1815.json` | 已存在 | 各 +1～2 个要素（共 +14）；`manifest.snapshots[]` 对应行的 `features` / `vertices` / `unnamed` / `bytes` 变化 |
| `public/data/relations/<上述 11 个年份>.json` | 54 个 sidecar 覆盖全部 feature | 各新增对应 id 的记录：`{"entityId":"UNNAMED","sovereignId":null,"authorityId":null,"relationship":"unknown","resolutionStatus":"unresolved"}`（共 +14 条） |
| `public/data/manifest.json` | 15,504 B / `entityCount: 3055` | `snapshots[]` 11 行变化；**`entityCount` / `allYears` / `identity` 不变**（中性注入不产生新实体） |
| `reports/p4.1-B-relation-coverage.md` 等覆盖度报告 | 由 `scripts/lib/relations-build.mjs` 按 CLI 参数写出 | 重生成（feature 总数 / 无 key 列变化） |
| `dist/data/**` | 与 `public/data` 逐文件一致的同步副本 | 需同步 11 个年份文件 + 11 个 sidecar + manifest |

**不变的（A 类）**：`data/identity/colors.json`（109,721 B / `50b596ba…31f7`，中性注入不需要新颜色）、`data/identity/aliases.json`、`data/relations/relations.json`（19 条规则）、`public/data/entities.json`、`src/**`、`package.json`。

**A 类数据量**：+14 feature（17,439 → **17,453**）；`public/data` 44.22 MB → **≈44.28 MB**。

### 9.2 B 类（第二阶段，需裁定）

新增 9 个资产（Bahamas 1,002 v / Fiji 885 v / Vanuatu 714 v / New Caledonia 432 v / Severnaya Zemlya 404 v / Solomons ≈292 v / Malta 44 v / Wrangel ≈96 v / Franz Josef ≈2,347 v 待提取）；**54 个年份文件几乎全部变化**（427 次注入）；54 个 sidecar 全变化（+427 条记录）；`tests/relations/run.mjs` 计数常量全面重定基；预计 feature 17,453 → **17,880**，数据量 +≈4～5 MB。

其中 **Franz Josef Land 与 Wrangel 需要新增「按框从巨要素中提取多边形」的资产制作能力**（上游从无专用要素）；Wrangel 另有「54 年中仅 1815/1900/1920 存在顶点」的几何质量问题，可能需要在审计报告中标注为「近似几何」。

### 9.3 C 类（需新授权）

9 个对象 × 54 年 = 486 次注入；几何必须来自上游之外的数据源（许可审查、来源标注、精度对齐均需另立任务）。预计 +486 feature、数据量 +≈5 MB 起。**本期不建议**。

---

## §10 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 注入要素被登记为 polity 身份（属性未清空） | B 类会把 53 年的太平洋岛屿涂成法国色 | 模式 N：属性逐键 `null` + 构建期断言 `neutral` 条目的 feature 必须 `UNNAMED` |
| R2 | 多要素资产触发管线 throw（M2） | 构建失败 | 资产规范强制单 `features[0]` = MultiPolygon；新增资产自检 |
| R3 | 目标年份上游其实已有该对象（重复注入） | 出现重叠几何 | 构建期安全网：`box` 内 raw 顶点普查 > 0 即失败 |
| R4 | 计数语义错位（无 key 计数被地理对象污染） | 覆盖度报告与测试基线含义漂移 | 启用 `neutral` 走 `isGeographic` 分支（不计入 missing-identity） |
| R5 | 反经线几何（Fiji）量化 / 渲染异常 | 跨 ±180 出现撕裂或错位 | 资产保留原始 ±180 表示；构建后做点内测试核验（两侧采样点） |
| R6 | 注入要素 `id` 追加在末尾 → 绘制在最上层 | 覆盖年份会盖住政权色（Tier A 无遮挡：均为岛屿本身） | 仅岛屿几何，天然无遮盖；B 类小岛同理 |
| R7 | `dist/data` 同步遗漏 | 预览与生产数据不一致 | 构建后逐文件 SHA-256 比对（沿用 P4.4-6 做法） |
| R8 | 测试基线（113 个受保护文件、常量、digest）失效 | `tests/relations/run.mjs` 失败 | 常量重定基 + T11 基线重生成，并在报告中记录新旧值 |
| R9 | 来源几何精度低于目标年（如 Wrangel 96 v） | 岛屿形状粗糙 | 报告标注「近似几何」；精度档位（`BORDERPRECISION`）写入 `_provenance` |
| R10 | 对象清单不完整（§11 G-1） | 漏补若干岛屿 | 本报告明确「普查对象为 58 个 curated 对象，非穷举」；后续补一轮全量岛屿扫描 |
| R11 | 上游未来修复同一缺口 | 与安全网断言冲突导致构建失败 | 断言即设计：冲突时人工介入，删掉对应 `injectYears` 条目 |
| R12 | B 类工作量与收益不匹配（427 次注入换 9 个岛屿） | 维护成本、review 成本上升 | 分阶段：A 类先落地，B 类单独裁定（可按对象逐个批准） |

---

## §11 开放问题（等待裁定）

- **G-1**：本次普查对象为 curated 58 个（31 个无缺口 + 26 个有缺口 + Fiji 的补充测），**不是穷举**。是否要再做一轮「全量岛屿 bbox 扫描」（把每年所有 ≥某面积的孤岛多边形纳入对象表）？
- **G-2**：A 类的输出模式确认采用 **模式 N（UNNAMED 灰）** 还是 **模式 P（继承周边政权色，逐对象逐年提供 key）**？
- **G-3**：B 类是否实施？若实施，是否接受「同一年份文件同时注入多个对象」（例如 53 个年份各注入 3～6 个岛屿）？
- **G-4**：Wrangel / Franz Josef Land 是否接受「从巨要素按框提取多边形」这一新增资产制作能力？若不接受，二者应归入 C 类（需外部数据）。
- **G-5**：C 类是否立项引入外部数据源（涉及新许可与新来源标注规范）？
- **G-6**：Tierra del Fuego / Maldives / Jan Mayen 是否需要先用权威判据核验（探针预算：一次 54 年采样，约数分钟）？
- **G-7**：B 类会给「无名灰色岛屿」增加 427 个 feature，若未来 relation layer 要逐个裁决，工作量是否可接受？

---

## §12 复现命令与临时文件

探针（只读，已删除；命令保留供复现）：

```powershell
node .tmp-cont-scan.mjs        # 栅格发现候选
node .tmp-cont-coverage.mjs    # 权威在场判据 → %TEMP%\cont-coverage.json
node .tmp-cont-owner.mjs       # 环-环最近命名要素 + Fiji 在场 → %TEMP%\cont-owner.json
node .tmp-cont-src.mjs         # raw/built 顶点普查 + 专用要素明细
```

中间产物（项目外）：`%TEMP%\cont-coverage.json`、`%TEMP%\cont-identity.json`、`%TEMP%\cont-owner.json`、`%TEMP%\cont-src.txt`。

只读核验（收尾时执行）：以 `%TEMP%\p446-baseline.txt`（113 行，`path \t bytes \t mtime \t SHA-256`）逐文件比对 → **113/113 一致，changed 0 / missing 0**。

---

## §13 五项汇报（本阶段）

1. **改了哪些文件**：**0 个生产文件**；新增 1 个报告 `reports/geo-continuity-audit.md`；8 个一次性探针 `.tmp-cont-*.mjs` 已全部删除（工作区 `.tmp*` 残留 0）。
2. **装了哪些依赖**：0。
3. **占多少磁盘**：报告本体；项目内无其它新增（探针中间产物在 `%TEMP%`，项目外）。
4. **有无错误**：无阻塞错误。过程中修正 3 处方法缺陷：raw 文件含 `Polygon` 导致 `TypeError: .for is not iterable`（需归一）；bbox 距离选邻域被全球 bbox 巨型 blob 污染（Malta 1960 → USSR、Sardinia 1783 → Russian Empire 等假 owner，改用环-环最小距离）；Fiji 分支的 `refs`/`out` 两处 `missing` 数组未共享导致其邻域表缺失（已按同域行推断并在 §7.3 标注 inferred）。
5. **下一步**：等待裁定（G-1…G-7）。批准后建议**只实施 A 类**：8 个资产 + 配置 8 条目 + 管线两处泛化（触发器 / 中性语义）+ 安全网断言 + 11 个年份文件与 sidecar 重生成 + 测试常量重定基 + `dist/data` 同步 + 实施报告。
