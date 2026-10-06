# 台湾 1994「两片不同颜色重叠」修复报告

- 报告日期：本阶段（D4 同类几何归并）
- 触发：用户反馈「台湾1994年好像有问题，看起来像两片相似不同颜色的台湾重叠，你尝试解决」
- 结论：**已修复**。1994 年台湾岛不再出现灰色细轮廓叠加在有色粗轮廓之上；`data/raw/**` 与颜色注册表逐字节未变；构建/校验/关系层/19 项测试全绿。

---

## 1. 症状与根因

### 1.1 症状（用户所见）

1994 年地图上台湾岛呈现两片形状相似、颜色不同的多边形重叠：一片是有颜色的粗轮廓，另一片是灰色细轮廓。

### 1.2 取证（只读探针，逐年核对产物与上游原始快照）

产物 `public/data/years/world_1994.json`（240 个 feature）中台湾 bbox 内有两个要素：

| 数组位置 | id | entityId | name | color | 顶点 | 面积 | bbox |
|---|---|---|---|---|---|---|---|
| 前 | 7 | `auto:taiwan#2` | Taiwan | `#bad593` | 29 | 32,925 km² | 119.9503,21.9252,121.7805,25.1344 |
| 后 | 213 | （归入 `UNNAMED_ENTITY`） | null | `#9aa0a6` | 254 | 36,105 km² | 120.0491,21.9278,122.0022,25.2842 |

无属性要素在要素数组里排在具名要素**之后**，即灰色细轮廓后绘制、盖在有色粗轮廓之上 —— 这正是用户看到的「两片不同颜色的台湾重叠」。

上游原始快照 `data/raw/geojson/world_1994.geojson` 中同样存在两份：

- `raw[7]`：具名 Taiwan（`NAME/SUBJECTO/ABBREVN/PARTOF = "Taiwan"`，`BORDERPRECISION = 3`，29 顶点）
- `raw[213]`：`NAME/SUBJECTO/ABBREVN/FIPS_CO/WB_CNTR/PARTOF` **全部为 null**（仅 `BORDERPRECISION = 3`），254 顶点
- 该原始文件里归一化 key 命中 `taiwan` 的要素**恰好 1 个**

⇒ **重复几何来自上游快照，不是本项目管线造成的**。上游在同一快照里同时给出一份具名粗几何和一份无属性细几何。

### 1.3 同型病理还存在于另外两年

同一份无属性台湾几何（254 顶点、同一 bbox、逐顶点一致）还出现在：

| 年份 | 具名要素（产物） | 无属性要素 |
|---|---|---|
| 1994 | `id=7 auto:taiwan#2` `#bad593` 29 顶点 | `id=213` 254 顶点 |
| 1500 | `id=2 auto:taiwan` `#79cb90` 29 顶点 | `id=243` 254 顶点（`raw[251]`） |
| bc2000 | `id=0 auto:dakapeng culture` `#bc7689` 29 顶点 | `id=132` 254 顶点（`raw[132]`） |

### 1.4 全 54 年扫描（界定范围，避免误伤）

在台湾 bbox 内、岛级（≤400 顶点且 bbox 最小经度 ≥119）的要素统计：

- **具名 + 灰色并存（即本病理）：仅 1500 与 1994 两年**
- 灰色 29 + 灰色 254 并存：200、400、700、800、1715、bc300、bc323、bc700、bc1500
- 只有灰色 254 顶点要素：约 21 年
- 只有具名要素：1200、1492、1878、1880、1945、1960、2000、2010、bc3000、bc4000
- 完全无台湾要素：1914、1920、1930、1938、500、bc123000
- 1650 / 1700 是 Dutch Formosa / Middag 等**局部正当重叠**（不同政权在同一岛上的不同区域），**不得归并**

---

## 2. 为什么不用几何启发式

两条只读探针均 **0 命中**，证明几何判据不可靠：

1. `.tmp-tw2.mjs`：同年无属性要素与具名要素配对，要求面积比 ≤3×、bbox 相交、**双向 ≥80% 覆盖** → 54 年 0 对。
2. `.tmp-tw3.mjs`：改为单向「具名要素 ≥85% 落在无属性要素内」（含洞 even-odd 处理）、面积 1.02–6×、无属性 ≤2500 顶点 → 仍 0 命中。

原因：有色粗多边形**西缘探出**灰色细多边形（bbox 最小经度 119.9503 < 120.0491），两者只是部分重叠，包含度阈值无法同时抓住 1994/1500 而不误伤 1650/1700 的正当局部重叠。

