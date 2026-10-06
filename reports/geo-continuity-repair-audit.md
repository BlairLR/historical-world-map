# Geo Continuity Repair 审计：历史快照中缺失的**政治 feature**

只读分析阶段（未修改任何生产文件与数据；收尾核验 113/113 受保护文件与阶段基线逐字节一致）。

- 审计对象：`public/data/years/*.json`（54 个快照，17,438/17,439 个 feature）+ `public/data/entities.json`（3,055 个政权实体）+ `data/raw/geojson/*.geojson`（上游原样镜像）
- 上游来源：`aourednik/historical-basemaps@master`（GPL-3.0）
- 时间：本报告基于 7 个一次性只读探针，全部已删除，复现方式见 §10

---

## §0 摘要

**一句话结论**：54 个快照里共有 **315 处政治 feature 缺口（238 个不同 key，累计 1,099 个缺口年）**，但其中 **只有 26 处 / 48 个缺口年是「几何真的不在图上」**；其余 **289 处 / 1,051 个缺口年的几何全部在场**——缺的是**政治身份归属**（殖民者/宗主国吸走）或**名称变体**（上游换名重画），或是该年疆域被并进上位的帝国/联合体/占领当局要素里。

### 缺失类型总表

| 类型 | 定义 | 条目 | 累计缺口年 | 目标年几何在场性 | 修复层级 |
|---|---|---|---|---|---|
| **D1 identity-attribution** | 目标年存在**同量级**多边形（顶点数 ≤ max(4×自身, 400)），但被归属到**另一个 entity** | **167** | **576** | 在场（多为同一多边形） | 认领规则／历史裁定 |
| **D2 name-variant** | 目标年 raw 里存在与缺口 key **同源名称**的覆盖要素（改名/拼写变体） | **77** | **195** | 在场（**50/77 与自身顶点数差 ≤5%**） | `aliases.json` 键变体 |
| **D3 embedded** | 目标年只有**远大于自身**的要素（帝国/联合体/占领当局），疆域未单独绘制 | **71** | **280** | 仅大要素在场 | 邻年几何注入 + 认领扩展 |
| **D4 absent** | 目标年 raw 与 built **都没有任何覆盖要素** = 整个 feature 缺失 | **26** | **48** | **完全不在场** | 邻年几何注入 + 认领扩展 |
| **D5 partial** | 采样覆盖率 50–90%（疆域被部分重画/合并） | **39** | **134** | 部分在场 | 逐条历史裁定 |

合计：315 条 = 167 + 77 + 71，其中 D4 由「两侧邻年自身几何」判定后单列（原先落在 embedded 桶里的 26 条已拆出）；D5 与其余类型交叉。

### 根因（两条机械原因 + 一条上游表征）

