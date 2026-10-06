# L1 实施前报告（L1-before-implementation）

> 阶段：**Geo Continuity Repair · L1（D4 政治 feature 连续性补全）**
> 本报告在**修改任何生产代码/数据之前**生成（生成时 `git`-less 工作区状态：`scripts/**`、`data/**`、`public/**`、`tests/**` 均为阶段前原样；`reports/` 本次新增本文件）。
> 依据：`reports/geo-continuity-repair-audit.md`（D4 = 26 条目 / 48 缺口年，raw 与 built 都无覆盖要素）。
> 裁定：C1 配置放 `data/identity/continuity.json`；C2 claim 取**源侧 run**；C3 保留 `geometryFrom`/`note`；C4 重定基 3 处测试常量 + 重建基线 + 新增 AR11；C5 D3 不进本轮。

---

## 1. 注入项清单（48 项 = 26 条目）

`srcFeatureIds` = **源年份 raw GeoJSON 中 `features[]` 的下标**（0 基），按 `normalizeKey(SUBJECTO || NAME) === normalizeKey(key)` 匹配，实测每个条目**恰好命中 1 个要素**。

| # | key | target year | geometryFrom | claim | srcFile | srcFeatureIds | source NAME | polys | verts |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `siam` | 1815 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 2 | `siam` | 1878 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 3 | `siam` | 1880 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 4 | `siam` | 1900 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 5 | `siam` | 1914 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 6 | `siam` | 1920 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 7 | `siam` | 1930 | 1800 | `auto:siam` | world_1800.geojson | [9] | Siam | 3 | 18 |
| 8 | `eastern north american hunter-gatherers` | -100 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 9 | `eastern north american hunter-gatherers` | -1 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 10 | `eastern north american hunter-gatherers` | 100 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 11 | `eastern north american hunter-gatherers` | 200 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 12 | `eastern north american hunter-gatherers` | 300 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 13 | `eastern north american hunter-gatherers` | 400 | -200 | `auto:eastern north american hunter-gatherers` | world_bc200.geojson | [111] | Eastern North American hunter-gatherers | 2 | 1670 |
| 14 | `malta` | 1920 | 1914 | `auto:malta` | world_1914.geojson | [131] | Malta | 2 | 44 |
| 15 | `malta` | 1930 | 1914 | `auto:malta` | world_1914.geojson | [131] | Malta | 2 | 44 |
| 16 | `malta` | 1938 | 1914 | `auto:malta` | world_1914.geojson | [131] | Malta | 2 | 44 |
| 17 | `malta` | 1945 | 1914 | `auto:malta` | world_1914.geojson | [131] | Malta | 2 | 44 |
| 18 | `malta` | 1960 | 1914 | `auto:malta` | world_1914.geojson | [131] | Malta | 2 | 44 |
| 19 | `guanches` | 500 | 400 | `auto:guanches` | world_400.geojson | [144] | Guanches | 3 | 21 |
| 20 | `guanches` | 600 | 400 | `auto:guanches` | world_400.geojson | [144] | Guanches | 3 | 21 |
| 21 | `guanches` | 700 | 400 | `auto:guanches` | world_400.geojson | [144] | Guanches | 3 | 21 |
| 22 | `tuʻi tonga empire` | 700 | 600 | `auto:tuʻi tonga empire` | world_600.geojson | [203] | Tuʻi Tonga Empire | 60 | 1379 |
| 23 | `tuʻi tonga empire` | 800 | 600 | `auto:tuʻi tonga empire` | world_600.geojson | [203] | Tuʻi Tonga Empire | 60 | 1379 |
| 24 | `tuʻi tonga empire` | 900 | 600 | `auto:tuʻi tonga empire` | world_600.geojson | [203] | Tuʻi Tonga Empire | 60 | 1379 |
| 25 | `guadeloupe` | 1783 | 1715 | `auto:guadeloupe` | world_1715.geojson | [152] | Guadeloupe | 4 | 135 |
| 26 | `guadeloupe` | 1800 | 1715 | `auto:guadeloupe` | world_1715.geojson | [152] | Guadeloupe | 4 | 135 |
| 27 | `haiti` | 1783 | 1715 | `auto:haiti` | world_1715.geojson | [4] | Haiti | 1 | 42 |
| 28 | `haiti` | 1800 | 1715 | `auto:haiti` | world_1715.geojson | [4] | Haiti | 1 | 42 |
| 29 | `martinique` | 1783 | 1715 | `auto:martinique` | world_1715.geojson | [145] | Martinique | 1 | 32 |
| 30 | `martinique` | 1800 | 1715 | `auto:martinique` | world_1715.geojson | [145] | Martinique | 1 | 32 |
| 31 | `amazon hunter-gatherers` | 1492 | 1400 | `auto:amazon hunter-gatherers` | world_1400.geojson | [114] | Amazon hunter-gatherers | 2 | 23 |
| 32 | `desert hunter-gatherers` | 1492 | 1400 | `auto:desert hunter-gatherers` | world_1400.geojson | [120] | Desert hunter-gatherers | 3 | 18 |
| 33 | `savanna hunter-gatherers` | 1492 | 1400 | `auto:savanna hunter-gatherers` | world_1400.geojson | [111] | Savanna hunter-gatherers | 2 | 52 |
| 34 | `subarctic forest hunter-gatherers` | 1492 | 1400 | `auto:subarctic forest hunter-gatherers` | world_1400.geojson | [110] | Subarctic forest hunter-gatherers | 1 | 106 |
| 35 | `kalmar union` | 1492 | 1400 | `auto:kalmar union` | world_1400.geojson | [218] | Kalmar Union | 41 | 2654 |
| 36 | `cree` | 1500 | 1492 | `auto:cree` | world_1492.geojson | [634] | Cree | 1 | 130 |
| 37 | `anguilla` | 1960 | 1945 | `auto:anguilla` | world_1945.geojson | [154] | Anguilla | 1 | 21 |
| 38 | `antigua and barbuda` | 1960 | 1945 | `auto:antigua and barbuda#1` | world_1945.geojson | [146] | Antigua and Barbuda | 2 | 48 |
| 39 | `barbados` | 1960 | 1945 | `auto:barbados#1` | world_1945.geojson | [149] | Barbados | 1 | 49 |
| 40 | `dominica` | 1960 | 1945 | `auto:dominica` | world_1945.geojson | [150] | Dominica | 1 | 36 |
| 41 | `grenada` | 1960 | 1945 | `auto:grenada#2` | world_1945.geojson | [151] | Grenada | 3 | 55 |
| 42 | `montserrat` | 1960 | 1945 | `auto:montserrat#1` | world_1945.geojson | [153] | Montserrat | 1 | 19 |
| 43 | `netherlands antilles` | 1960 | 1945 | `auto:netherlands antilles` | world_1945.geojson | [160] | Netherlands Antilles | 3 | 89 |
| 44 | `saint barthelemy` | 1960 | 1945 | `auto:saint barthelemy` | world_1945.geojson | [162] | Saint Barthelemy | 1 | 14 |
| 45 | `saint kitts and nevis` | 1960 | 1945 | `auto:saint kitts and nevis` | world_1945.geojson | [155] | Saint Kitts and Nevis | 2 | 55 |
| 46 | `saint lucia` | 1960 | 1945 | `auto:saint lucia#2` | world_1945.geojson | [156] | Saint Lucia | 1 | 35 |
| 47 | `saint martin` | 1960 | 1945 | `auto:saint martin` | world_1945.geojson | [161] | Saint Martin | 1 | 15 |
| 48 | `saint vincent and the grenadines` | 1960 | 1945 | `auto:saint vincent and the grenadines#2` | world_1945.geojson | [157] | Saint Vincent and the Grenadines | 4 | 63 |