另有一条更重要的教训：跨年几何孪生分析发现**数百例**「某年的无属性要素几何与另一年的具名要素逐顶点相同」（Corsica ↔ `auto:corsica`、Cyprus、Hainan、Cuba、Jamaica、Iceland、Greenland、Philippines、Sri Lanka ↔ Simhala/Sinhalese/Ceylon、`RU-FED` ↔ Russia 等）。**跨年几何孪生不能当作身份规则** —— 它会把现代政体身份倒灌给古代无名陆地。任何修法必须**同年限定**（只用同一快照内的证据）。

---

## 3. 修法：声明式配置 + 构建期归并 + 校验期 AR12

### 3.1 方案选择

- **方案 A（采纳）**：把无属性那份几何**归并到同一快照里已有的同名政权**。属性（name/abbrev/subject/partOf/precision）取自同快照同政权的原生要素，**几何保留无属性那份（更细的 254 顶点）**。结果：要素数不变、实体年份集合不变、颜色取自冻结注册表、灰色重复消失、整岛单一颜色。
- 方案 B（否决）：在这些年份抑制/删除灰色重复多边形。否决理由：丢掉 254 顶点的细几何、要素数减少（1994 240 → 239 等），且需要改动覆盖度口径。

### 3.2 配置（新增，声明式，同年限定）

`data/identity/unnamed-attribution.json`（1,306 B）：

```json
{
  "version": 1,
  "_note": "无属性重复几何归并（D4 同年归并）：个别年份的上游快照同时给同一个政权的粗、细两份几何 —— 一份具名（进身份解析），一份 NAME/SUBJECTO 全空（只能落 UNNAMED 中性灰）。空属性那份在要素数组里排在有色要素之后，渲染时会用灰色细轮廓盖住有色粗轮廓，看起来像「两片不同颜色的同一块地重叠」。本配置声明「某年源文件的第 N 个要素」归并到同一快照里已有的同名政权：属性（name/abbrev/subject/partOf/precision）取同快照同政权的原生要素，几何保留空属性那份（更细的那份）。不新增、不删除要素，不改变任何实体的年份集合与颜色。",
  "entries": [
    {
      "key": "taiwan",
      "year": 1994,
      "sourceFeatureIndex": 213,
      "expectVertices": 254,
      "note": "上游 world_1994 同时提供两份台湾岛：raw[7] 具名 Taiwan（29 顶点，BORDERPRECISION 3）与 raw[213] 无属性（NAME/SUBJECTO/ABBREVN/PARTOF 全 null，254 顶点）。raw[213] 的几何与 1945/1960/2000/2010 年的 auto:taiwan#2 逐顶点相同，是同一座岛；归并后 1994 年的台湾只剩一种颜色（auto:taiwan#2 #bad593），且保留 254 顶点的细几何。"
    }
  ]
}
```

配置只声明「哪一年的源文件里第几个要素、属于哪个已有政权、期望多少顶点」——**不含任何几何启发式、不使用跨年证据**。

### 3.3 构建期守卫（任一不满足即 throw，构建失败）

归并前逐条硬校验：

1. 目标要素存在（`sourceFeatureIndex` 越界即失败）
2. 目标要素 `NAME` 与 `SUBJECTO` 均为空（否则它本就有身份，不该被归并）
3. 目标几何顶点数 === `expectVertices`（防止上游改版后静默错并）
4. 同一源文件里归一化 key 命中的原生要素**恰好 1 个**（多于 1 个无法确定属性来源）
5. 该原生要素有 `NAME`
6. 该 `(key, year)` 在实体表里存在（`entityOfYear.get(nk)?.get(year)`）

通过后以该原生要素的 `{NAME, SUBJECTO, ABBREVN, PARTOF, BORDERPRECISION}` 作为 override 注入 `convertFeature`，几何仍取自目标要素本身。逐年日志追加 `⚑ D4 归并重复几何 N`，汇总行打印总归并数与配置路径。

### 3.4 校验期 AR12（`npm run data:verify` 新增）

AR12 同时核对**配置 ↔ 上游原始快照 ↔ 产物**三方：

- 配置结构校验（`validateAttribution`：`version === 1`、`entries` 非空、字段类型、重复 `(key, year)` 与 `(year, sourceFeatureIndex)` 检测）
- 声明的 year 必须是已知快照年份
- 直接读取 `data/raw/geojson/<yearToSourceFile(year)>`：断言源要素 `NAME||SUBJECTO` 为空、源顶点数 === `expectVertices`、同文件同名原生要素恰好 1 个且有 `NAME`
- 遍历产物：该 `(key, year)` 必须有具名要素、只能归入**一个** entityId、不得残留 `UNNAMED_ENTITY`、几何顶点数必须包含 `expectVertices`

