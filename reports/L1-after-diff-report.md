# L1-after-diff-report（政治 feature 连续性补全 · 实施后差异与验收）

> 阶段授权：m06554（C1–C5 + 两项交付约束）· 实施前方案与 48 项清单：`reports/L1-before-implementation-report.md`
> 本报告只记录**已实测的事实**；凡属推导的结论均显式标注「推导」。

## 0. 结论摘要

| 指标 | 改前 | 改后 | 变化 |
|---|---|---|---|
| feature 总数 | 17,439 | **17,487** | **+48** |
| 顶点总数 | 1,924,354 | **1,942,804** | **+18,450** |
| `public/data` 体积 | 46,369,990 B（44.22 MiB） | **46,775,650 B（44.61 MiB）** | **+405,660 B（≈ +0.386 MB）** |
| 历史政权实体 | 3,055 | **3,055** | 0 |
| 颜色注册表记录 | 3,097 | **3,097** | 0（新增 0 条） |
| 注入要素 | — | 48（25 个快照 · 26 个条目） | — |

- `data/raw/**` **0 改动**；`data/identity/colors.json` **逐字节未变**；`src/**`、`package.json`、`data/geo/**`、`data/relations/relations.json`、`data/relations/authorities.json` 未改。
- 全部校验通过：`data:verify` exit 0（含新增 **AR11 48/48**）· `tests/relations/run.mjs` **19/19** · `tsc -b` exit 0 · vite build exit 0（`dist/data` 110/110 与 `public/data` 逐文件一致）。
- 双跑构建：`public/data` 110 个文件中 **109 个逐字节相同**，唯一差异是 `manifest.json` 的 `generatedAt` 时间戳（既有行为，见 §6）；`data/identity` 3 个文件 0 差异。

## 1. 修改文件列表

| # | 文件 | 动作 | 改前 | 改后 |
|---|---|---|---|---|
| 1 | `data/identity/continuity.json` | **新建** | — | 8,350 B · `669E7C852648A60E…732F…`（26 条目 / 48 目标年） |
| 2 | `scripts/lib/identity.mjs` | 修改（+`validateContinuity`，`planEntities` 新增步骤 2.5） | 未记录 | 16,755 B · `337E9DDA511F75BF…` |
| 3 | `scripts/build-data.mjs` | 修改（读配置 + fail-fast + 逐年注入 + 日志） | 28,062 B · `a893f462…` | 33,440 B · `A24F07BFE05AFE9E…` |
| 4 | `scripts/verify-data.mjs` | 修改（新增 AR11 配置校验 + 全量在场/归属核对） | 17,426 B · `7cfd5eb8…` | 20,215 B · `1AA6B124B5431CEA…` |
| 5 | `tests/relations/run.mjs` | 修改（重定基 3 处常量 + 1 处描述文本） | 32,053 B · `157d5c3f…` | 32,053 B · `CF6152E44B2D9A6F…` |
| 6 | `scripts/lib/relations-build.mjs` | 修改（仅覆盖度报告文案 3 处） | 33,296 B · `2e8b28f4…` | 33,577 B · `F8303E70BA330F8C…` |
| 7 | `reports/L1-before-implementation-report.md` | **新建**（+4 处事实更正，见 §9） | — | 9,812 B · `35660499B5E5964F…` |
| 8 | `reports/L1-relation-coverage.md` | **新建**（`--report` 重新生成） | — | 475,191 B · `643407169D53A28C…` |
| 9 | `public/data/years/*.json` | 25 个重写 / 29 个未变 | — | 见 §2 |
| 10 | `public/data/entities.json` | 重写（26 个实体的 `years` 数组变长，`count` 不变） | 未记录 | 462,399 B · `4254E286D18BF6F6…` |
| 11 | `public/data/manifest.json` | 重写 | 15,504 B | 15,504 B · `90D81E2ED1C35BCC…` |
| 12 | `public/data/relations/*.json` | 54 个重写（25 个内容变化 / 29 个仅 mtime） | 未记录（P4.1-B 时为 2,356,861 B） | 2,365,009 B |
| 13 | `dist/**` | vite 重建 + data 同步 | 118 文件 | 118 文件 / 48,666,620 B（`dist/data` 110/110 一致） |

