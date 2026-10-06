# L1 Continuity Identity Audit

- **审计对象**：`data/identity/continuity.json` 全部 **26 条 entry / 48 个 (key, year)** 注入项（L1 political continuity 补全）。
- **审计数据态**：`public/data` 当前 54 个快照（`public/data/manifest.json` 的 `generatedAt` 为最近一次 build；`entityCount` 3055、features 17487）。
- **审计模式**：**只读**。本次审计未修改 `data/identity/continuity.json`、未修改 `public/data/**`、未运行 `data:build`、未运行 `verify-data`、未修改 `src/`、未提交代码。唯一写入 = 本报告文件。
- **触发背景**：`auto:siam` 案例疑似 **D1/D2（identity 映射问题）** 而非 D4（纯几何缺失）。
- **证据产物**（临时，工作区外，非交付物）：
  - `%TEMP%\dsh-hXGnmE\l1-identity-audit.json`（每项：注入要素、覆盖率、邻年、run 分裂信号）
  - `%TEMP%\dsh-hXGnmE\l1-identity-geom.txt`（13 个 case 的源年 raw 属性 / 目标年相交要素 / 顶点级几何判定）

## Method

1. 读 `public/data/manifest.json`、`public/data/entities.json`、54 个年份文件、`data/identity/continuity.json`。
2. 复刻 `scripts/lib/identity.mjs:35-48` 的 `normalizeKey`（NFC → trim → 小写 → 去括号内容 → 折叠空白等 8 条规则），全部 key 比较使用该函数。
3. 对每个 `(claim, target year)`：在目标年 built 数据中定位 `normalizeKey(subject||name) === key` 且 `entityId === claim` 的**注入要素**（`injectedAll`，正常为 1 个）。
4. 用注入要素几何的内部采样点（扫描线交点取中点，`min(内部点, 40)`）做**射线法点内测试**，统计目标年**其它要素**对该足迹的覆盖率（排除同 `normalizeKey` 的要素，避免自覆盖假象）。
5. 邻年集合 = `prevIdx`/`nextIdx`（索引序前后快照）、`calPrev`/`calNext`（日历年 ±1，若存在），以及 `prevNative`/`nextNative`（由 `entities.json` 的 key→years 推出的最近**同名原生**年份）；对每个邻年重复第 4 步并比较 NAME / SUBJECTO / normalizeKey / entityId。
6. 辅助信号：同 key 异实体、同名异实体、名称 token 近似、run 分裂（`auto:x` → `auto:x#n`）。

### Risk model（本次采用的判据）

|类别|含义|风险|
|-|-|-|
|**A** identity conflict|注入要素与目标年**已存在的另一实体**在历史上是同一政体（或同一政体的名称阶段）→ 同年双绘 / 互相覆盖|HIGH|
|**B** possible alias transition|名称不变或历史连续，但两侧 `entityId` 不同（含跨 run 分裂 `auto:x` ↔ `auto:x#n`）|MEDIUM|
|**C** pure geometry gap|同一 key/entity，目标年只是缺 feature；覆盖它的只有 key-less `UNNAMED` 或不相关政体|LOW|

> 审计脚本的自动初判（token 名称近似 + 覆盖率阈值）得到 HIGH=11 / MEDIUM=18 / LOW=19，其中名称 token 近似产生多处假阳性（`dominica`↔`dominican republic`、`netherlands antilles`↔`netherlands`、`saint X`↔`saint Y`、`eastern north american…`↔`eastern masurian culture`）。本报告的最终裁定为**人工复核后的结果**，并在每条 `reason` 中说明与自动初判的差异。

## Summary

