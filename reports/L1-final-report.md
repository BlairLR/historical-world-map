# L1 阶段最终封存报告（Final Seal）

- **阶段**：L1 — political continuity identity 补全与 identity audit 局部回滚
- **状态**：**已冻结（frozen）**。本报告只记录当前已完成并验收通过的实际状态，不引入任何新的审计、研究、修复或优化。
- **范围**：本阶段只改动 `data/identity/continuity.json`（+ 为满足「所有测试通过」而按裁定 C4 同步的 `tests/relations/run.mjs` 3 处数值），并重新生成受影响的产物数据。

---

## 1. L1 continuity identity 的最终目标状态

### 1.1 continuity 配置

|指标|最终值|
|-|-|
|保留 continuity entry|**19 条**|
|保留 (key, year) target|**30 个**|
|`data/identity/continuity.json`|6,250 B · SHA-256 `A160A00435BA80E85AB4CF996331EE2B7657B353DED22F5817D3677A0E3BB767`|
|注入来源年份|400, 600, 1492, 1715, 1914, 1945|
|覆盖快照|13 个（500×1、600×1、700×2、800×1、900×1、1500×1、1783×3、1800×3、1920×1、1930×1、1938×1、1945×1、1960×13）|

### 1.2 累计回滚的 18 个 `(claim, year)` 注入

|claim|回滚 target 数|年份|
|-|-|-|
|`auto:siam`|7|1815, 1878, 1880, 1900, 1914, 1920, 1930|
|`auto:kalmar union`|1|1492|
|`auto:eastern north american hunter-gatherers`|6|-100, -1, 100, 200, 300, 400|
|`auto:amazon hunter-gatherers`|1|1492|
|`auto:desert hunter-gatherers`|1|1492|
|`auto:savanna hunter-gatherers`|1|1492|
|`auto:subarctic forest hunter-gatherers`|1|1492|
|**合计**|**18**|7 个 claim|

回滚理由（已裁定）：`auto:siam` 与 `auto:kalmar union` 属 HIGH（同政体双绘 / identity 重叠）；`auto:eastern north american hunter-gatherers` 与 4 个 hunter-gatherer 键属广义文化 / 人群 / 生态分类，不是稳定单一政治实体，跨年补全隐含「identity 与空间边界连续」的不成立假设（不符合 continuity eligibility）。

### 1.3 最终数据总量

|指标|最终值|
|-|-|
|features 合计（54 快照）|**17,469**|
|vertices 合计|**1,929,821**|
|entity count|**3,055**（`entities.json`；`manifest.entityCount` 同为 3,055）|
|`colors.json` 记录数|3,097（未变）|

> 对照 L1 补全起点：features 17,487 → 17,469（−18）；vertices 1,942,804 → 1,929,821（−12,983）；continuity entry 26 → 19（−7）；target 48 → 30（−18）。entity count 全程保持 3,055。

---

## 2. 最终验收记录

|验收项|结果|证据（摘要）|
|-|-|-|
|`npm run data:build`|**PASS**（exit 0）|`合计：17469 features / 1929821 顶点 / 41.64 MB`；`颜色注册表：新增 0 条，总计 3097 条`；`连续性补全：注入 30 个要素（13 个快照 · 19 个条目）`；`无数值 key / 身份缺失的要素：6994`|
|`npm run data:verify`|**PASS**（exit 0 · ✓ 全部通过）|`54 个快照 / 17469 features / 1929821 顶点 / 41.64 MB / 3056 个历史政权实体`；**AR11 连续性补全 30 个 · 配置 19 个条目 · 命中 30**；**AR12 重复几何归并 1 个 (key, year) · 配置 1 个条目**；**注册表命中 3056 / 3056（AR7）**；AR10 54/54；不同颜色 2480；全局撞色实体 1074|
|`npm run data:relations`|**PASS**（exit 0）|54 个 sidecar 重写；`features 17469`、`unnamedFeatures 7048`、`noKeyFeatures 7046`、`keyPresentNameEmpty 12`、`evidenceCellsYearKeyName 10129`、`unresolvedCellFeatures 10346`、`resolved 77`、`unresolved 17392`、`conflicts 0`；digest `BF58E1D1944F8C8BFAD33C977A623C297254FDA8AAEAD12BFD628053638CE57C`；`selfCheck.equal: true`|
|relations tests|**19 / 19 PASS**（exit 0）|`l1b-validation.json`：`summary {total:19, passed:19, failed:0}`；`productionIntegrity {checked:115, changed:0, hashMatches:115}`；`schemaValidation {recordsChecked:17469, polityCount:3055, 各项 ok:true}`|
|双跑确定性|**PASS**|第二次 `data:build` 后 `public/data` 110 个文件中 **changed 1 / added 0 / removed 0**，唯一变化 `manifest.json`（仅 `generatedAt`），其余 109 个逐字节相同；relations 跨进程 digest 两次一致（`digestRun1 == digestRun2`、`fileMismatches: []`）|
|`data/raw` 未修改|**PASS**|`data/raw/**` **55 / 55** 个文件 SHA-256 全部相同（71,437,710 B 不变）|
|`data/identity/colors.json` 未修改|**PASS**|109,721 B 逐字节不变 · SHA-256 `50B596BAC4B923CBFFCB3709DC334EC107ADAAD9F7E05D4951C556D98FD831F7`；build 日志「新增 0 条」|
|新增依赖|**0**|`package.json` 未改动；只用 npm|