1. **`SUBJECTO || NAME` 的归属优先**（`scripts/build-data.mjs:184` 与 `:425`）。上游把殖民地/属地画成「**自己的多边形 + `SUBJECTO`=宗主国**」，管线取 `SUBJECTO` 优先，于是整块疆域被路由给宗主国实体。实证：**89 条**缺口的目标年覆盖要素 `NAME ≠ SUBJECTO`，其中 **70 条 NAME 与缺口 key 同源**；`Botswana|United Kingdom|v97`（该实体 1930/1960 的自身几何同为 **v97**）、`Kenya|United Kingdom|v76`、`Algeria (France)|France|v168`、`Northern Rhodesia|United Kingdom|v132`、`Sierra Leone|United Kingdom|v34`、`Mozambique (Portugal)|Portugal|v183`、`Eritrea (Italy)|Italy|v76`。**这些缺口的几何一个顶点都没少，缺的是身份归属。**
2. **上游换名重画（succession／拼写变体）**：同一疆域在不同快照换了 key，`Yamato`（900–1400，raw v227 = 自身 v227）、`Ainus`↔`Ainu`、`Tasmanian hunter-gatherers`↔`aboriginal tasmanians`（raw v40 = 自身 v40）、`Poland-Lithuania`↔`Poland`、`Đại Việt`↔`Annam`、`Hindu states`↔`Hindu kingdoms`、`Chola Empire`↔`Cholas`、`Māori`/`Maori`/`Maoris`、`Boethuk`↔`Beothuk`、`Persi`↔`Persia`、`Silia`↔`Silla`、`Samis`/`Sami`/`Sámi`/`Saami`。→ 属于**别名问题，不是几何问题**。
3. **上游用上位政权／占领当局表示该年疆域**（embedded 类）：`Ottoman Empire` 覆盖 Cyprus 1530–1945（16 个快照）与 Egypt/Algiers/Tunis/Tripolitania 1783/1800；`Kalmar Union` 覆盖 Denmark/Norway/Sweden 1400；`USSR` 覆盖 Estonia/Latvia/Lithuania 1945 与 Georgia/Azerbaijan/Armenia 1920；`Qing Empire` 覆盖 Tibet 1783、Assam 1800；`British Raj` 覆盖 Burma 1878–1938；`Achaemenid Empire` 覆盖 Egypt -500；`Russian Empire` 覆盖 Poland 1800；`Goryeo` 覆盖 Korea 1200；`Australia` 覆盖 Papua New Guinea 1938；`Yugoslavia` 覆盖 Serbia/Montenegro 1920；`Pakistan` 覆盖 Bangladesh 1960；`United Kingdom of Great Britain and Ireland`（v1653 / 48 多边形）覆盖 Barbados、Grenada、Saint Vincent 1878。

### 手工实体口径（项目自己的权威声称）

`data/identity/aliases.json` 的手工实体在其 `periods` 期间内共有 **73 个 entity-年缺席**（**26 个实体 / 21 个快照年**；按年：1945:16、1938:14、1914:9、1900:6、1783/1800/1815/1878/1880 各 3、1400 2、其余各 1）。其中 **72 个该年疆域被其它实体覆盖**，**只有 `VI-US@1960` 完全无覆盖**。涉及实体：`BW-BECHUANALAND`、`CN-MING`、`CN-ROC`、`CN-WARLORDS`、`DE-REICH`、`DK-NORWAY`、`DZ-FRENCH`、`ER-COLONY`、`JP-EMPIRE`、`JP-FUJIWARA`、`JP-KAMAKURA`、`JP-SENGOKU`、`KE-COLONY`、`LS-BASUTOLAND`、`MZ-PORTUGUESE`、`NG-COLONY`、`RO-EMPIRE`、`SL-COLONY`、`SZ-KINGDOM`、`SZ-PROTECTORATE`、`TZ-TANGANYIKA`、`UG-PROTECTORATE`、`VI-DANISH`、`VI-US`、`ZM-NRHODESIA`、`ZW-SRHODESIA`。

---

## §1 方法与判据

| 探针（工作区临时文件，均已删除） | 用途 | 产物 |
|---|---|---|
| `.tmp-pol-recon.mjs` | manifest/entities/aliases/raw 结构侦察 | 无 |
| `.tmp-pol-gaps.mjs` | key 级在场空档（相邻出现年之间的缺口） | `%TEMP%\pol-gaps.json` |
| `.tmp-pol-classify.mjs` | 缺口分类 + 参考几何采样覆盖 | `%TEMP%\pol-gap-classify.json` |
| `.tmp-pol-deep.mjs` | T3 细分 + **手工实体「periods 期间内缺席」审计** | `%TEMP%\pol-gap-deep.json` |
| `.tmp-pol-src.mjs` | 目标年 raw/built「覆盖要素」取证（NAME/SUBJECTO/顶点数） | `%TEMP%\pol-gap-src.json` |
| `.tmp-pol-summary.mjs` / `.tmp-pol-numbers.mjs` | 汇总成报告用表 | 无 |

判据：

