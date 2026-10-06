# L1 Rollback — Identity Audit Report（累计：第 1 轮 + 第 2 轮）

- **任务**：按 identity audit 结论对 L1 political continuity 补全做**局部回滚**——保留真正的 D4 几何缺口补全，删除 identity 连续性判断错误的条目。
- **执行范围**：只改 `data/identity/continuity.json`（+ 为满足「所有测试通过」而同步的测试常量，见 §10）。
- **上游依据**：`reports/L1-continuity-identity-audit.md`（HIGH 2 条 / MEDIUM 7 条 / LOW 17 条）。
- **第 1 轮删除**：`auto:siam`（7 项）、`auto:kalmar union`（1 项）、`auto:eastern north american hunter-gatherers`（6 项）——audit 中 2 条 HIGH 全部 + 1 条 MEDIUM（该 key 为广义文化/人群分类，不构成稳定单一政治实体，跨 500 年补全隐含「identity 与空间范围不变」的不可靠假设）。
- **第 2 轮删除**：`auto:amazon hunter-gatherers`、`auto:desert hunter-gatherers`、`auto:savanna hunter-gatherers`、`auto:subarctic forest hunter-gatherers`（各 1 项，均 @1492）——理由与第 1 轮的 `eastern north american hunter-gatherers` 同类：key 属于 hunter-gatherers 人群/生态分类，不是稳定单一政治实体；由 1400 年补全 1492 隐含「identity 与空间边界在邻年之间连续」的假设，不满足 continuity eligibility。
- **累计**：7 个 claim / **18 个 (claim, year) 目标**。
- **未处理**：其余 6 条 MEDIUM（`malta`、`guanches`、`tuʻi tonga empire`、`guadeloupe`、`haiti`、`martinique`，共 17 项）按第 2 轮指令「停止，不处理其他 MEDIUM」原样保留；D1/D2 未处理；未重新设计 identity 系统；未改颜色分配。

---

## 0. 累计总览（两轮）

|指标|L1 补全起点|第 1 轮后|台湾 1994 修复（附件，非本审计）|第 2 轮后（当前）|两轮累计|
|-|-|-|-|-|-|
|`continuity.json` entries|26|23|23|**19**|−7|
|`(key, year)` 注入目标|48|34|34|**30**|−18|
|`continuity.json` 字节|8,350 B|7,377 B|7,377 B|**6,250 B**|−2,100 B|
|features 合计|17,487|17,473|17,473|**17,469**|−18|
|vertices 合计|1,942,804|1,930,012|1,930,012|**1,929,821**|−12,983|
|`public/data` 字节|46,775,650 B|46,507,839 B|46,507,867 B（+28 B）|**46,501,882 B**|−273,768 B ※|
|`entities.json` entity count|3,055|3,055|3,055|**3,055**|0|
|`colors.json` SHA-256|`50B596BA…31F7`|同左|同左|**同左**|0 变更|

※ 两轮回滚合计 −267,811 − 5,985 = **−273,796 B**，另有台湾 1994 修复（独立任务）带来的 **+28 B**，净 −273,768 B。

**剩余 continuity（当前）= 19 条目 / 30 目标**：
- MEDIUM 保留 **17 项 / 6 条**：`auto:malta` 5（1920/1930/1938/1945/1960）+ `auto:guanches` 3（500/600/700）+ `auto:tuʻi tonga empire` 3（700/800/900）+ `auto:guadeloupe` 2（1783/1800）+ `auto:haiti` 2（1783/1800）+ `auto:martinique` 2（1783/1800）。
- LOW 保留 **13 项 / 13 条**：`auto:cree` 1（1500）+ 12 个加勒比 @1960（`anguilla`、`antigua and barbuda#1`、`barbados#1`、`dominica`、`grenada#2`、`montserrat#1`、`netherlands antilles`、`saint barthelemy`、`saint kitts and nevis`、`saint lucia#2`、`saint martin`、`saint vincent and the grenadines#2`）。第 1 轮时为 17 条，本轮删除其中 4 条 1492 通用文化层。

---

## 1. continuity.json 删除条目数量