---

## 4. 改动文件清单（5 个）

| 文件 | 类型 | 改动 |
|---|---|---|
| `data/identity/unnamed-attribution.json` | **新增** 1,306 B | 1 条 entry（taiwan / 1994 / 213 / 254） |
| `scripts/lib/identity.mjs` | 修改 | 新增 `export function validateAttribution(attribution)`（结构校验 + 重复项检测） |
| `scripts/build-data.mjs` | 修改 | 读取并校验配置、构建 `attributionByYear`、`convertFeature(f, overrideProps)` 支持属性 override、归并守卫、`⚑ D4` 日志与汇总行 |
| `scripts/verify-data.mjs` | 修改 | 新增 AR12（配置 + 上游源文件 + 产物三方校验）、`countGeometryVertices` helper、`yearToSourceFile` import |
| `tests/relations/run.mjs` | 修改（**仅镜像真实数据变化，未削弱任何断言**） | T9:335/:351 `7,047` → `7,046`；T12:526 `10426` → `10427`；T11:562 明细 `identity 3` → `identity 4` |

被归并的那条要素获得 key 后，全局计数随之移动：无 key 要素 7,047 → **7,046**，unnamed 7,049 → **7,048**，`resolved` 单元 10,426 → **10,427**。这些都是数据变化的**镜像**，断言强度未变（`assert(total === 17473)` 等保持不变）。

数据产物重生成：`public/data/years/world_1994.json`、`public/data/entities.json`（内容未变）、`public/data/manifest.json`、54 个关系 sidecar（仅 1994 内容变化）。

---

## 5. 验证结果

| 项目 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check` ×3 脚本 | exit 0 |
| 构建 | `npm run data:build` | exit 0 · `17473 features / 1930012 顶点 / 41.64 MB`（要素数与顶点数**完全不变**）· 实体 3055 · 颜色注册表新增 0（总计 3097）· 连续性补全 34（14 快照 · 23 条目）· `⚑ D4 归并重复几何 1` |
| 校验 | `npm run data:verify` | exit 0 · `✓ 全部通过：54 个快照 / 17473 features / 1930012 顶点 / 41.64 MB / 3056 个历史政权实体` · AR10 54/54 · AR11 命中 34 · **AR12 1 个 (key, year) · 配置 1 个条目** · 注册表命中 3056/3056 |
| 关系层 | `npm run data:relations` | exit 0 · features 17,473 · unnamed 7,048 · noKey 7,046 · `(year,key)` 9,747 · `(year,key,name)` 10,133 · resolved 77 · unresolved 17,396 · conflicts 0 · digest `497c9048fe180cbe04279a90bb496093e33478c66c87a5d0aba4f0a84d75d06d` · selfCheck equal |
| 测试 | `node tests\relations\run.mjs --validation %TEMP%\tw-validation.json --baseline %TEMP%\tw-baseline.txt` | **19/19 通过，exit 0** · `productionIntegrity {checked:115, changed:0, hashMatches:115}` · `schemaValidation {recordsChecked:17473, polityCount:3055, …Ok:true}` · determinism digest 两次一致 / 54 文件 |
| 冻结颜色注册表 | SHA-256 | `data/identity/colors.json` 109,721 B · `50B596BAC4B923CBFFCB3709DC334EC107ADAAD9F7E05D4951C556D98FD831F7` **逐字节未变** |
| 构建确定性 | 连续两次 `data:build` + 全量哈希 | 110 个文件中**只有 `manifest.json`** 变化（15,504 B，`generatedAt` 时间戳），其余 109 个逐字节相同 |

### 5.1 修复后的 1994 台湾

台湾 bbox 内只剩两个要素，且**同为 `auto:taiwan#2` / `#bad593`**：

- `id=7` Taiwan · 29 顶点（粗几何）
- `id=213` Taiwan · 254 顶点（细几何，归并后）

⇒ 灰色 `#9aa0a6` 要素消失，叠色症状解除；`world_1994.json` 的无属性要素数 43 → 42（manifest 1994 快照：`{features:240, vertices:47232, unnamed:42, bytes:1009113, entities:190}`）。

### 5.2 生产文件完整性（相对回滚阶段基线，只读对比）

以 `%TEMP%\l1-rollback-baseline.txt`（阶段前，114 行）对比当前 115 行受保护文件集合：

- **变更 2 个**：`public/data/years/world_1994.json`（1,009,091 → 1,009,113 B）、`public/data/manifest.json`（15,504 B 不变、内容含 `generatedAt`）
- **新增 1 个**：`data/identity/unnamed-attribution.json`（1,306 B）
- **删除 0 个**
- **`data/raw/**` 变更 0 / 55**（上游原始快照未被写入）
- `data/identity/colors.json`（109,721 B · `50b596ba…`）与 `data/identity/continuity.json`（7,377 B · `dbd6e667…`）**与阶段前逐字节相同**