1. **缺口**：同一 normalized key 的在场年份序列中，相邻两个出现年之间缺失的快照（宽度 = 年份索引差 − 1）。key 级空档共 315 处，其中单快照噪声 137、宽域 mergeRuns 2（`pagan`、`pandya state` 各缺 1000/1100/1200）、断层切分 176。
2. **参考几何**：缺口两侧该实体自身几何中顶点最多者（来自 built 快照）。
3. **采样点**：参考几何 bbox 12×12 网格中落在多边形内部的点（≤12 个，奇偶填充含内环洞）。
4. **覆盖**：目标年要素包含采样点的比例 ≥ 0.5；`absent` = 目标年 raw 与 built 均无覆盖要素。
5. **分类**：`alias`（存在 NAME/SUBJECTO token 与缺口 key 同源的覆盖要素）→ `attribution`（存在顶点数 ≤ max(4×自身, 400) 的覆盖要素）→ `embedded`（仅更大的要素）。

**方法教训**（避免重踩）：
- 必须**分别**取证 `NAME` 与 `SUBJECTO`：管线取 `SUBJECTO || NAME`，只看 NAME 会把「属地被宗主国吸走」误判为「几何缺失」。
- 覆盖要素的顶点数必须与**该实体自身几何顶点数**对比，否则无法区分「同一多边形换了归属」与「并入大帝国」。
- 参考几何必须用缺口两侧该实体自己的几何；用 bbox 邻域会在全球 bbox 巨型 blob 上产生假覆盖（前一轮审计已踩过）。

---

## §2 D4：目标年**完全未绘制**（26 条 / 48 个缺口年）

几何与身份**都缺**；可用**邻年该实体自身几何**补齐（用户原则「优先采用邻近年份 geometry」的适用对象就是这一类）。

| # | key | 缺失年 | 建议几何来源年（相邻，两侧都可用） | 自身几何 | 缺口宽度 |
|---|---|---|---|---|---|
| 1 | `siam` | 1815,1878,1880,1900,1914,1920,1930 | 1800@`auto:siam` / 1938@`auto:siam#1` | v18 | 7 |
| 2 | `eastern north american hunter-gatherers` | -100,-1,100,200,300,400 | -200@自身 / 500@`#1` | v1669 | 6 |
| 3 | `malta` | 1920,1930,1938,1945,1960 | 1914@`auto:malta` / 1994@`auto:malta#1` | v44 | 5 |
| 4 | `guanches` | 500,600,700 | 400@自身 / 800@`#1` | v21 | 3 |
| 5 | `tuʻi tonga empire` | 700,800,900 | 600@自身 / 1000@`#1` | v1379 | 3 |
| 6–8 | `guadeloupe` / `haiti` / `martinique` | 1783,1800（各 2） | 1715@自身 / 1815@`#1` | v135 / v42 / v32 | 2 |
| 9–13 | `amazon hunter-gatherers` / `desert hunter-gatherers` / `savanna hunter-gatherers` / `subarctic forest hunter-gatherers` / `kalmar union` | 1492（各 1） | 1400@自身 / 1500@自身 | v19 / v18 / v48 / v106 / v2652 | 1 |
| 14 | `cree` | 1500 | 1492@自身 / 1530@自身 | v130 | 1 |
| 15–26 | `anguilla`、`antigua and barbuda`、`barbados`、`dominica`、`grenada`、`montserrat`、`netherlands antilles`、`saint barthelemy`、`saint kitts and nevis`、`saint lucia`、`saint martin`、`saint vincent and the grenadines` | **1960（12 条全部缺 1960）** | 1945@自身 / 1994@自身 | v21/48/49/36/55/19/89/14/55/35/15/63 | 1 |

> 1960 快照同时缺失 12 个加勒比微型属地（上游 1960 层未绘制它们），这是**单一快照的整批缺口**，几何可直接取自 1945（同一实体、同形多边形）。
> 连带的身份口径：`malta`、`guanches`、`tuʻi tonga empire`、`guadeloupe`、`haiti`、`martinique` 的两侧是不同的 run 实体（`auto:X` → `auto:X#1`），补齐中间年份会让两个 run 合并 → 详见 §5 的颜色注册表影响。