|claim|risk|action|
|-|-|-|
|`auto:siam`|**HIGH**|**rollback continuity**（7 项全部回滚；根因是 key 选取错误，属 D1/D2）|
|`auto:kalmar union`|**HIGH**|**rollback continuity**（1 项回滚）|
|`auto:eastern north american hunter-gatherers`|MEDIUM|review（D1/D2：400 跨 run 缝隙；其余 5 项为纯几何缺口）|
|`auto:malta`|MEDIUM|review（D1/D2：1960 跨 run 缝隙；其余 4 项为纯几何缺口）|
|`auto:guanches`|MEDIUM|review（D1/D2：700 跨 run 缝隙；其余 2 项为纯几何缺口）|
|`auto:tuʻi tonga empire`|MEDIUM|review（D1/D2：900 跨 run 缝隙；其余 2 项为纯几何缺口）|
|`auto:guadeloupe`|MEDIUM|review（D1/D2：1800 跨 run 缝隙；1783 为纯几何缺口）|
|`auto:haiti`|MEDIUM|review（D1/D2：1800 跨 run 缝隙；1783 为纯几何缺口）|
|`auto:martinique`|MEDIUM|review（D1/D2：1800 跨 run 缝隙；1783 为纯几何缺口）|
|`auto:amazon hunter-gatherers`|LOW|keep（通用文化层，1492 与 UNNAMED 大区重叠）|
|`auto:desert hunter-gatherers`|LOW|keep|
|`auto:savanna hunter-gatherers`|LOW|keep|
|`auto:subarctic forest hunter-gatherers`|LOW|keep|
|`auto:cree`|LOW|keep|
|`auto:anguilla`|LOW|keep|
|`auto:antigua and barbuda#1`|LOW|keep|
|`auto:barbados#1`|LOW|keep|
|`auto:dominica`|LOW|keep|
|`auto:grenada#2`|LOW|keep|
|`auto:montserrat#1`|LOW|keep|
|`auto:netherlands antilles`|LOW|keep|
|`auto:saint barthelemy`|LOW|keep|
|`auto:saint kitts and nevis`|LOW|keep|
|`auto:saint lucia#2`|LOW|keep|
|`auto:saint martin`|LOW|keep|
|`auto:saint vincent and the grenadines#2`|LOW|keep|

**计数**：HIGH **2** 条（8 个注入项）· MEDIUM **7** 条（23 项）· LOW **17** 条（17 项）· 合计 **26** 条 / **48** 项。
**建议回滚**：`auto:siam`（7 项）、`auto:kalmar union`（1 项）= **2 条 / 8 项**。

## Detailed findings

> 每条包含：`claim` / `key` / `risk` / `reason` / `recommendation`。逐 target year 的 `before` / `target` / `after` 用表格给出：
> `before` = 该年之前最近一个**同名原生**快照（`prevNative`），`after` = 之后最近一个同名快照（`nextNative`）；`target` = 本次注入要素（id / 几何规模 / 覆盖其足迹的其它实体）。
> 说明：目标年份文件中的 `id` 是数组序号（构建期 `id: features.length`），注入要素恒为**末尾追加**（绘制在最上层）。

---

### auto:siam

claim: `auto:siam`
key: `siam`
geometryFrom: `1800`
target years: `1815, 1878, 1880, 1900, 1914, 1920, 1930`
risk: **HIGH** — identity conflict（类别 A）
recommendation: **ROLLBACK**（整条 entry；7 个 target year 全部移除）

reason:
- **根因是 key 选取错误，不是几何缺失**。上游 `data/raw/geojson/world_1800.geojson` 同一年存在**两个**候选要素：
  - `featureIndex 9`：`NAME="Siam" SUBJECTO="Siam" ABBREVN="Siam" PARTOF="Siam" BORDERPRECISION=3`，MultiPolygon **3 个多边形 / 18 顶点**，bbox `[102.36, 12.04, 104.16, 14.41]` —— 这是暹罗在**柬埔寨西北部（马德望 / 暹粒一带）的飞地**，**不是暹罗本土**（built 后 `auto:siam`，色 `#a48ec7`）。
  - `featureIndex 623`：`NAME/SUBJECTO="Rattanakosin Kingdom"`，1 个多边形 / **214 顶点**，bbox `[97.27, 5.53, 107.46, 24.15]` —— 这才是**暹罗本土**（built 后 `auto:rattanakosin kingdom`，色 `#958bdc`）。
- L1 按 key `siam` 取到了**飞地**几何，并把它注入 7 个目标年 → 结果是「同一政体的第二个要素」而非补全缺失疆域：
  - `1914 / 1920 / 1930`：注入足迹 **93%** 落在 `auto:rattanakosin kingdom` 上（同年两个要素并存，双重表示同一政体）。
  - `1900`：同年 **同时存在** `auto:rattanakosin kingdom`（built id=203，bbox `[97.27,5.53,105.47,24.15]`、220 顶点）与注入的 `auto:siam`（id=270）；注入足迹 7% 被 rattanakosin 覆盖（其余部分落在 rattanakosin 之外的空白，因为 1900 的 rattanakosin 已收缩）。
  - `1815`：注入足迹 **100%** 落在 `auto:cambodia`（built id=72，bbox `[102.36,10.31,107.51,14.56]`、69 顶点）之上，另有 7% 落在 `auto:rattanakosin kingdom`（id=430）—— 即「把柬埔寨的暹罗飞地画在柬埔寨之上」。
  - `1878 / 1880`：注入足迹 **100%** 落在 `auto:france`「French Indochina」（id=222 / id=226，bbox `[102.36,8.47,107.51,14.56]`、85 顶点）之上 + 7% rattanakosin。