未改（逐字节或 hash 一致）：`data/raw/**`（55 个文件 0 变化）、`data/identity/aliases.json`（12,667 B · `8529D502…`）、`data/identity/colors.json`（见 §4）、`data/geo/**`、`data/relations/relations.json`（19 条规则）、`data/relations/authorities.json`（8 条）、`src/**`、`package.json`（809 B · `B131D79E…`）。

**测试改动性质**（C4：只能同步真实数据变化、不得降低断言强度）：`tests/relations/run.mjs` 只改了 3 处数量常量（L203 `17439→17487`、L526-527 `10392→10440`、L582 `recordsChecked 17439→17487`）与 1 处描述文本（T11 明细行 `identity 2 → identity 3`，因新增 `continuity.json` 使受保护 identity 文件由 2 → 3）。**没有任何断言被删除、放宽或跳过。**

## 2. feature 数变化（逐年份）

| 年 | 文件 | 改前 feature | 注入 | 改后 feature | 改前顶点 | 注入顶点 | 改后顶点 | 改后字节 |
|---|---|---|---|---|---|---|---|---|
| -123000 | years/world_bc123000.json | 157 | — | 157 | 18900 | — | 18900 | 419937 |
| -10000 | years/world_bc10000.json | 135 | — | 135 | 20652 | — | 20652 | 452586 |
| -8000 | years/world_bc8000.json | 134 | — | 134 | 20589 | — | 20589 | 451166 |
| -5000 | years/world_bc5000.json | 280 | — | 280 | 128273 | — | 128273 | 2696496 |
| -4000 | years/world_bc4000.json | 136 | — | 136 | 20759 | — | 20759 | 454486 |
| -3000 | years/world_bc3000.json | 138 | — | 138 | 20815 | — | 20815 | 456108 |
| -2000 | years/world_bc2000.json | 145 | — | 145 | 23092 | — | 23092 | 506570 |
| -1500 | years/world_bc1500.json | 162 | — | 162 | 23477 | — | 23477 | 519868 |
| -1000 | years/world_bc1000.json | 162 | — | 162 | 23468 | — | 23468 | 520740 |
| -700 | years/world_bc700.json | 173 | — | 173 | 23564 | — | 23564 | 525661 |
| -500 | years/world_bc500.json | 189 | — | 189 | 24558 | — | 24558 | 548043 |
| -400 | years/world_bc400.json | 189 | — | 189 | 24183 | — | 24183 | 539501 |
| -323 | years/world_bc323.json | 147 | — | 147 | 23863 | — | 23863 | 526191 |
| -300 | years/world_bc300.json | 153 | — | 153 | 24354 | — | 24354 | 537491 |
| -200 | years/world_bc200.json | 179 | — | 179 | 25840 | — | 25840 | 571161 |
| -100 | years/world_bc100.json | 219 | **+1** | 220 | 25336 | 1669 | 27005 | 606125 |
| -1 | years/world_bc1.json | 385 | **+1** | 386 | 29019 | 1669 | 30688 | 718592 |
| 100 | years/world_100.json | 382 | **+1** | 383 | 29092 | 1669 | 30761 | 718491 |
| 200 | years/world_200.json | 328 | **+1** | 329 | 29038 | 1669 | 30707 | 705818 |
| 300 | years/world_300.json | 401 | **+1** | 402 | 28933 | 1669 | 30602 | 718548 |
| 400 | years/world_400.json | 341 | **+1** | 342 | 28224 | 1669 | 29893 | 692016 |
| 500 | years/world_500.json | 202 | **+1** | 203 | 26251 | 21 | 26272 | 589454 |
| 600 | years/world_600.json | 198 | **+1** | 199 | 30734 | 21 | 30755 | 656952 |
| 700 | years/world_700.json | 252 | **+2** | 254 | 25567 | 1400 | 26967 | 614615 |
| 800 | years/world_800.json | 223 | **+1** | 224 | 26037 | 1379 | 27416 | 616215 |
| 900 | years/world_900.json | 241 | **+1** | 242 | 29216 | 1379 | 30595 | 676071 |
| 1000 | years/world_1000.json | 257 | — | 257 | 30013 | — | 30013 | 674860 |
| 1100 | years/world_1100.json | 234 | — | 234 | 28684 | — | 28684 | 644193 |
| 1200 | years/world_1200.json | 278 | — | 278 | 27771 | — | 27771 | 636716 |
| 1279 | years/world_1279.json | 242 | — | 242 | 27892 | — | 27892 | 626417 |
| 1300 | years/world_1300.json | 232 | — | 232 | 27459 | — | 27459 | 617394 |
| 1400 | years/world_1400.json | 228 | — | 228 | 28719 | — | 28719 | 640726 |
| 1492 | years/world_1492.json | 1942 | **+5** | 1947 | 112046 | 2843 | 114889 | 2890381 |
| 1500 | years/world_1500.json | 283 | **+1** | 284 | 30497 | 130 | 30627 | 692587 |
| 1530 | years/world_1530.json | 489 | — | 489 | 36791 | — | 36791 | 863302 |
| 1600 | years/world_1600.json | 860 | — | 860 | 45493 | — | 45493 | 1148173 |
| 1650 | years/world_1650.json | 776 | — | 776 | 45324 | — | 45324 | 1123281 |
| 1700 | years/world_1700.json | 781 | — | 781 | 44566 | — | 44566 | 1111616 |
| 1715 | years/world_1715.json | 758 | — | 758 | 46835 | — | 46835 | 1147810 |
| 1783 | years/world_1783.json | 641 | **+3** | 644 | 47451 | 209 | 47660 | 1134882 |
| 1800 | years/world_1800.json | 627 | **+3** | 630 | 46288 | 209 | 46497 | 1112095 |
| 1815 | years/world_1815.json | 436 | **+1** | 437 | 66396 | 18 | 66414 | 1461614 |
| 1878 | years/world_1878.json | 239 | **+1** | 240 | 36256 | 18 | 36274 | 793978 |
| 1880 | years/world_1880.json | 236 | **+1** | 237 | 36177 | 18 | 36195 | 791320 |
| 1900 | years/world_1900.json | 270 | **+1** | 271 | 35604 | 18 | 35622 | 792951 |
| 1914 | years/world_1914.json | 177 | **+1** | 178 | 35610 | 18 | 35628 | 767621 |
| 1920 | years/world_1920.json | 205 | **+2** | 207 | 41190 | 62 | 41252 | 890411 |
| 1930 | years/world_1930.json | 200 | **+2** | 202 | 37907 | 62 | 37969 | 822623 |
| 1938 | years/world_1938.json | 253 | **+1** | 254 | 40899 | 44 | 40943 | 880635 |
| 1945 | years/world_1945.json | 227 | **+1** | 228 | 37297 | 44 | 37341 | 813884 |
| 1960 | years/world_1960.json | 197 | **+13** | 210 | 35575 | 543 | 36118 | 785241 |
| 1994 | years/world_1994.json | 240 | — | 240 | 47232 | — | 47232 | 1009091 |
| 2000 | years/world_2000.json | 240 | — | 240 | 47274 | — | 47274 | 1010027 |
| 2010 | years/world_2010.json | 240 | — | 240 | 47274 | — | 47274 | 1010007 |
| **合计** | 54 个快照 | **17439** | **+48** | **17487** | **1924354** | **+18450** | **1942804** | |
- 注入的 48 个 feature 全部追加在各自年份文件 `features` 数组**末尾**（沿用既有 `id: features.length` 规则），因此既有 feature 的 `id` **未被重排**——sidecar 键集合与年份文件 id 集合逐年仍完全相等（测试 R1/R2 ✅）。
- 顶点 +18,450 vs 实施前预估 +18,460：差额 −10 来自 5 位小数量化时的坐标合并（源几何 raw 顶点 18,466 → 写出 18,450，−16；其中 `eastern north american hunter-gatherers` 1,670 → 1,669）。
- 与独立基线交叉核对（推导校验）：`-5000` 280 feature / 128,273 顶点、`2010` 240 feature、`1492` 1,942 feature、`1960` 197 feature、`1945` 227 feature 均与 P4.4-6 阶段与前序审计记录一致 ✅。
- `writeIfChanged`（D6）实测生效：本轮仅 **25 个**年份文件被重写（mtime 落在 `2026-10-05T12:58:04–05Z`，恰好等于注入年份集合），其余 **29 个**年份文件保持改动前 mtime（内容逐字节未变、未被重写）。因此 `dist/data` 之外的旧文件不会被无意义刷新。