关系层 sidecar 不在上述「受保护文件」集合内，但同样只受 1994 数据变化影响：54 个 sidecar 由 `npm run data:relations` 重写，覆盖度摘要 digest `EFF6BEE6…` → **`497C9048FE180CBE04279A90BB496093E33478C66C87A5D0ABA4F0A84D75D06D`**，目录合计 +6 B。

---

## 6. 磁盘占用

| 目录 | 文件数 | 字节 |
|---|---|---|
| `public/data` | 110 | 46,507,867 B（阶段前 46,507,839 B，**+28 B**：`years/world_1994.json` +22 B、`relations/1994.json` +6 B；`manifest.json` 字节数不变） |
| `public/data/years` | 54 | 43,667,080 B（阶段前 43,667,058 B） |
| `public/data/relations` | 54 | 2,362,948 B（阶段前 2,362,942 B；输入只变 1994 年份文件，故只有 `relations/1994.json` 内容变化） |
| `data/identity` | 4 | colors 109,721 + continuity 7,377 + unnamed-attribution 1,306 + 其它 |
| `dist/data` | 110 | 46,775,650 B —— **陈旧，未同步**（沿用上一阶段的待授权状态） |

新增依赖：**0**（只用 Node 内置模块与既有 npm 依赖）。

---

## 7. 后续项（均未实施，等授权）

1. **1500 与 bc2000 的同型重复已在代码层实测「加一条配置即可启用」**：用一个只读脚本复刻全部 6 条构建期守卫，两年全部 PASS ——
   - `world_1500.geojson idx=251`：目标 NAME/SUBJECTO 均 null、254 顶点、同文件同名原生要素恰好 1 个（`[2] Taiwan`）、产物该 key 具名实体 1 个（`auto:taiwan`）
   - `world_bc2000.geojson idx=132`：目标 NAME/SUBJECTO 均 null、254 顶点、同文件同名原生要素恰好 1 个（`[0] Dakapeng culture`）、产物该 key 具名实体 1 个（`auto:dakapeng culture`）
   - 启用方式：向 `data/identity/unnamed-attribution.json` 的 `entries` 增加对应两条，重跑 `data:build` / `data:verify` / `data:relations` 与 19 项测试，并同步测试常量（预计再无 key −2、unnamed −2、resolved +2）。
2. **其余年份仍有「灰色重复几何」**（200/400/700/800/1715/bc300/bc323/bc700/bc1500 等 9 年灰色 29 + 灰色 254 并存；约 21 年只有灰色 254 顶点要素）。这些年份**没有**同快照的具名同政权要素，属「无名陆地」而非「重复绘制」，本轮未处理，也不应套用本机制（会凭空空造身份）。
3. **1650 / 1700 的 Dutch Formosa 等局部重叠是正当的**（不同政权占同一岛不同区域），明确不得归并。
4. `dist/data` 陈旧（110 文件 / 46,775,650 B），需要时另行授权同步。

---

## 8. 复现路径

```
npm run data:build      # 期望：17473 features / 1930012 顶点 / ⚑ D4 归并重复几何 1
npm run data:verify     # 期望：AR12 1 个 (key, year) · 配置 1 个条目
npm run data:relations  # 期望：digest 497c9048fe180cbe04279a90bb496093e33478c66c87a5d0aba4f0a84d75d06d
node tests\relations\run.mjs --validation <tmp>\tw-validation.json --baseline <tmp>\tw-baseline.txt   # 期望 19/19
```

T11 的 `--baseline` 文件需先用复刻 `protectedPaths()`（`data/identity/*` + `public/data/years/*` + `entities.json` + `manifest.json` + `data/raw/**` 递归 = 现 115 行）的临时脚本生成；该文件是**只读输入**。

回滚方式：删除 `data/identity/unnamed-attribution.json` 中的 entry（或删除该文件）后重跑 `npm run data:build` —— 构建会把 1994 恢复为「具名 + 无属性」两份几何；AR12 在无条目时不做任何断言。

---

## 9. 未做的事 / 已知限制

- 未修改上游 `data/raw/**`（保持原始快照可追溯）。
- 未引入任何几何启发式或跨年推断（已证明不可靠）。
- 未处理 1500 / bc2000（等授权，见后续项 1）。
- 未处理 1650/1700 等正当局部重叠，也未处理其它无名陆地年份。
- 未修改 `package.json`、未同步 `dist/data`、未新增依赖。