- 另有一处上游数据不一致可作为交叉印证：`1938` 快照中 `Siam` 是**另一个 run**（`auto:siam#1`，id=57，bbox `[97.37,5.53,105.47,20.46]`、199 顶点，色 `#82d4cd`）—— 同一名称在 1800（飞地）与 1938（本土）对应**不同几何**，说明 key `siam` 本身在源数据中就是被污染的多义 key。
- **结论**：`siam` 的 7 个目标年不是 D4 纯几何缺口，而是 D1/D2 identity 映射问题（key 与实体的选取）。是否需要把 `Siam` 与 `Rattanakosin Kingdom` 认定为同一政体的名称阶段，属历史 identity 裁定，不在本审计（只读）范围内；**在裁定之前应整条回滚**。

|target|injected（id / 顶点 / 多边形）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1815|`436`（18 v / 3 poly）|**100%** `auto:cambodia`「Cambodia」；7% `auto:rattanakosin kingdom`|1800 · Siam · `auto:siam`|1878 · Siam · `auto:siam`|
|1878|`239`（18 v / 3 poly）|**100%** `auto:france`「French Indochina」；7% `auto:rattanakosin kingdom`|1815 · Siam · `auto:siam`|1880 · Siam · `auto:siam`|
|1880|`236`（18 v / 3 poly）|**100%** `auto:france`「French Indochina」；7% `auto:rattanakosin kingdom`|1878 · Siam · `auto:siam`|1900 · Siam · `auto:siam`|
|1900|`270`（18 v / 3 poly）|7% `auto:rattanakosin kingdom`（同年 rattanakosin id=203 并存）|1880 · Siam · `auto:siam`|1914 · Siam · `auto:siam`|
|1914|`177`（18 v / 3 poly）|**93%** `auto:rattanakosin kingdom`（id=47）|1900 · Siam · `auto:siam`|1920 · Siam · `auto:siam`|
|1920|`205`（18 v / 3 poly）|**93%** `auto:rattanakosin kingdom`|1914 · Siam · `auto:siam`|1930 · Siam · `auto:siam`|
|1930|`200`（18 v / 3 poly）|**93%** `auto:rattanakosin kingdom`|1920 · Siam · `auto:siam`|1938 · Siam · `auto:siam#1`（run 分裂）|

---

### auto:kalmar union

claim: `auto:kalmar union`
key: `kalmar union`
geometryFrom: `1400`
target years: `1492`
risk: **HIGH** — identity conflict（类别 A）
recommendation: **ROLLBACK**（整条 entry；1 个 target year）

reason:
- 注入要素为 `id=1946`，**41 个多边形 / 2,652 顶点**，bbox `[-67.41, 54.19, 29.69, 83.58]`（含格陵兰、冰岛一侧），即 1400 年「Kalmar Union」的完整范围。
- 在 `1492`，该足迹 **60%** 落在 `DK-NORWAY`「Denmark-Norway」（built id=5）上，**20%** 落在 `auto:sweden`「Sweden」（id=22）上，另 11% 落在 key-less `UNNAMED`（id=74）、6% 落在 `auto:thule`（id=1937）。
- 邻年 `1400` / `1500` 同 key 原生存在且**没有任何其它实体覆盖该足迹** → 上游在 1492 这一版把 Kalmar 区域**已经拆成** `Denmark-Norway` + `Sweden` 两个实体；L1 又把 1400 版「Kalmar Union」整体叠在两者之上 = **同一政体族在同一快照中双重表示**（属于 A 类，而非 D4 缺口）。
- 与 `siam` 不同的是，这里源年与目标年的 key/entity 一致（都是 `auto:kalmar union`），冲突来自「上游 1492 已改变其身份拆分方式」；是否把 `Kalmar Union` 视为 `Denmark-Norway` 的名称阶段需 D1/D2 裁定，**裁定前建议回滚**。

|target|injected（id / 顶点 / 多边形）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1492|`1946`（2,652 v / 41 poly）|**60%** `DK-NORWAY`「Denmark-Norway」；**20%** `auto:sweden`；11% `UNNAMED`；6% `auto:thule`|1400 · Kalmar Union · `auto:kalmar union`|1500 · Kalmar Union · `auto:kalmar union`|

---

### auto:eastern north american hunter-gatherers

claim: `auto:eastern north american hunter-gatherers`
key: `eastern north american hunter-gatherers`
geometryFrom: `-200`
target years: `-100, -1, 100, 200, 300, 400`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 400 跨 run 缝隙）
recommendation: **REVIEW**（D1/D2 裁定 `auto:…` ↔ `auto:… #1` 是否为同一实体；几何本身可保留）