---

## §3 D1：身份归属被吸走（167 条 / 576 个缺口年）

按「目标年实际覆盖该疆域的 entity」聚合（括号内为条目数）：

| 覆盖 entity | 条目 | 代表（缺口 key@年 → 目标年 raw NAME|SUBJECTO / 顶点数 vs 自身） |
|---|---|---|
| `UNNAMED` | 24 | `denmark-norway@1100`（null\|null v503 / 自身 v1417）、`arabs@-100`（null\|null v157 / v157）、`arakn@700`（null\|null v155 / v16） |
| `UK-UNITED-KINGDOM` | 15 | `zambia@1938`（Northern Rhodesia\|UK v132 / v132）、`zimbabwe@1938`（Southern Rhodesia\|UK v85 / v85）、`antigua and barbuda@1783`（United Kingdom\|UK v319 / v48） |
| `auto:france` | 5 | `annam@1900`（French Indochina\|France v194 / v134）、`cambodia@1878`、`cochin china@1878` |
| `auto:natchez` | 4 | `biloxi/caddo/houma@1500`（Natchez v78） |
| `auto:hindu kingdoms` | 4 | `cheras/cholas/pandyas@600`（Hindu kingdoms v54） |
| `auto:pomo` | 4 | `chumash/cochimí/patwin@1500`（Pomo v194） |
| `auto:plain bison hunters` | 3 | `arapaho/ponca/yankton@1500` |
| `DE-REICH` | 3 | `austria@1938`（Germany v363 / 自身 v121）、`burundi/rwanda@1914`（German E. Africa (Tanganyika) v93） |
| `auto:cherokee` | 3 | `catawba/santee/tutelo@1500` |
| `RU-RSFSR` | 2 | `russia@1920`（USSR v7140 / 自身 v2164）、`armenia@1920`（Azerbaijan\|USSR） |
| `auto:mongol empire` | 2 | `armenia@1279`（Ilkhanate）、`grand duchy of moscow@1400`（Blue Horde） |
| `auto:pagan`、`auto:chola empire`、`auto:portugal`、`auto:coqs`、`auto:plateau fichers and hunter gatherers`、`auto:yugoslavia`、`auto:rajput kingdoms`、`auto:sultanate of delhi`、`auto:aónikenk (tehuelche)`、`auto:aragón`、`auto:comanche` | 各 2 | `kalapuya/modoc@1500`（Coqs）、`montenegro/serbia@1920`（Yugoslavia）、`sardinia/sicily@1492`（Aragón）、`tonkawa/wichita@1500`（Comanche） |
| 其余 75 个 entity | 各 1 | `japan@900`（Yamato v227 / v227）、`aboriginal tasmanians@-2000`（Tasmanian hunter-gatherers v40 / v40）、`beothuk@1000`（Boethuk v113 / v113）、`sámi@200`（Sámi v237 / v237）、`british east india company@1800`（Bundelkhand）… |

D1 的判读要点：**几何在场且量级相当**（多数是同一多边形），因此这类缺口的「修复」不是补几何，而是决定「这块多边形应该归谁」——这既是 identity 流程问题，也是**历史裁定**问题（例如 1938 年的 Botswana 到底应显示为独立保护国还是英帝国的一部分）。

---

## §4 D2：名称/拼写变体（77 条 / 195 个缺口年）

**50/77** 的缺口：目标年覆盖要素的顶点数与自身几何相差 ≤5%（同一块疆域换了名字）。按「自身实体 → 覆盖实体」聚合的代表（共 69 个不同 key）：