|指标|第 1 轮回滚前|第 1 轮后|第 2 轮前|第 2 轮后（当前）|
|-|-|-|-|-|
|entries（条目）|26|23|23|**19**|
|(key, year) 注入项|48|34|34|**30**|
|文件大小|8,350 B|7,377 B|7,377 B|**6,250 B**|
|SHA-256|`669E7C852648A60E42B661EC8B5AADEBAFE75D59E32403585F43D5C4FE752F8E`|`DBD6E66777A57F1686F3608D835C8E5C7D4AD40E9E1F807268E7D5BF91945050`|同左|`A160A00435BA80E85AB4CF996331EE2B7657B353DED22F5817D3677A0E3BB767`|

删除的 entry 及 `geometryFrom`：

|轮次|claim|key|geometryFrom|删除的 target years 数|
|-|-|-|-|-|
|1|`auto:siam`|`siam`|1800|7|
|1|`auto:kalmar union`|`kalmar union`|1400|1|
|1|`auto:eastern north american hunter-gatherers`|`eastern north american hunter-gatherers`|-200|6|
|2|`auto:amazon hunter-gatherers`|`amazon hunter-gatherers`|1400|1|
|2|`auto:desert hunter-gatherers`|`desert hunter-gatherers`|1400|1|
|2|`auto:savanna hunter-gatherers`|`savanna hunter-gatherers`|1400|1|
|2|`auto:subarctic forest hunter-gatherers`|`subarctic forest hunter-gatherers`|1400|1|

## 2. 删除的 (claim, year) 列表（累计 18 项）

|#|轮次|claim|year|audit 风险|删除原因|
|-|-|-|-|-|-|
|1|1|`auto:siam`|1815|HIGH|1800 的 key `siam` 是柬埔寨境内飞地；与 `auto:rattanakosin kingdom` 同政体双绘（该年 100% 压在 `auto:cambodia` 上）|
|2|1|`auto:siam`|1878|HIGH|同上（该年 100% 压在 `auto:france`「French Indochina」上）|
|3|1|`auto:siam`|1880|HIGH|同上（该年 100% 压在 `auto:france`「French Indochina」上）|
|4|1|`auto:siam`|1900|HIGH|同上（同年 `auto:rattanakosin kingdom` 并存）|
|5|1|`auto:siam`|1914|HIGH|同上（93% 压在 `auto:rattanakosin kingdom` 上）|
|6|1|`auto:siam`|1920|HIGH|同上（93%）|
|7|1|`auto:siam`|1930|HIGH|同上（93%）|
|8|1|`auto:kalmar union`|1492|HIGH|1492 该区域已由 `DK-NORWAY`（60%）与 `auto:sweden`（20%）表达，重复绘制 + identity 重叠|
|9|1|`auto:eastern north american hunter-gatherers`|-100|MEDIUM|key 为广义文化/人群分类，非稳定单一政治实体；跨 500 年补全隐含 identity 与空间范围不变的不可靠假设|
|10|1|`auto:eastern north american hunter-gatherers`|-1|MEDIUM|同上|
|11|1|`auto:eastern north american hunter-gatherers`|100|MEDIUM|同上|
|12|1|`auto:eastern north american hunter-gatherers`|200|MEDIUM|同上|
|13|1|`auto:eastern north american hunter-gatherers`|300|MEDIUM|同上|
|14|1|`auto:eastern north american hunter-gatherers`|400|MEDIUM|同上|
|15|2|`auto:amazon hunter-gatherers`|1492|LOW→裁定回滚|key 属 hunter-gatherers 人群/生态分类，非稳定单一政治实体；1400→1492 补全隐含 identity 与空间边界连续，不满足 continuity eligibility（与 #9–14 同类）|
|16|2|`auto:desert hunter-gatherers`|1492|LOW→裁定回滚|同上|
|17|2|`auto:savanna hunter-gatherers`|1492|LOW→裁定回滚|同上|
|18|2|`auto:subarctic forest hunter-gatherers`|1492|LOW→裁定回滚|同上|