reason:
- 6 个目标年的注入足迹**都只被 key-less `UNNAMED` 覆盖 29%**（`-100` 的 id=102，bbox `[-94.28, 30.33, -60.96, 49.23]`、606 顶点；其余年份同构）+ 少量具名文化（7% `auto:couture complex` / `auto:point peninsula` / `auto:porter`）。**没有任何其它政体与注入实体争夺同一政治身份** → 不构成 A 类冲突。
- 关键：**邻年 `-1`（原生存在的年份）呈现完全相同的 29% UNNAMED + 7% 具名文化覆盖** → 该重叠是**上游原生状态**，不是 L1 造成的。
- run 分裂：目标年 `400` 之后是 `500` 年的 `auto:eastern north american hunter-gatherers#1`；`-200`（源年）使用的是 `auto:eastern north american hunter-gatherers`（无 `#1`）。即注入把无后缀 run 从 `-200` 一路延伸到了 `400`，在 `400 → 500` 处产生实体（与颜色）接缝。按 m06554 的 **C2** 裁定，L1 有意取源侧 run，接缝归后续 D1/D2 → 本项标记 REVIEW 而非回滚。
- 审计脚本对 `-100 / -1 / 100` 报 MEDIUM 的原因是名称 token 近似命中 `auto:eastern masurian culture`（「eastern」）—— **假阳性**；对 `400` 报 MEDIUM 的原因是真实的 run 分裂。

|target|injected（id / 顶点）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|-100|`219`（未拆）|29% `UNNAMED`；7% couture complex / point peninsula / porter|`-200` · Eastern North American hunter-gatherers · `auto:eastern north american hunter-gatherers`|`-1` · 同上（29% UNNAMED + 7%）|
|-1|`385`|29% `UNNAMED`|`-100` · 同上|`100` · 同上|
|100|`382`|29% `UNNAMED`|`-1` · 同上|`200` · 同上|
|200|`328`|29% `UNNAMED`|`100` · 同上|`300` · 同上|
|300|`401`|29% `UNNAMED`|`200` · 同上|`400` · 同上|
|400|`341`|29% `UNNAMED`|`300` · 同上|`500` · 同名 · **`auto:eastern north american hunter-gatherers#1`**（run 分裂）|

---

### auto:malta

claim: `auto:malta`
key: `malta`
geometryFrom: `1914`
target years: `1920, 1930, 1938, 1945, 1960`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 1960 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 5 个目标年的注入足迹**完全没有被任何其它实体覆盖**（coverage 为空）→ 不存在同年双重表示，属于「上游在该年缺 feature」。
- 唯一异常是 run 分裂：`auto:malta` 原生覆盖到 `1945`，而 `1994` 是 `auto:malta#1` → 注入把无后缀 run 延伸到 `1960`，接缝在 `1960 → 1994`。按 C2 属预期行为，颜色接缝已知 → REVIEW。
- 无同名异实体、无同 key 异实体、无名称近似命中。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1920|`206`|—|1914 · Malta · `auto:malta`|1930 · Malta · `auto:malta`|
|1930|`201`|—|1920 · Malta · `auto:malta`|1938 · Malta · `auto:malta`|
|1938|`253`|—|1930 · Malta · `auto:malta`|1945 · Malta · `auto:malta`|
|1945|`227`|—|1938 · Malta · `auto:malta`|1960 · Malta · `auto:malta`|
|1960|`197`|—|1945 · Malta · `auto:malta`|1994 · Malta · **`auto:malta#1`**（run 分裂）|

---

### auto:guanches

claim: `auto:guanches`
key: `guanches`
geometryFrom: `400`
target years: `500, 600, 700`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 700 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 三个目标年足迹**无任何其它实体覆盖** → 无身份冲突。
- run 分裂：`600` 为 `auto:guanches`，`800` 为 `auto:guanches#1` → 注入把无后缀 run 延伸到 `700`，接缝在 `700 → 800`。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|500|`202`|—|400 · Guanches · `auto:guanches`|600 · Guanches · `auto:guanches`|
|600|`198`|—|500 · Guanches · `auto:guanches`|700 · Guanches · `auto:guanches`|
|700|`252`|—|600 · Guanches · `auto:guanches`|800 · Guanches · **`auto:guanches#1`**（run 分裂）|

---

### auto:tuʻi tonga empire

claim: `auto:tuʻi tonga empire`
key: `tuʻi tonga empire`
geometryFrom: `600`
target years: `700, 800, 900`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 900 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 三个目标年足迹**无任何其它实体覆盖**（含无 `auto:tonga` 一类实体争夺同域）→ 无身份冲突。
- run 分裂：`800` 为 `auto:tuʻi tonga empire`，`1000` 为 `auto:tuʻi tonga empire#1` → 接缝在 `900 → 1000`。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|700|`253`|—|600 · Tuʻi Tonga Empire · `auto:tuʻi tonga empire`|800 · 同上|
|800|`223`|—|700 · 同上|900 · 同上|
|900|`241`|—|800 · 同上|1000 · 同名 · **`auto:tuʻi tonga empire#1`**（run 分裂）|