## 3. entity years 变化（claim 级）

26 个 `claim` 共新增 **48 个 `(year, key)`**，全部为「补齐既有实体在其历史区间的断档年份」，**没有产生新实体、没有改写既有年份归属**（`planEntities` 步骤 2.5 只认领空位；任何冲突会在构建期以 `continuitySkipped` 抛出）。

C2 裁定落实：`claim` 取**源侧 run**（`geometryFrom` 所在 run），因此颜色接缝（同一对象跨 run 换色）**保持原样**，未借本次补全改写历史 identity —— 接缝问题属 D1/D2 范围。

按年归属变化的实体年份数（详见 §3 表尾部合计）：`auto:eastern north american hunter-gatherers` 8 → 14 年、`auto:malta` 4 → 9 年、`auto:siam` 1 → 8 年、`auto:guanches` 14 → 17 年、`auto:tuʻi tonga empire` 2 → 5 年、加勒比 12 个实体各 +1 年（1960）等。

| claim | 涉及 key | 改前年数 | 改后年数 | 新增年份 |
|---|---|---|---|---|
| `auto:amazon hunter-gatherers` | `amazon hunter-gatherers` | 32 | 33 | 1492 |
| `auto:anguilla` | `anguilla` | 15 | 16 | 1960 |
| `auto:antigua and barbuda#1` | `antigua and barbuda` | 12 | 13 | 1960 |
| `auto:barbados#1` | `barbados` | 8 | 9 | 1960 |
| `auto:cree` | `cree` | 5 | 6 | 1500 |
| `auto:desert hunter-gatherers` | `desert hunter-gatherers` | 26 | 27 | 1492 |
| `auto:dominica` | `dominica` | 15 | 16 | 1960 |
| `auto:eastern north american hunter-gatherers` | `eastern north american hunter-gatherers` | 8 | 14 | -100, -1, 100, 200, 300, 400 |
| `auto:grenada#2` | `grenada` | 8 | 9 | 1960 |
| `auto:guadeloupe` | `guadeloupe` | 1 | 3 | 1783, 1800 |
| `auto:guanches` | `guanches` | 14 | 17 | 500, 600, 700 |
| `auto:haiti` | `haiti` | 1 | 3 | 1783, 1800 |
| `auto:kalmar union` | `kalmar union` | 2 | 3 | 1492 |
| `auto:malta` | `malta` | 4 | 9 | 1920, 1930, 1938, 1945, 1960 |
| `auto:martinique` | `martinique` | 1 | 3 | 1783, 1800 |
| `auto:montserrat#1` | `montserrat` | 12 | 13 | 1960 |
| `auto:netherlands antilles` | `netherlands antilles` | 15 | 16 | 1960 |
| `auto:saint barthelemy` | `saint barthelemy` | 15 | 16 | 1960 |
| `auto:saint kitts and nevis` | `saint kitts and nevis` | 12 | 13 | 1960 |
| `auto:saint lucia#2` | `saint lucia` | 8 | 9 | 1960 |
| `auto:saint martin` | `saint martin` | 15 | 16 | 1960 |
| `auto:saint vincent and the grenadines#2` | `saint vincent and the grenadines` | 8 | 9 | 1960 |
| `auto:savanna hunter-gatherers` | `savanna hunter-gatherers` | 32 | 33 | 1492 |
| `auto:siam` | `siam` | 1 | 8 | 1815, 1878, 1880, 1900, 1914, 1920, 1930 |
| `auto:subarctic forest hunter-gatherers` | `subarctic forest hunter-gatherers` | 31 | 32 | 1492 |
| `auto:tuʻi tonga empire` | `tuʻi tonga empire` | 2 | 5 | 700, 800, 900 |
| **合计** | 26 个 claim | — | +48 个 (year, key) | |