**合计：26 条目 / 48 注入项 / 源几何顶点 18,466（量化后 ≈18,460）。**

## 2. 实施前一致性检查（全部 PASS）

- 26 个 `claim` 全部存在于 `public/data/entities.json`；
- 每个 `claim.years` **包含** `geometryFrom`（几何与身份同源，C2 源侧 run）；
- 每个 `claim.years` **不含**任何 `target year`（说明目标年当前确实没有该实体 → D4 判定成立）；
- 26 个 `claim` 全部已在 `data/identity/colors.json`（冻结注册表）中 → **预期新增 0 条颜色**；
- 每个 `（key, geometryFrom）` 在源年份 raw 中**恰好命中 1 个要素**（feature id 如上表），因此 1 个条目 = 合并 1 个源要素 = 目标年注入 **1 个** feature；
- 源要素 `NAME === SUBJECTO === 规范拼写`，**NAME 全部非空** → 注入不会产生「有 key 无 NAME」的要素（测试常量 `7,047 / 12` 不变）。

## 3. 目标年分布（25 个年份文件）

| 年份 | 注入 feature 数 | 注入顶点 | 年份 | 注入 feature 数 | 注入顶点 |
|---|---|---|---|---|---|
| -100 / -1 / 100 / 200 / 300 / 400 | 各 1 | 各 1,669 | 1783 / 1800 | 各 3 | 各 209 |
| 500 / 600 | 各 1 | 各 21 | 1815 / 1878 / 1880 / 1900 / 1914 | 各 1 | 各 18 |
| 700 | 2 | 1,400 | 1920 / 1930 | 各 2 | 各 62 |
| 800 / 900 | 各 1 | 各 1,379 | 1938 / 1945 | 各 1 | 各 44 |
| 1492 | 5 | 2,853 | 1960 | 13 | 543 |
| 1500 | 1 | 130 | **合计** | **48** | **18,460** |

> 实施后实测（见 `reports/L1-after-diff-report.md`）：注入顶点 **18,450**（源几何 raw 18,466 → 5 位小数量化合并 −16）。

## 4. 本次实施将修改的文件（预告）

| 文件 | 动作 |
|---|---|
| `data/identity/continuity.json` | **新建**（26 条目，含 `key`/`claim`/`years`/`geometryFrom`/`note`） |
| `scripts/lib/identity.mjs` | 新增 `validateContinuity()`；`planEntities()` 消费 continuity 认领 |
| `scripts/build-data.mjs` | 读配置 + fail-fast 校验 + 逐年注入（复用 `convertFeature`）+ 采样安全网 + 日志 |
| `scripts/verify-data.mjs` | 新增 AR11（在场 + 归属 + 去重） |
| `scripts/lib/relations-build.mjs` | 仅覆盖度报告文案（`17438`/`7046` 基线说明补一句） |
| `tests/relations/run.mjs` | 重定基 3 处：L203 `17439→17487`、L526-527 `10392→10440`、L582 `17439→17487` |
| 自动重生成 | 25 个年份文件、25 个 sidecar、`entities.json`、`manifest.json`、`reports/L1-relation-coverage.md`、`dist/data` |
| **不改** | `data/raw/**`、`data/identity/aliases.json`、`data/identity/colors.json`、`data/geo/**`、`data/relations/relations.json`、`src/**`、`package.json` |

**预期总量**：`17,439 → 17,487` feature（+48）· 顶点 `+18,460` · 体积 `≈ +0.38 MB` · 实体 `3,055` 不变 · 颜色注册表 `3,097` 不变（新增 0）。

---

生成时间：实施前（本轮写入本报告后即开始按裁定实施）。