---

### auto:guadeloupe

claim: `auto:guadeloupe`
key: `guadeloupe`
geometryFrom: `1715`
target years: `1783, 1800`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 1800 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 两个目标年足迹**无任何其它实体覆盖**（上游该年直接缺失该岛几何）→ 补全方向正确。
- run 分裂：`1783` 为 `auto:guadeloupe`，`1815` 为 `auto:guadeloupe#1` → 接缝在 `1800 → 1815`。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1783|`641`|—|1715 · Guadeloupe · `auto:guadeloupe`|1800 · Guadeloupe · `auto:guadeloupe`|
|1800|`627`|—|1783 · Guadeloupe · `auto:guadeloupe`|1815 · Guadeloupe · **`auto:guadeloupe#1`**（run 分裂）|

---

### auto:haiti

claim: `auto:haiti`
key: `haiti`
geometryFrom: `1715`
target years: `1783, 1800`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 1800 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 两个目标年足迹**无任何其它实体覆盖**（注意：1783/1800 的 `Haiti` 在源数据中即「圣多明各（法属）」这一实体的 key，与 1815 之后的 `auto:haiti#1` 名称相同）。
- run 分裂：`1783` → `auto:haiti`，`1815` → `auto:haiti#1`；接缝在 `1800 → 1815`。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1783|`642`|—|1715 · Haiti · `auto:haiti`|1800 · Haiti · `auto:haiti`|
|1800|`628`|—|1783 · Haiti · `auto:haiti`|1815 · Haiti · **`auto:haiti#1`**（run 分裂）|

---

### auto:martinique

claim: `auto:martinique`
key: `martinique`
geometryFrom: `1715`
target years: `1783, 1800`
risk: **MEDIUM** — possible alias transition（类别 B，仅因 1800 跨 run 缝隙）
recommendation: **REVIEW**

reason:
- 两个目标年足迹**无任何其它实体覆盖** → 补全方向正确。
- run 分裂：`1783` → `auto:martinique`，`1815` → `auto:martinique#1`；接缝在 `1800 → 1815`。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1783|`643`|—|1715 · Martinique · `auto:martinique`|1800 · Martinique · `auto:martinique`|
|1800|`629`|—|1783 · Martinique · `auto:martinique`|1815 · Martinique · **`auto:martinique#1`**（run 分裂）|

---

### auto:amazon hunter-gatherers

claim: `auto:amazon hunter-gatherers`
key: `amazon hunter-gatherers`
geometryFrom: `1400`
target years: `1492`
risk: **LOW** — pure geometry gap（类别 C；存在大面积重叠但**非身份冲突**）
recommendation: **KEEP**（若后续引入遮挡/裁剪能力再评估）

reason:
- 同一 key/entity 在 `1400` 与 `1500` 原生存在，只有 `1492` 缺失 → D4 型缺口；注入后邻年身份完全一致。
- 覆盖观察：注入足迹 75% 落在 key-less `UNNAMED`（id=1617，bbox `[-74.84,-22.93,-34.89,5.51]`、**4,608 顶点**的巨型无名区），另 25% `auto:matetamãe/cinta larga`（id=978）、25% `auto:rikbaktsá`（id=961）。**没有**任何实体与注入实体争夺同一政治身份 → 不构成 A 类。
- 该重叠属**上游 1492 密度的固有现象**：1492 快照有 1,947 个要素（1400/1500 仅约 228/284 个），具名原住民族层在这一年最密，通用 hunter-gatherer 层与其天然交叠（1500 年的同名原生要素同样与 cree 等重叠）。
- 注：脚本按覆盖率阈值把本项自动判为 HIGH，人工复核下调为 LOW（覆盖者是无名的 `UNNAMED`，不是竞争身份）。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1492|`1942`|75% `UNNAMED`（id=1617）；25% `auto:matetamãe/cinta larga`；25% `auto:rikbaktsá`|1400 · Amazon hunter-gatherers · `auto:amazon hunter-gatherers`|1500 · 同上|

---

### auto:desert hunter-gatherers

claim: `auto:desert hunter-gatherers`
key: `desert hunter-gatherers`
geometryFrom: `1400`
target years: `1492`
risk: **LOW** — pure geometry gap（类别 C）
recommendation: **KEEP**