分级构成：HIGH 8 项（全部第 1 轮）、MEDIUM 6 项（第 1 轮）、原 LOW 4 项（第 2 轮由用户裁定按同类问题一并回滚）。**其他 continuity 一律未动。**
第 1 轮保留清单（当时 34 项 = MEDIUM 17 + LOW 17）见本节历史版本；第 2 轮后的剩余构成见 §0。

## 3. feature 总数变化

|指标|第 1 轮|第 2 轮|两轮累计|
|-|-|-|-|
|features 合计（54 快照）|17,487 → **17,473**（−14）|17,473 → **17,469**（−4）|−18|
|受影响年份文件数|**14**（每文件恰 −1）|**1**（`world_1492.json`，−4）|15 个文件|

第 2 轮逐年（只影响 1492）：

|year|features|vertices|bytes|
|-|-|-|-|
|1492|1,946 → **1,942**|112,237 → **112,046**|2,839,271 → **2,833,925**（−5,346 B）|

- `unnamed` 计数 625 → 625 不变（被删的 4 个目标都是**有 key 要素**，不是 UNNAMED）。
- 第 1 轮逐年明细（−100 / −1 / 100 / 200 / 300 / 400 / 1492 / 1815 / 1878 / 1880 / 1900 / 1914 / 1920 / 1930 各 −1 feature）见该轮记录，未变化。
- 其余 53 个年份文件内容逐字节不变（`writeIfChanged` 使未变化文件保持原 mtime）；注入要素恒为年份文件末尾追加，删除只影响这些文件的**尾部 id**，既有原生 feature 的 id 不变。

## 4. vertices 变化

|指标|第 1 轮|第 2 轮|两轮累计|
|-|-|-|-|
|vertices 合计|1,942,804 → **1,930,012**（−12,792）|1,930,012 → **1,929,821**（−191）|−12,983|

第 2 轮构成（与 `world_1400.json` 中该 key 的实际几何顶点数逐一吻合）：

|claim|源几何（1400）顶点|1492 产物减少|
|-|-|-|
|`auto:amazon hunter-gatherers`|19|−19|
|`auto:desert hunter-gatherers`|18|−18|
|`auto:savanna hunter-gatherers`|48|−48|
|`auto:subarctic forest hunter-gatherers`|106|−106|
|**合计**|**191**|**−191**|

第 1 轮构成：`eastern north american hunter-gatherers` 6 项 × −1,669 = −10,014；`kalmar union`@1492 −2,652；`siam` 7 项 × −18 = −126。

## 5. public/data 体积变化

|指标|第 1 轮|第 2 轮|两轮累计|
|-|-|-|-|
|`public/data` 文件数|110 → 110|110 → 110|0|
|`public/data` 总字节|46,775,650 B → 46,507,839 B（−267,811 B）|46,507,867 B → **46,501,882 B**（−5,985 B）|−273,796 B（另含台湾修复 +28 B）|
|年份文件合计|43,932,738 B → 43,667,058 B|43,667,080 B → **43,661,734 B**（−5,346 B）|—|
|`entities.json`|462,399 B → 462,335 B（−64 B）|462,335 B → **462,315 B**（−20 B）|−84 B|
|`manifest.json`|15,504 B（内容变更）|15,504 B → **15,504 B**（内容变更）|0 B（仅内容）|
|relations sidecar 合计|2,365,009 B → 2,362,942 B|2,362,948 B → **2,362,329 B**（−619 B）|−2,680 B|
|`data/identity` 合计|—|131,071 B → **129,944 B**（−1,127 B）|—|
|`dist/data`|未同步|未同步（110 文件 / **46,775,650 B**）|—|

SHA-256：

|文件|第 2 轮前|第 2 轮后|
|-|-|-|
|`data/identity/continuity.json`|`DBD6E667…5050`|`A160A00435BA80E85AB4CF996331EE2B7657B353DED22F5817D3677A0E3BB767`|
|`public/data/entities.json`|`CE8913CC3AB4324E5438581521AF61C0C1025D9FFBB8703F3C3BB6490A97E83D`|`57756FA712E5A8D79BE6349E267E8D75319F9414487DF458748CCBC861490207`|
|`public/data/manifest.json`|`FAE4A814A99B18328FA8F02615348D81BB7BA33BB91DA568925019F86FCB5E0D`|`E32B90F4891F06EEFFC8B6EE3D5220F44DD408BE494BC37640E2F7F59FDEBAA9`|
|`public/data/years/world_1492.json`|`74516FBCFDB89CE9411D05B74E3478ACF591608A1C7FB671363A1B05892EAA06`|`F9EADF587B723157D9608651AC548CB26137EAB741BA7A58D1462D676E99145D`|