- 殖民/占领前缀型：`algeria@1914/1938`（Algeria\|France → `auto:france`）、`angola@1878/1914/1938`（Angola (Portugal)）、`mozambique@1938`、`eritrea@1938`、`egypt@1914`（Anglo-Egyptian Sudan）、`egypt@1945`、`madagascar@1914`、`morocco@1938`、`tunisia@1945`、`senegal@1878`（Senegal (FR)）、`ceylon@1783`（Ceylon (Dutch)）、`dutch east indies@1878`（Netherlands Indies）、`jamaica@1945`（Jamaica (UK)）、`gambia, the@1945`、`sudan@1945`、`qatar@1920`、`belize@1715`、`hanover@1800`（Hanover\|UK）、`mecklenburg-strelitz@1800`（\|UK）、`laos@1945`、`guadeloupe@1945`、`martinique@1945`、`guinea-bissau@1945`、`ethiopia@1938`（Ethiopia (Italy)）、`philippines@1938`（\|United States）、`united states virgin islands@1945`（\|USA）
- 政权换名型：`japan@1530`（Japan (Warring States)）、`japan@1878`（Imperial Japan）、`ainu@1279`（Ainus）、`maori@1530`（Maoris）、`māori@1783/1815`、`tasmanian hunter-gatherers@-300`（Australian aboriginal hunter-gatherers）、`lithuania@1400`/`poland@1400`（Poland-Lithuania）、`england@1530`（England and Ireland）、`hungary@1492`（Imperial Hungary）、`spain@1650`（Spanish Habsburg）、`austria@1800`（Habsburg Austria）、`hindu kingdoms@800/1200`（Hindu states / Rajput kingdoms）、`champa@1200`（Champa City States）、`pagan@1000`（Kingdom of Pagan）、`mon state@900`（Mon States）、`arakan@1700`（Arakan (Indian princely state)）、`suren kingdom@100`（Kushan Empire）、`bosporan kingdom@-200`（\|Scythians）、`magyars@800`（\|Khazars）、`shuar@1492`（Shuar-Wampis）、`innu@1492`（Nitassinan (Innu)）、`maya city-states@1492`（Maya Yucateco）、`papua new guinea@1815`（Papuans\|Papu）、`sweden@1815`（Sweden–Norway）、`armenia@1100`（\|Byzantine Empire）、`egypt@1878`（\|Ottoman Empire）、`algiers@1800`/`tunis@1800`/`tripolitania@1800`/`cyrenaica@1800`（\|Ottoman Empire）、`azerbaijan@1920`/`georgia@1920`（\|USSR）、`tibet@1279/1400`（\|Mongol Empire）、`congo@1878`（\|France）、`guyana@1945`（\|Netherlands）、`equatorial guinea@1938`（\|Spain）、`saint vincent and the grenadines@1878`（\|UK of GB and Ireland）

---

## §5 D3：疆域未单独绘制，嵌在上位要素里（71 条 / 280 个缺口年）

按覆盖 entity 聚合（前若干）：`UNNAMED` 11、`UK-UNITED-KINGDOM` 6（`barbados/grenada/saint vincent@1878` 落在 v1653/48 多边形的「United Kingdom of Great Britain and Ireland」里、`burma@1878–1938` 落在 `British Raj` v585）、`auto:ottoman empire` 5（`cyprus@1530–1945`、`egypt@1783`、`montenegro@1783`）、`auto:kalmar union` 3（`denmark/norway/sweden@1400`）、`RU-USSR` 3（`estonia/latvia/lithuania@1945`）、`auto:abbasid caliphate` 2、`CN-QING` 2（`assam@1800`、`tibet@1783`）、`auto:france` 2（`ivory coast/senegal@1914` 落在 `French West Africa` v489）、以及 `auto:achaemenid empire`（`egypt@-500`）、`auto:goryeo`（`korea@1200`）、`JP-EMPIRE`（`manchuria@1938`）、`auto:australia`（`papua new guinea@1938`）、`RU-EMPIRE`（`poland@1800`）、`auto:spain#1`（`trinidad@1783` 落在 `Viceroyalty of New Granada`）、`auto:white russia`（`ukraine@1930`）等各 1。