## 4. colors.json 是否零变化

**✅ 零变化（逐字节）**：

- `data/identity/colors.json` 109,721 B · SHA-256 `50B596BAC4B923CBFFCB3709DC334EC107ADAAD9F7E05D4951C556D98FD831F7` —— 与实施前记录 `50b596ba…31f7`（P4.4-6 结束时）**完全一致**；记录数仍 **3,097**。
- 构建日志：`颜色注册表：新增 0 条，总计 3097 条`；机制：26 个 `claim` 全部已在冻结注册表中注册颜色，且 `build-data.mjs` 新增了硬校验「claim 必须在冻结注册表中，否则 throw」。
- 该文件同时是 T11 受保护文件之一（`data/identity/` 全目录），T11 与阶段 baseline 双重确认其未变。

## 5. manifest / relations 差异

**manifest.json**（重写，唯一非确定性字段为 `generatedAt`）：

| 字段 | 改前 | 改后 |
|---|---|---|
| `entityCount` | 3,055 | **3,055**（不变） |
| `allYears` | 54 | 54 |
| `snapshots` | 54 项 | 54 项，其中 **25 项**的 `features`/`vertices`/`bytes`/`bbox` 变化（`entities` 列变化见 §3；25 项逐项变化见 §2 表） |
| `coordPrecision` / `identity` / `relationsDir` | — | 不变（`manualEntities 56`、`splitKeys 136`、`distinctColors 2479`） |
| `generatedAt` | 2026-10-05T12:5x | 每次构建刷新（见 §6） |