补充事实：
- `tests/relations/run.mjs` 仅做了 3 处**纯数值同步**（C4 规则，未删除断言、未放宽阈值）：L203 `17,487 → 17,469`、L526-527（T12 断言与消息）`10,440 → 10,423`、L582 `recordsChecked 17,487 → 17,469`。
- T11 受保护文件：**115 个**（identity 4 + years 54 + entities + manifest + raw 55），运行前后 0 changes，并与阶段基线（115 行）完全一致。
- 本阶段唯一非回滚附件的产物变化是台湾 1994 重复几何修复（引入 `data/identity/unnamed-attribution.json` 与 AR12，`public/data` +28 B），已完成验收，详见 `reports/taiwan-1994-duplicate-geometry-report.md`。

---

## 3. 冻结声明与本阶段遗留事项

**本阶段到此冻结。** 以下事项**不在本阶段范围内**，作为后续阶段遗留事项记录，**不属于本阶段失败**：

1. **剩余 MEDIUM continuity 不处理**：`auto:malta`（5）、`auto:guanches`（3）、`auto:tuʻi tonga empire`（3）、`auto:guadeloupe`（2）、`auto:haiti`（2）、`auto:martinique`（2）——共 **17 项 / 6 条**，保留原状。
2. **剩余 LOW continuity 不处理**：`auto:cree`@1500 + 12 个加勒比 @1960——共 **13 项 / 13 条**，保留原状。
3. **D1/D2 identity audit 不处理**：如 `auto:siam` 与 `auto:siam#1`（1800 vs 1938）、`auto:kalmar union` 与 `DK-NORWAY`/`auto:sweden` 等「同 key 多 run / 名称阶段关系」裁定。
4. **`dist/data` 不同步**：仍为 L1 回滚前状态（110 文件 / 46,775,650 B），与 `public/data`（46,501,882 B）不一致。
5. **台湾 1500 / bc2000 的 unnamed-attribution 不处理**：两处与 1994 同型的无属性重复几何已取证并可「加一条配置即启用」，本阶段不启用。

---

## 4. 未修改清单（封存核对）

- `data/raw/**`（55 个文件逐字节不变）
- `src/**`
- `data/identity/colors.json`
- `data/identity/continuity.json` 中**除已回滚条目外的其他 entry**（剩余 19 条 / 30 目标未动）
- 测试规则（`tests/relations/run.mjs` 仅 3 处数值同步，无规则改动）
- `package.json`
- `scripts/**`、`data/geo/**`、`data/identity/aliases.json`、`data/relations/relations.json`、`data/relations/authorities.json`

## 5. 交付物

|类型|路径|
|-|-|
|本报告（新增）|`reports/L1-final-report.md`|
|阶段主报告|`reports/L1-rollback-identity-audit-report.md`（累计两轮）|
|审计依据|`reports/L1-continuity-identity-audit.md`|
|附件|`reports/taiwan-1994-duplicate-geometry-report.md`|
|被冻结的配置|`data/identity/continuity.json`（19 条 / 30 目标）|

## 6. 版本库状态

当前目录**不是 git repository**：

```
fatal: not a git repository (or any of the parent directories): .git
```

因此本阶段无 commit / diff 记录，全部变更以文件系统实际状态与本报告为准。