reason:
- 只有在 `1492` 缺失；`1400`/`1500` 原生存在且同名同实体。
- 覆盖者均为**不相关的具名原住民族**（各 17–33%）：`auto:jumanos`（id=270）、`auto:kiikaapoi (kickapoo)`（id=209）、`auto:ndé kónitsąąíí gokíyaa (lipan apache)`（id=397）、`auto:nʉmʉnʉʉ (comanche)`（id=1111）、`auto:coahuiltecan`（id=669）、`auto:mescalero apache`（id=1112）。
- 上游固有：`1400` 同名原生要素已被 `UNNAMED` 覆盖 33%，`1500` 已被 `auto:apache`/`auto:comanche` 各覆盖 17% → 通用层与民族层重叠是源数据常态。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1492|`1943`|33% `auto:jumanos`；33% `auto:kiikaapoi (kickapoo)`；33% `auto:ndé kónitsąąíí gokíyaa (lipan apache)`；25% `auto:nʉmʉnʉʉ (comanche)`；17% `auto:coahuiltecan`；17% `auto:mescalero apache`|1400 · Desert hunter-gatherers · `auto:desert hunter-gatherers`（33% UNNAMED）|1500 · 同上（17% apache / 17% comanche）|

---

### auto:savanna hunter-gatherers

claim: `auto:savanna hunter-gatherers`
key: `savanna hunter-gatherers`
geometryFrom: `1400`
target years: `1492`
risk: **LOW** — pure geometry gap（类别 C）
recommendation: **KEEP**（存在与具名民族的重叠，建议后续与遮挡能力一并评估）

reason:
- 只有在 `1492` 缺失；`1400`/`1500` 原生存在且同名同实体。
- 覆盖者：50% `auto:qom`（id=374）、50% `auto:tekohá (guarani)`（id=726）、25% `auto:ayoreo`（id=1101）、25% `auto:chiquitano`（id=266）、25% `auto:ishir ybytoso`（id=509）、25% `auto:maká`（id=1039）—— 均为**不相关**民族，不存在与 `savanna hunter-gatherers` 同一政体的第二个表示。
- 脚本按 50% 覆盖率自动判 HIGH，人工复核下调为 LOW（判据见 Risk model A 类定义）。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1492|`1944`|50% `auto:qom`；50% `auto:tekohá (guarani)`；25% `auto:ayoreo`；25% `auto:chiquitano`；25% `auto:ishir ybytoso`；25% `auto:maká`|1400 · Savanna hunter-gatherers · `auto:savanna hunter-gatherers`|1500 · 同上|

---

### auto:subarctic forest hunter-gatherers

claim: `auto:subarctic forest hunter-gatherers`
key: `subarctic forest hunter-gatherers`
geometryFrom: `1400`
target years: `1492`
risk: **LOW** — pure geometry gap（类别 C）
recommendation: **KEEP**（存在与具名民族的重叠，建议后续与遮挡能力一并评估）

reason:
- 只有在 `1492` 缺失；`1400`/`1500` 原生存在且同名同实体。
- 覆盖者：43% `auto:michif piyii (métis)`（id=560）、29% `auto:cree`（id=630）、29% `auto:nitassinan (innu)`（id=462）、14% `auto:anishinabewaki ᐊᓂᔑᓈᐯᗙᑭ`（id=616）、14% `auto:eeyou istchee`（id=1268）、14% `auto:nitaskinan (atikamekw / nehirowisi aski)`（id=791）—— 均为不相关民族。
- 上游固有：`1500` 同名原生要素已被 `auto:cree` 覆盖 29%、`auto:algonquin` 14% → 该通用层与民族层重叠是源数据常态。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1492|`1945`|43% `auto:michif piyii (métis)`；29% `auto:cree`；29% `auto:nitassinan (innu)`；14% `auto:anishinabewaki…`；14% `auto:eeyou istchee`；14% `auto:nitaskinan (atikamekw…)`|1400 · Subarctic forest hunter-gatherers · `auto:subarctic forest hunter-gatherers`|1500 · 同上（29% cree / 14% algonquin）|

---

### auto:cree

claim: `auto:cree`
key: `cree`
geometryFrom: `1492`
target years: `1500`
risk: **LOW** — pure geometry gap（类别 C）
recommendation: **KEEP**

reason:
- 同一 key/entity，仅 `1500` 缺失；`1492`（源年）与 `1530` 原生存在。
- 覆盖观察：注入足迹 75% 被 `auto:subarctic forest hunter-gatherers`（id=151）覆盖，13% `auto:algonquin`、13% `auto:plateau fichers and hunter gatherers`。
- **关键：源年 `1492` 的原生 Cree 本身就已被同层覆盖 88%**（+63% `auto:michif piyii (métis)`、25% blackfoot、25% `auto:očhéthi šakówiŋ`）→ 注入只是**复刻上游既有的重叠状态**，没有引入新的身份冲突。
- 脚本按 75% 覆盖率自动判 HIGH，人工复核下调为 LOW。软性观察：`auto:cree` 与 `auto:subarctic forest hunter-gatherers` 在同一区域长期叠画（1492 原生即如此），若后续要做「不重叠的历史政权染色」，应作为一个独立的渲染/裁剪议题处理。