`manifest.json` 变更来自 1492 快照的 features/vertices/bytes 字段 + `generatedAt`（`entityCount` 仍 3055）。
`dist/data` 未同步（不在两轮指令的执行命令清单内），相对 `public/data` 陈旧，见 §12。

## 6. entities.json entity count 是否保持 3055

**不变：3,055 → 3,055**（第 1 轮、第 2 轮均如此；不增不减）。`manifest.entityCount` = 3055；`data:verify` 报「实体总数 3056（entities.json 3055）」（含 `UNNAMED`）。

第 2 轮 `entities.json` 变更（−20 B，SHA 见 §5）仅限 4 个被删 claim 的 `years` 收缩（颜色字段不变）：

|entityId|第 2 轮后 years|颜色|
|-|-|-|
|`auto:amazon hunter-gatherers`|32 年（`[-1500 … 1400, 1500, 1530, 1600, 1650, 1700, 1715, 1783]`，1492 被移除）|不变|
|`auto:desert hunter-gatherers`|26 年（`[-1500 … 1400, 1500]`，1492 被移除）|不变|
|`auto:savanna hunter-gatherers`|32 年（`[-1500 … 1400, 1500, 1530, 1600, 1650, 1700, 1715, 1783]`，1492 被移除）|不变|
|`auto:subarctic forest hunter-gatherers`|31 年（`[-1500 … 1400, 1500, 1530, 1600, 1650, 1700, 1715]`，1492 被移除）|不变|

第 1 轮变更（−64 B）仅限 `auto:siam`（→`[1800]`）、`auto:kalmar union`（→`[1400,1500]`）、`auto:eastern north american hunter-gatherers`（→ 8 年）；`auto:siam#1`、`auto:eastern north american hunter-gatherers#1` 未被触碰。

## 7. colors.json SHA256 是否保持不变

**两轮均逐字节不变 ✓**

- 大小 109,721 B（不变）· 记录数 3,097（不变）
- SHA-256 `50B596BAC4B923CBFFCB3709DC334EC107ADAAD9F7E05D4951C556D98FD831F7`（第 1 轮前 / 第 1 轮后 / 第 2 轮前 / 第 2 轮后全部相同）
- build 日志（两轮均有）：`颜色注册表：新增 0 条，总计 3097 条`
- verify（第 2 轮）：`注册表命中 3056 / 3056（AR7）`；`不同颜色 2480`；`全局撞色实体 1074 个`

## 8. relations sidecar 覆盖变化

|指标|第 1 轮|第 2 轮|两轮累计|
|-|-|-|-|
|sidecar 文件数|54 → 54|54 → 54|0|
|sidecar 记录合计|17,487 → **17,473**|17,473 → **17,469**|−18|
|sidecar 字节合计|2,365,009 B → 2,362,942 B|2,362,948 B → **2,362,329 B**|−2,680 B|
|内容变化的 sidecar|14 个（−100/−1/100/200/300/400/1492/1815/1878/1880/1900/1914/1920/1930）|**1 个（1492）**|15 个文件次|

（第 2 轮只有 1492 年份文件作为输入发生变化，而 sidecar 是「年份文件 + 规则集」的确定性纯函数——同一次运行内 T10 已逐字节验证磁盘产物与构建结果一致，故内容变化集 = {1492}。）

覆盖度（`npm run data:relations`，空规则集）：