D3 的修复需要的不是「找一块缺失的多边形」，而是**把该年该实体自己的疆域从大要素里表达出来**：优先使用缺口两侧该实体自身几何（用户原则），仅在两侧几何与目标年历史疆域明显不同时才需要按框裁切（本报告不建议自动裁切——那是历史裁定）。

---

## §6 D5：部分覆盖（39 条 / 134 个缺口年）

覆盖率 50–90% 的混合情况：`germany@1945`（0.67，被 `auto:austria#1` 覆盖——1945 年德国被画成占领区）、`denmark-norway@1100`（0.5，UNNAMED）、`arapaho@1500`（0.58）、`armenia@1100`（0.83，Byzantine）、`athabaskan@1492`（0.67）、`bagirmi@1700`（0.58）、`berbers@-500`（0.83）、`bhutan@1279`（0.75）、`caddo@1500`（0.67）、`cholas@800`（0.58）、`erie@1500`（0.75）、`funj@1530`（0.58）、`hindu kingdoms@500/1200`（0.5/0.75）、`houma@1500`（0.83）、`iowa@1500`（0.75）、`karankawa@1500`（0.58）、`kong empire@1815`（0.83）、`kush@-500`（0.83）、`kushan empire@-1`（0.67）、`libya@1945`（0.83，`Cyraneica (UK Lybia)`）、`luba@1815`（0.75）、`maize farmers@-323`（0.83）、`mali@1530`（0.58）、`maya city-states@1492`（0.67）、`mixtec empire@1492`（0.58/0.75）、`moldova@1492`（0.58）、`north american pacific foraging…@1492`（0.5）、`norway@1400`（0.83）、`patagonian shellfish and marine mammal hunters@1492`（0.75）、`plain bison hunters@1492`（0.58/0.75）、`plateau fichers and hunter gatherers@1492`（0.67）、`poland@1800`（0.67）、`rajput kingdoms@1100`（0.67）、`taiwan@1530`（0.67）、`thai@-1500`（0.5）、`tibet@1279`（0.75）、`tungus@-100`（0.67）、`west african cereal farmers@900`（0.67）。

---

## §7 与「保持目标年份原有 identity 流程」的兼容性（关键）

**事实**：`entityOfYear` 只认领「**raw 该年实际出现过该 key**」的年份——`scripts/build-data.mjs:178-222` 的第 1 遍**只遍历 raw 文件**；`scripts/lib/identity.mjs:155-242` 的 `planEntities` 只在 `keyYears` 里认领手工实体、在出现序列上做 run 切分。因此：

> **把几何注入到「raw 缺该 key 的年份」，现有流程一定把它解析成 `UNNAMED`**（管线没有任何空间推断）。要让补入的 feature 拿到正确 entityId，必须让该 (key, year) 在认领阶段可见。

三种修复位置：

| 方案 | 做法 | 是否保持 identity 流程 | 代价/风险 |
|---|---|---|---|
| **P1 改 raw** | 直接在 `data/raw/geojson/*.geojson` 加 feature | ✔ 完全走原流程 | raw 是 `npm run data:fetch` 的下载镜像，重取即丢失；且改上游数据不可审计 → **不推荐** |
| **P2 扩展认领** | `data/identity/aliases.json`（或新增 `data/identity/continuity.json`）声明「entityId 在某年集合内认领指定 key，几何取 sourceYear」 | ✔ 身份仍由 `planEntities` 决定 | 需改 `scripts/lib/identity.mjs` 的认领输入（新增一个可选输入，不改既有语义） |
| **P3 build 层注入** | `scripts/build-data.mjs` 在 raw 转换后、写盘前注入 feature，注入前把 (key, year) 认领注册进 `entityOfYear` | ✔ 复用同一套 claim→`convertFeature`→颜色分配 | 需新增「注入」步骤与断言，且必须保证 `id = features.length`（追加末尾） |