**relations（54 个 sidecar）**：

| 指标 | 改前 | 改后 |
|---|---|---|
| sidecar 覆盖 feature | 17,439 | **17,487**（R1 ✅ 逐年与年份文件一致） |
| `noKeyFeatures` | 7,047 | **7,047**（T9 ✅ 未增未减） |
| `keyPresentNameEmpty` | 12 | **12**（9 null + 3 纯空白） |
| `evidenceCellsYearKey` | 9,713 | **9,761**（+48，L1 新增单元） |
| `evidenceCellsYearKeyName` | 10,143 | **10,147** |
| `resolved` / `unresolved` | 77 / 17,362 | **77 / 17,410** |
| `evidenceCellsUnresolved` / `unresolvedCellFeatures` | 10,104 / 10,363 | 不变（规则集未变） |
| `conflicts` | 0 | **0** |
| digest | — | `50d12721080da3c0105aeeb29cf6f1f82781232afcae24629660742243d6a400`（自检 digestRun1 === digestRun2 ✅） |

- **为什么 `noKeyFeatures` 不增**：26 个源要素的 `NAME === SUBJECTO === 规范拼写`（且 NAME 非空），注入要素带 key 且能被 `entityOfYear` 解析 → 严格走「命中实体」分支，不落入无 key 桶（与实施前预测一致）。
- 内容变化的 25 个 sidecar 与 §2 的注入年份集合**逐个对应**；其余 29 个 sidecar 内容不变（推导：其年份文件逐字节未变 + sidecar 由确定性管线生成，且测试 T10/R10 覆盖逐字节一致性），仅 mtime 被刷新（`relations-build` 对 sidecar 无 D6 内容跳过）。
- 代码层差异仅在报告文案：`scripts/lib/relations-build.mjs` 的 L364 / L373 / L381（`feature` 基线说明补 L1；`(year, key)` 基线说明补 48 个新增单元；把硬编码 `10,099 − 4 = 10,095` 改为由实测派生）。**规则集、解析器语义、sidecar 结构均未改。**

## 6. 双跑构建 hash 一致性

- **数据层**：连续两次 `npm run data:build` → `public/data` 110 文件 **changed 1 / added 0 / removed 0**；唯一变化 `manifest.json`（15,504 B → 15,504 B，`generatedAt` 由 `2026-10-05T12:5x` 变为下一次运行时刻）。其余 **109 个文件逐字节相同**（含 54 个年份文件、`entities.json`、54 个 sidecar）。`data/identity` 3 文件 changed 0。
- **关系层**：`data:relations` 内置自检 `digestRun1 === digestRun2`（`50d12721…`）；测试 **R10 跨进程确定性**：两次独立进程各生成 54 个 sidecar，逐文件 SHA-256 全部相同 ✅。
- **结构层**：`npx tsc -b` exit 0；vite build exit 0 → `dist/data` 110 个文件与 `public/data` **逐文件 SHA-256 相同** ✅。
- **已知非确定性（既有，非本轮引入）**：`manifest.json.generatedAt`。`build-data.mjs` 对 manifest 不做内容跳过（无 D6），故每次构建都会改写该字段。**影响**：任何在 build 之后建立的「阶段 baseline」都会因下一次 build 而失效——本轮实测发生过一次（baseline 建于第 1 次 build 之后，第 2 次 build 刷新 manifest → T11 报 `与阶段前基线不符：public/data/manifest.json`；重建 baseline 后 19/19）。**这正是 T11 的预期保护行为**，不是缺陷。是否将 manifest 纳入确定性口径（例如剔除 `generatedAt` 或加 D6 跳过）**留待后续阶段裁定，本轮未改**。