|counts 字段|第 1 轮前|第 1 轮后|第 2 轮前|第 2 轮后|
|-|-|-|-|-|
|features|17,487|17,473|17,473|**17,469**|
|unnamedFeatures|7,049|7,049|7,048|**7,048**|
|noKeyFeatures|7,047|7,047|7,046|**7,046**|
|keyPresentNameEmpty / Null / WhitespaceOnly|12 / 9 / 3|12 / 9 / 3|12 / 9 / 3|12 / 9 / 3|
|evidenceCellsYearKeyName|10,147|10,133|10,133|**10,129**|
|evidenceCellsYearKeyNameBaselineP41A|10,143|10,129|10,129|**10,125**|
|evidenceCellsYearKey|9,761|9,747|9,747|**9,743**|
|evidenceCellsResolved / Unresolved|43 / 10,104|43 / 10,090|43 / 10,090|43 / **10,086**|
|unresolvedCellFeatures / resolved / unresolved（feature 口径）|10,363 / 77 / 17,410|10,349 / 77 / 17,396|10,350 / 77 / 17,396|**10,346** / 77 / **17,392**|
|conflicts|0|0|0|0|
|digest|`50D12721…A400`|`EFF6BEE6…970E`|`497C9048…D06D`|`BF58E1D1944F8C8BFAD33C977A623C297254FDA8AAEAD12BFD628053638CE57C`|
|selfCheck（两跑一致）|equal: true|equal: true|equal: true|equal: true|

第 2 轮所有差异都可由「删除 4 个注入 feature」精确解释：单元数 −4（10,133 → 10,129）、`(year,key)` 单元 −4（9,747 → 9,743）、未覆盖 feature −4；`noKeyFeatures` / `keyPresentName*` 等身份统计不变（注入要素均为有 key 要素）。

## 9. data:build / data:verify / data:relations / tests 全部结果

### 第 2 轮 `npm run data:build` — exit 0

```
快照数：54 / 上游共 54 个年份
合计：17469 features / 1929821 顶点 / 41.64 MB
丢弃退化几何总计：331
实体：3055 个（手工 56）· 不同颜色 2479 个 · 全局撞色实体 1074 个
颜色注册表：新增 0 条，总计 3097 条 → data/identity/colors.json
地理实体：登记 1 个 · 归一要素 54 个（归入 UNNAMED #9aa0a6） · R-A 补全年份 1 个（-5000）
连续性补全：19 个 key · 30 个目标年份（几何取各自 geometryFrom 年，身份沿用源侧 run）
连续性补全几何：19 个条目取自 6 个来源年份 → 30 个注入项，覆盖 13 个快照
连续性补全：注入 30 个要素（13 个快照 · 19 个条目 · 来源年份 400, 600, 1492, 1715, 1914, 1945） → data/identity/continuity.json
无数值 key / 身份缺失的要素：6994（归入 UNNAMED）
无属性重复几何归并：1 个要素接回同快照原生政权（1 个年份 · 1 个条目） → data/identity/unnamed-attribution.json
输出目录：D:\dsh-workspace\historical-world-map\public\data
```

注入分布（13 个快照）：500×1、600×1、700×2、800×1、900×1、1500×1、1783×3、1800×3、1920×1、1930×1、1938×1、1945×1、1960×13 = 30。**1492 已不再接收任何补全**。

### 第 2 轮 `npm run data:verify` — exit 0 · ✓ 全部通过

```
身份与配色：
  实体总数            3056（entities.json 3055）
  不同颜色            2480
  全局撞色实体        1074 个（沿用改动前颜色，AR4 有意保留）
  keys 有交集的组     135 组（组内已强制异色，AR3）
  注册表命中          3056 / 3056（AR7）
  AR4 45° 窗口       最拥挤窗口 518 个实体（1492 年格 4,8）· 该窗口不同颜色 499
  AR4 窗口内同色对数 546（信息性指标）
  AR10 地理实体      南极洲几何 54 / 54 个快照 · 极地要素合计 54（全部 UNNAMED #9aa0a6）
  AR11 连续性补全    30 个 (key, year) 在场并归属声明实体 · 配置 19 个条目 · 命中 30
  AR12 重复几何归并  1 个 (key, year) 接回同快照原生政权 · 配置 1 个条目

✓ 全部通过：54 个快照 / 17469 features / 1929821 顶点 / 41.64 MB / 3056 个历史政权实体
```

（AR4 最拥挤窗口由第 1 轮的 520 个实体 / 501 色降为 518 / 499，即 1492 减少 4 个实体所致。）