**推荐 P2 + P3 组合**：声明（P2）放在 `data/identity/` 里可审计、可复核；执行（P3）放在 build 管线的既有注入点（`scripts/build-data.mjs:527-547` 目前是南极洲式的 `polarFeatures === 0` 触发）附近，但**触发条件必须泛化为「逐条声明的对象级在场判据」**。

**必须保持的不变量**：属性 7 键（`NAME/ABBREVN/SUBJECTO/BORDERPRECISION/PARTOF`+BC 年的 `type/weblnks`）与原生 feature 一致；`id` 追加末尾；颜色仍由 `assignColors` 决定；`entities.json` 的 polity 注册表与 `manifest.entityCount` 只在**新增手工实体**时才变。

**颜色注册表影响**：D4 中 `malta`、`guanches`、`tuʻi tonga empire`、`guadeloupe`、`haiti`、`martinique` 两侧是 `auto:X` 与 `auto:X#1` 两个 run。补齐中间年份后两个 run 会**合并**，`auto:X#1` 不再产生 → `data/identity/colors.json`（冻结注册表 3,097 条）会出现**未被使用的条目**，需要一次性重生成并逐条报告差异（这是唯一需要人工复核的产物）。

---

## §8 影响面（三个修复级别）

| 级别 | 范围 | 缺口条目/年 | 需重生成的快照年 | 预估 feature 增量 |
|---|---|---|---|---|
| **L1 最小** | D4 全部 26 条（含 1960 的 12 个加勒比属地） | 26 / 48 | **24 个年份文件**：-100,-1,100,200,300,400,500,600,700,800,900,1492,1783,1800,1815,1878,1880,1900,1914,1920,1930,1938,1945,1960 | +48 feature（≈48×11 顶点量级，可忽略体积） |
| **L2 中等** | L1 + D3（embedded） | 97 / 328 | ≥ 40 个年份文件（含 1530–1945 的 Ottoman/Cyprus 系列、1400、-500、1783、1800、1878–1938、1920/1945 的苏联加盟共和国等） | +≈280 feature |
| **L3 全量** | + D1/D2/D5 | 315 / 1,099 | 几乎所有快照年（1938/1945/1914/1500/1492 变动最大） | +≈700–1,000 feature，且**必须逐条历史裁定** |

任一非空级别都会连带更新：对应 `public/data/relations/<year>.json`（sidecar 必须覆盖全部 feature）、`public/data/manifest.json`（`snapshots[].features/vertices/unnamed/bytes/bbox`）、`dist/data` 同步、`tests/relations/run.mjs` 的计数常量（当前 R1 断言 17,439、T9 无 key 7,047、有 key 无 NAME 12）。**`data/identity/colors.json`、`data/relations/relations.json`、`src/**`、`package.json` 在 L1 下不需要改动。**

---

## §9 风险

- **R1 历史裁定风险**：D1/D2 的「修复」等于替用户判断「1938 年的 Botswana 应独立着色还是留在英帝国里」——机械规则不能替代历史判断，本报告只做分类与取证。
- **R2 identity 流程被绕过风险**：若用「注入时直接写 entityId」的捷径，会绕开 `planEntities`，导致 `entities.json.years` 与实际要素不一致（目前二者 100% 一致，必须保持）。
- **R3 颜色漂移**：run 合并（§7）会改变 `auto:X#1` 的存续，需重生成 `colors.json` 并报告差异。
- **R4 sidecar 覆盖度**：sidecar 必须覆盖该年全部 feature（含注入的），`relations-build.mjs` 的 R1/R2 断言会失败若遗漏。
- **R5 测试常量**：`tests/relations/run.mjs` 的 17,439 / 7,047 / 12 三个常量必须同步（L203、L335、L351、L582）。
- **R6 体积**：L1 可忽略；L2 约 +2–4 MB；L3 可能 +10 MB 以上。
- **R7 上游重取**：`npm run data:fetch` 会覆盖 `data/raw`（所以修复声明必须放在 `data/raw` 之外 + build 注入，P1 被否）。
- **R8 复现性**：注入必须确定性（同一输入两次构建产物逐字节相同），并在 `data:verify` 增加对应 AR 断言。
- **R9 与 geo continuity 的关系**：本任务是**政治 feature**（identity 必须有主），北极洲式「中性灰 UNNAMED 几何」不适用于 L1；若某年确实无法裁定归属，正确做法是**留在 relation layer 为 `unresolved`**，而不是塞进 `UNNAMED`。
- **R10 误判风险**：本审计的覆盖判据基于采样点（≤12），对「细长/破碎」疆域可能低估在场性；D5 的 39 条即判据边界情况，实施前应逐条人工确认。