|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|
|1500|`283`|75% `auto:subarctic forest hunter-gatherers`；13% `auto:algonquin`；13% `auto:plateau fichers and hunter gatherers`|1492 · Cree · `auto:cree`（原生已被同层覆盖 88%）|1530 · Cree · `auto:cree`（25% obiwa / 25% subarctic）|

---

### 12 个加勒比条目（@1960）

> 本组 12 条 entry 的 `key` / `geometryFrom` / `risk` / `reason` / `recommendation` 完全一致，故合并为一个 findings 块；每条 claim 的 `before` / `target` / `after` 见下表。

claim（12 条）: `auto:anguilla`、`auto:antigua and barbuda#1`、`auto:barbados#1`、`auto:dominica`、`auto:grenada#2`、`auto:montserrat#1`、`auto:netherlands antilles`、`auto:saint barthelemy`、`auto:saint kitts and nevis`、`auto:saint lucia#2`、`auto:saint martin`、`auto:saint vincent and the grenadines#2`
key: 与 claim 同名（去 `#n`）
geometryFrom: `1945`
target years: `1960`（12 条各 1 项）
risk: **LOW** — pure geometry gap（类别 C）
recommendation: **KEEP**（这 12 项就是 L1 设计目标的典型 D4 补全）

reason:
- 12 个注入要素（`id=198..209`，1960 年文件内）**完全没有被任何其它实体覆盖**：1960 年上游直接缺少这些小岛的几何，也没有任何政权要素声明该区域。
- 两侧身份一致：`1945` 与 `1994` 都是同一个 entityId（例如 `auto:anguilla`、`auto:barbados#1`、`auto:dominica`、`auto:netherlands antilles`）→ 不涉及 run 分裂、不存在别名过渡。
- 审计脚本对其中 6 条报 MEDIUM，全部是**名称 token 假阳性**：`auto:dominica` ↔ `auto:dominican republic`、`auto:netherlands antilles` ↔ `auto:netherlands`、`auto:saint barthelemy` / `saint kitts and nevis` / `saint lucia#2` / `saint martin` / `saint vincent and the grenadines#2` 之间的共同前缀 `saint`。人工复核：几何与实体均不相交/不相同 → LOW。

|claim|target|injected（id）|覆盖注入足迹的其它实体|before (year · name · entity)|after (year · name · entity)|
|-|-|-|-|-|-|
|`auto:anguilla`|1960|`198`|—|1945 · Anguilla · `auto:anguilla`|1994 · Anguilla · `auto:anguilla`|
|`auto:antigua and barbuda#1`|1960|`199`|—|1945 · Antigua and Barbuda · `auto:antigua and barbuda#1`|1994 · 同上|
|`auto:barbados#1`|1960|`200`|—|1945 · Barbados · `auto:barbados#1`|1994 · 同上|
|`auto:dominica`|1960|`201`|—|1945 · Dominica · `auto:dominica`|1994 · 同上|
|`auto:grenada#2`|1960|`202`|—|1945 · Grenada · `auto:grenada#2`|1994 · 同上|
|`auto:montserrat#1`|1960|`203`|—|1945 · Montserrat · `auto:montserrat#1`|1994 · 同上|
|`auto:netherlands antilles`|1960|`204`|—|1945 · Netherlands Antilles · `auto:netherlands antilles`|1994 · 同上|
|`auto:saint barthelemy`|1960|`205`|—|1945 · Saint Barthelemy · `auto:saint barthelemy`|1994 · 同上|
|`auto:saint kitts and nevis`|1960|`206`|—|1945 · Saint Kitts and Nevis · `auto:saint kitts and nevis`|1994 · 同上|
|`auto:saint lucia#2`|1960|`207`|—|1945 · Saint Lucia · `auto:saint lucia#2`|1994 · 同上|
|`auto:saint martin`|1960|`208`|—|1945 · Saint Martin · `auto:saint martin`|1994 · 同上|
|`auto:saint vincent and the grenadines#2`|1960|`209`|—|1945 · Saint Vincent and the Grenadines · `auto:saint vincent and the grenadines#2`|1994 · 同上|

---

## Cross-cutting findings