## 7. 验收证据（可复现命令）

| 命令 | 结果 |
|---|---|
| `npm run data:build` | exit 0 · `合计：17487 features / 1942804 顶点 / 41.90 MB` · `颜色注册表：新增 0 条，总计 3097 条` · `连续性补全：注入 48 个要素（25 个快照 · 26 个条目 · 来源年份 -200, 400, 600, 1400, 1492, 1715, 1800, 1914, 1945）` |
| `npm run data:verify` | exit 0 · `✓ 全部通过：54 个快照 / 17487 features / 1942804 顶点 / 41.90 MB / 3056 个历史政权实体` · AR10 南极洲 54/54 · **AR11 48 个 (key, year) 在场并归属声明实体 · 配置 26 个条目 · 命中 48** |
| `npm run data:relations` | exit 0 · features 17487 · noKey 7047 · keyPresentNameEmpty 12 · resolved 77 · conflicts 0 · digest `50d12721…`（自检相等） |
| `node tests/relations/run.mjs --validation <json> --baseline <txt>` | exit 0 · **19/19 PASS** · R1 17,487 · T9 7,047+12 · T11 114 个受保护文件哈希未变且与阶段 baseline（114 行）一致 · R10 跨进程一致 |
| `npx tsc -b` | exit 0 |
| `node --import ./scripts/sandbox-netuse-shim.mjs ./node_modules/vite/bin/vite.js build` | exit 0（`✓ built in 516ms`）· `dist/data` 110/110 与 `public/data` 一致 |

- 阶段 baseline 文件：`%TEMP%\l1-baseline.txt`（114 行；**实施后重建**，用于后续阶段的「阶段前」比对）。
- 测试 stderr 的既有告警（与 L1 无关、非阻断）：`[relations][C5-D1/D2][warning] 6 条记录不满足最小约束` —— 1945 年 feature id=5/113/137/143/144/145 `occupied` 但 `sovereignId` 为 null（P4.1-A v3 §7 OQ-C5 张力，沿用既有 warn 模式）。

## 8. 未处理项 / 交回裁定

| 项 | 状态 |
|---|---|
| D1 颜色接缝（同一对象跨 run 换色） | **未处理**（按 C2 保持源侧 run；L1 明确不改写历史 identity） |
| D2 | **未处理**（待独立裁定/审查） |
| D3 | **未处理**（C5：L1 完成后重新审查） |
| D5 | **未处理** |
| `manifest.json` 确定性（`generatedAt`） | **未处理**，见 §6；建议后续阶段裁定 |
| P4.1-A §7 OQ-C5（`occupied` 缺 `sovereignId`） | **未处理**（既有 warn 模式，6 条） |
| 一次性只读探针（工作区外） | 7 个脚本 `C:\Users\李睿\AppData\Local\Temp\l1-{d4-ids,d4-src,d4-items,baseline,snap,afterdiff,reorder}.mjs` **沙箱 EPERM 无法删除**（工作区外禁止写/删）；其 json 转储已删除；`%TEMP%\dsh-hXGnmE\l1-baseline.txt`（12,451 B / 114 行）**有意保留**作为后续阶段的「阶段前」比对基线。工作区内 `.tmp*` = 0 |

## 9. 事实更正（对本阶段早期文件）

实施后核对发现 `reports/L1-before-implementation-report.md` 的 4 处数字/路径笔误并已更正（**只改描述，未改任何数据或结论**）：`24 个 claim` → `26 个 claim`（2 处）、`目标年分布（24 个年份文件）` → `25 个年份文件`、自动重生成清单 `24 个年份文件、24 个 sidecar、reports/p4.1-B-relation-coverage.md` → `25 个年份文件、25 个 sidecar、reports/L1-relation-coverage.md`；并补记实测注入顶点 18,450（预估 18,460）。