---

## §10 开放问题（需用户裁定）

- **Q1** 是否接受「D4 优先、D1/D2 交给 relation layer」的范围划定？（即 L1 先落地）
- **Q2** L1 中 `malta/guanches/tuʻi tonga/guadeloupe/haiti/martinique` 的 run 合并是否接受（会让 `auto:X#1` 颜色条目退役）？
- **Q3** 1960 的 12 个加勒比属地缺口是否为上游有意省略？补齐是否需要注明来源年（1945）？
- **Q4** D2 的 69 个 key 变体是否要写入 `aliases.json`（会改变现有切分/颜色）还是保持现状？
- **Q5** D1 的「同量级多边形换归属」（如 Botswana 1938 → 独立 or UK）由谁裁定？是否需要一份「殖民地在场性」清单？
- **Q6** D3 是否允许「按框裁切大要素」？若不允许，则只能用邻年自身几何（可能与目标年疆域不完全一致）。
- **Q7** 注入方式选 P2 / P3 / P2+P3？
- **Q8** 是否新增手工实体条目（如 `VI-US@1960`、`siam@1815-1930` 已有实体，无需新增）？
- **Q9** D5 的 39 条是否逐条人工复核后再定？
- **Q10** 实施后是否需要一份「修复前后逐年 feature 差异报告」作为验收物？

---

## §11 复现

```powershell
# 全部探针均为一次性只读脚本，已删除；等价复现命令：
node .tmp-pol-gaps.mjs        # key 级空档 → %TEMP%\pol-gaps.json
node .tmp-pol-classify.mjs    # 分类 + 采样覆盖 → %TEMP%\pol-gap-classify.json
node .tmp-pol-deep.mjs        # T3 细分 + 手工实体期间内缺席 → %TEMP%\pol-gap-deep.json
node .tmp-pol-src.mjs         # 目标年 raw 覆盖要素取证 → %TEMP%\pol-gap-src.json
node .tmp-pol-summary.mjs ; node .tmp-pol-numbers.mjs   # 报告用汇总
```

只读核验：以 `%TEMP%\p446-baseline.txt`（113 行：路径/字节/mtime/SHA-256）逐文件比对 → **baselineRows=113 / ok=113 / changed=0 / missing=0**。

---

## §12 五项汇报

1. **改了哪些文件**：0 个生产文件；本报告 `reports/geo-continuity-repair-audit.md` 为唯一新增文件。
2. **装了哪些依赖**：0。
3. **占多少磁盘**：报告本体（见交付说明）；`public/data` 仍为 110 文件 / 46,369,990 B。
4. **有无错误**：无阻塞错误；过程中修正 3 处判据缺陷（NAME 与 SUBJECTO 必须分别取证、覆盖要素顶点数必须与自身几何对比、参考几何必须用实体自身几何而非 bbox 邻域）。
5. **下一步**：等待 §10 的 Q1–Q10 裁定；建议先做 **L1（D4 的 26 条 / 48 个缺口年）**，因为它是唯一「几何真的不在图上」的一类，且可用邻年自身几何直接补齐，无需历史裁定。