1. **L1 注入机制本身没有问题**：48 个注入项全部在目标年存在且 `entityId` 等于声明的 claim（AR11 在最近一次 verify 中即校验此点），几何来自声明的 `geometryFrom` 年份，颜色取自冻结注册表（`data/identity/colors.json` 零变化）。
2. **唯一的高风险根因是「key 选取」而不是「补几何」**：`auto:siam` 的 key 在源数据中指代两段完全不同的地理（1800 = 柬埔寨境内飞地，1938 = 暹罗本土，且分属不同 run），`planEntities` 的 key 认领机制无法区分它们；`auto:kalmar union` 则是上游在 1492 已改用 `Denmark-Norway` + `Sweden` 表达同一政体族。两者都属于 **D1/D2（identity 映射）**，需要用 D1/D2 的手段（key 归一 / 别名 / 名称阶段）解决，而不是继续用 continuity 注入。
3. **48 项中 40 项不涉及身份冲突**：23 项（7 条 entry）是「跨 run 缝隙的桥接」（MEDIUM / REVIEW，接缝在 C2 已接受），17 项（17 条 entry）是真正的纯几何缺口（LOW / KEEP），其中 12 个加勒比小岛 @1960 是 L1 目标的典型正例。
4. **通用文化层与具名民族层的重叠是上游固有属性**（`amazon`/`desert`/`savanna`/`subarctic`/`cree`）：源年自身的原生要素就已被其它层覆盖 33%–88%。如果产品目标要求「同一像素只有一个历史政权颜色」，需要的是 D3（遮挡 / 裁剪 / 层序）能力，本轮 C5 已明确不处理。
5. **run 分裂对颜色的影响**（D1）：`auto:x` 与 `auto:x#1` 是同名不同实体，因此各自有独立颜色；L1 按 C2 取源侧 run，会在接缝处产生颜色跳变（例如 Malta、Guanches、Tuʻi Tonga、Guadeloupe、Haiti、Martinique、Eastern NA hunter-gatherers、Siam 1938）。
6. **审计脚本规则与人工裁定的差异**已逐条标注：自动初判 11/18/19（HIGH/MEDIUM/LOW），人工裁定 2/7/17；差异全部来自「名称 token 近似」假阳性与「覆盖率阈值 ≠ 身份冲突」两类误判。

## Recommendations

|优先级|动作|对象|理由|
|-|-|-|-|
|P0|**回滚 continuity**|`auto:siam`（7 项）|key `siam` 在源数据中指代柬埔寨境内的暹罗飞地；与 `auto:rattanakosin kingdom` 同政体双绘，1815/1878/1880 更是 100% 压在柬埔寨 / 法属印度支那之上|
|P0|**回滚 continuity**|`auto:kalmar union`（1 项）|1492 上游已用 `Denmark-Norway` + `Sweden` 表达，注入导致同族双重表示（60% / 20% 重叠）|
|P1|REVIEW（D1/D2）|`auto:malta`、`auto:guanches`、`auto:tuʻi tonga empire`、`auto:guadeloupe`、`auto:haiti`、`auto:martinique`、`auto:eastern north american hunter-gatherers`（23 项）|跨 run 缝隙桥接；几何可保留，但需裁定 `auto:x` 与 `auto:x#n` 是否同一实体（并解决颜色接缝）|
|P2|KEEP|`auto:amazon/desert/savanna/subarctic forest hunter-gatherers`、`auto:cree`（5 项）|通用文化层的真实 D4 缺口；与民族层的重叠为上游固有，待 D3 遮挡能力再评估|
|P2|KEEP|12 个加勒比条目（12 项）|标准 D4 纯几何缺口，无身份冲突|

## Constraints honored

- 未修改 `data/identity/continuity.json`（保持 26 条 / 48 项）。
- 未修改 `public/data/**`（含年份文件、`entities.json`、`manifest.json`、`relations/**`）。
- 未运行 `npm run data:build`、未运行 `npm run data:verify`、未运行 relations 管线、未构建前端。
- 未修改 `scripts/**`、`tests/**`、`src/**`。
- 唯一写入：本报告 `reports/L1-continuity-identity-audit.md`。

## Evidence artifacts（临时，可删）

|路径|内容|
|-|-|
|`%TEMP%\dsh-hXGnmE\l1-identity-audit.json`|48 项的注入要素、采样点、覆盖率、邻年比较、run 分裂信号、自动初判风险|
|`%TEMP%\dsh-hXGnmE\l1-identity-audit.txt`|上述结果的 49 行制表符摘要（本次审计读表用）|
|`%TEMP%\dsh-hXGnmE\l1-identity-geom.txt`|13 个 case 的源年 raw 属性、目标年相交要素明细、顶点级几何判定（597 行）|

审计脚本（工作区临时文件，审计结束后删除）：`.tmp-l1-idaudit.mjs`、`.tmp-l1-idgeom.mjs`。