### 第 2 轮 `npm run data:relations` — exit 0

见 §8；`selfCheck.equal: true`。stderr 为历史既有 warning：`[relations][C5-D1/D2][warning] 6 条记录不满足最小约束`——1945 年 feature id=5/113/137/143/144/145 `occupied` 但 `sovereignId` 为 null（P4.1-A v3 §7 OQ-C5 张力），与本轮回滚无关。

### 第 2 轮 `node tests/relations/run.mjs --validation … --baseline …` — exit 0 · **19 / 19 PASS**

```
合计 19 项：通过 19 / 失败 0
  ✅ R1  sidecar feature 数量与年份文件完全一致 — 54 个 sidecar 合计 17469 个 feature，逐年与年份文件一致
  ✅ T9  Conservatism：7,046 无 key + 12 有 key 无 NAME 全部保守
  ✅ T11 production protection：关系层工具运行前后生产文件 0 changes — 115 个受保护文件（identity 4 + years 54 + entities + manifest + raw 55）哈希全部未变；并与阶段前基线（115 行）完全一致
  ✅ T12 Coverage & audit：生产规则集（19 条）：10086/10129 个单元未覆盖（覆盖 10346 个 feature），另有 77 个 feature / 43 个单元已 resolved；夹具规则集下 9 个 feature / 7 个单元 resolved，分类完整
  ✅ R2–R10 / T2–T4 / T10 / T13 / T14 全部通过（描述同第 1 轮，数字按 §8 更新）

机器可读结果（l1b-validation.json，5,409 B）：
  summary              {total: 19, passed: 19, failed: 0}
  determinism          {digestRun1 == digestRun2 == bf58e1d1…e57c, equal: true, filesCompared: 54, fileMismatches: []}
  productionIntegrity  {checked: 115, changed: 0, hashMatches: 115, baseline: "l1b-baseline.txt"}
  schemaValidation     {recordFieldsOk: true, topLevelOk: true, authorityNamespaceOk: true, sovereignRegistryOk: true, recordsOk: true, recordsChecked: 17469, polityCount: 3055}
```

- 验证 JSON：`%TEMP%\dsh-hXGnmE\l1b-validation.json`
- 阶段基线（第 2 轮回滚后状态，115 行 / 12,562 B）：`%TEMP%\dsh-hXGnmE\l1b-baseline.txt`
- 首次运行时 R1（feature 合计）与 T12（有 key feature 总数）因测试常量仍编码回滚前的 L1 数据（17,473 / 10,427）而失败 → 按 §10 同步常量后 19/19，无其他改动。

### 双跑确定性（build 第二次，验证 D6，第 2 轮）

第二次 `npm run data:build` 后逐文件比对 `public/data` 全部 110 个文件：**changed 1 / added 0 / removed 0**，唯一变化 `public/data/manifest.json`（15,504 B，仅 `generatedAt`）；其余 109 个逐字节相同（含 `world_1492.json`、`entities.json`、54 个 sidecar），`合计 17469 features / 1929821 顶点` 复现。

## 10. 为满足「所有测试通过」而同步的测试常量（必要偏差，需知悉）

指令要求「仅修改 `data/identity/continuity.json`」，但 `tests/relations/run.mjs` 内硬编码了 L1 之后的数据总量；不回滚这些常量则 R1 / T12 必然失败。按此前 L1 裁定 **C4**（「测试修改只能同步真实数据变化，不允许降低断言强度」）做**纯数值同步**（无断言删除、无阈值放宽、无跳过）：

|文件|位置|L1 起点|第 1 轮后|第 2 轮后（当前）|
|-|-|-|-|-|
|`tests/relations/run.mjs`|L203 `assert(total === …)`|17,487|17,473|**17,469**|
|`tests/relations/run.mjs`|L526-527（T12 断言 + 消息）|10,440|10,426|**10,423**（= 未覆盖 10,346 + resolved 77）|
|`tests/relations/run.mjs`|L582 `recordsChecked`|17,487|17,473|**17,469**|

除上述 3 处数值（两轮累计 6 次写入、3 个位置）外，两轮回滚**只修改** `data/identity/continuity.json`。`scripts/**`、`src/**`、`data/raw/**`、`data/geo/**`、`data/identity/colors.json`、`data/identity/aliases.json`、`data/relations/relations.json` 全部未改动。

## 11. 验收标准核对（第 2 轮）

|验收标准|结果|证据|
|-|-|-|
|`colors.json` 逐字节不变|**✓ 通过**|SHA-256 前后同为 `50B596BA…31F7`；build 日志「颜色注册表：新增 0 条」|
|entity count 不增不减|**✓ 通过**|`entities.json` 3,055 → 3,055；`manifest.entityCount` 3055；verify「实体总数 3056（含 UNNAMED）」|
|raw 数据 0 修改|**✓ 通过**|与变更前快照逐文件比对：`data/raw/**` **55 / 55** 个文件 SHA-256 全部相同（`data/raw` 71,437,710 B 不变）|
|所有测试通过|**✓ 通过**|19 / 19 PASS（exit 0）；T11 保护文件 115 个、0 changes|
|其他 continuity 不变|**✓ 通过**|仅删除 4 个 1492 目标；其余 19 条目 / 30 目标逐字节保持（build 注入分布与第 1 轮相同，除 1492 消失）|

受保护文件变化集（第 2 轮）= **4 个**：`data/identity/continuity.json`、`public/data/entities.json`、`public/data/manifest.json`、`public/data/years/world_1492.json`；其余 **111 个**受保护文件逐字节不变。

## 12. 未处理的项（保持原状，等待裁定）

1. **6 条 MEDIUM 保留**：`auto:malta`、`auto:guanches`、`auto:tuʻi tonga empire`、`auto:guadeloupe`、`auto:haiti`、`auto:martinique`（共 17 项）——均为跨 run 缝隙桥接，需 D1/D2 裁定「`auto:x` 与 `auto:x#n` 是否为同一实体」。
2. **13 条 LOW 保留**：`cree`@1500 + 12 个加勒比 @1960。（原 17 条中的 4 条 1492 通用文化层已按第 2 轮指令删除。）
3. **D1/D2 未处理**：`auto:siam` 与 `auto:siam#1`（1800 vs 1938，名称相同、几何与 run 不同）仍是同一 key 的两段 identity；`auto:kalmar union` 与 `DK-NORWAY`/`Sweden` 的名称阶段关系亦未裁定。
4. **`dist/data` 陈旧**：`dist/data` 仍为 L1 回滚前状态（110 文件 / 46,775,650 B），与 `public/data`（46,501,882 B）不一致。指令未包含 dist 同步或前端构建，故未执行。
5. **`manifest.json` 的 `generatedAt`** 使每次 build 都会改动该文件，因此任何「按 manifest 哈希做阶段基线」的做法都需在 build 之后重新生成基线。
6. **附件（非本审计）**：`reports/taiwan-1994-duplicate-geometry-report.md` 记录的台湾 1994 重复几何修复引入了 `data/identity/unnamed-attribution.json` 与 verify 的 AR12，使 T11 的 identity 文件数 3 → 4、受保护文件数 114 → 115、`public/data` +28 B。

## 13. 交付物

|类型|路径|
|-|-|
|修改|`data/identity/continuity.json`（26 → 19 条；6,250 B；`A160A004…B767`）|
|修改|`tests/relations/run.mjs`（仅 3 处数值同步；见 §10）|
|重新生成|`public/data/years/*.json`（第 1 轮 14 个 + 第 2 轮 `world_1492.json`）、`public/data/entities.json`、`public/data/manifest.json`、`public/data/relations/*.json`（第 1 轮 14 个 + `1492.json`）|
|报告|`reports/L1-rollback-identity-audit-report.md`（本报告，累计两轮）· 依据 `reports/L1-continuity-identity-audit.md` · 附件 `reports/taiwan-1994-duplicate-geometry-report.md`|
|未改动|`data/raw/**`、`data/geo/**`、`data/identity/colors.json`、`data/identity/aliases.json`、`data/relations/relations.json`、`data/relations/authorities.json`、`src/**`、`scripts/**`、`package.json`、`dist/**`|
