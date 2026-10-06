# P4.1-A 关系层设计夹具（temporal relation layer — design fixtures）

**状态：DESIGN ONLY（v3 最终冻结设计）。** 本目录不是构建输入，不属于生产数据，也不会被 `npm run data:build` / `npm run data:verify` 读取。
本项目当前没有任何测试运行器（见 `reports/p4.1-readonly-survey.md` §6），因此这里给出的是**声明式**夹具：它把「将来要断言什么」写清楚，而不是现在就能跑的测试。
本次修订（v3，用户 m02288）已冻结 OQ-1 / OQ-2 的命名空间，并把 OQ-4（`federation`）与 OQ-10（存储形态）明确保持在「未实施 / 待单独批准」状态。

本目录与设计报告 `docs/design/P4.1-A-design.md` 一一对应；报告 §4 字段 schema、§5 resolver 架构、§6 空值语义、§7 枚举、§13 OPEN QUESTIONS。

---

## 1. 文件清单

| 文件 | 作用 | 与谁对应 |
| --- | --- | --- |
| `relation-layer.schema.json` | JSON Schema 2020-12：`relationship` 11 值枚举、`resolutionStatus`、`authorityId` 命名空间正则、规则（`relationRule`）、关系记录（`featureRelationRecord`）、年份 sidecar（`yearRelationsFile`）、规则集与 authority 注册表 | 报告 §4 / §6 / §7 |
| `cases.json` | T1–T14 测试意图与断言（声明式），含 `conventions.checkTypes` 与 `@identity:` 占位符约定 | 报告 §11 |
| `example-relations.draft.json` | **示意**规则集，演示 §9 的六个历史案例与 unresolved 形状 | 报告 §9 |
| `README.md` | 本文件：用法、约定、用例矩阵、OQ 索引 | — |

> `example-relations.draft.json` **不得**被当作 `data/relations/relations.json` 使用。P4.1-B 必须从空规则集开始，否则等于在实施阶段顺手做了未经审核的历史裁决。

---

## 2. 核心约定

1. **颜色只由 `entityId` 决定**：`color = f(entityId)`。关系层三个字段（`sovereignId` / `authorityId` / `relationship`）永远不参与颜色计算，也不得反向推导 `entityId`（报告 §3 A1–A4）。
2. **`null` 是合法且有语义的值**，表示「无单一主体」或「不适用」；**禁止**用伪造 id 表示未知（不得出现 `"unknown"`、`"n/a"` 之类的 id）。
3. **`relationship` 恒非空**，只能取 11 个枚举值之一，且**单值**。表达力不足时写 `"unknown"` 并把问题记为 `openQuestion`，不得自造复合值、不得选近似值。
4. **命名空间隔离（均已冻结）**：`sovereignId = 既有 polity entityId | null`（属于 polity 命名空间，必须存在于 `public/data/entities.json`；不使用独立 `sov:` 命名空间；见 OQ-1 ✅）；`authorityId = auth:<SLUG> | null`，例如 `auth:SCAP`、`auth:UK-BMA`（见 OQ-2 ✅）。占领当局 / 军管当局不是 polity，其注册表 `data/relations/authorities.json` 中的 `controllerEntityId` 仅为说明性元数据，**不得参与 identity resolver 或颜色分配**。
5. **`@identity:<DESC>` 占位符**（仅用于 `cases.json`）：表示「这个 entityId 由 identity resolver 决定」。夹具只断言它与其它取值的关系（相等 / 不等 / 不变），不断言字面值 —— 这样关系层的测试就不会偷偷固化身份层的历史裁决。
6. **`resolutionStatus`**：`resolved` = 命中规则（包括显式写 `relationship: "unknown"` 的规则）；`unresolved` = 未命中或证据冲突，且此时关系层必须是 `sovereignId: null` + `authorityId: null` + `relationship: "unknown"` 的形状（见 schema 的 `allOf` 一致性规则）。
7. **目录隔离**：`data/identity/` 只承载 `entityId` / `color`（`aliases.json`、`colors.json`）；关系层配置放**独立目录** `data/relations/`（`relations.json`、`authorities.json`），产物放 `public/data/relations/`。两者不得互相引用：identity 工具不读 `data/relations/`，relation 工具不写 `data/identity/`。本夹具**不创建**这些目录，路径仅用于说明（报告 §4.2）。
8. **`sovereignId: null` 的双重语义**（不新增字段）：`null` + `relationship: "unknown"` + `resolutionStatus: "unresolved"` = **情形 A**（证据不足）；`null` + 明确 relationship（≠ `unknown`）+ `resolutionStatus: "resolved"` = **情形 B**（已确认不存在单一法理主权主体，规则的 `source` 必须写明理由）。禁止用新字段 / 第三态 / 新枚举表达这个差别（报告 §4.4.1、§6.2）。

---

## 3. 断言类型（`cases.json` → `conventions.checkTypes`）

| check | 含义 |
| --- | --- |
| `invariant` | 对现有 54 个快照产物即可判定的不变式 |
| `distinct-count-equals` | 某集合不同取值个数等于给定值 |
| `build-byte-identical` | 两次构建的指定文件字节级相同（`manifest.json` 先归一化 `generatedAt`） |
| `must-fail` | 给定输入必须导致构建失败并报出指定信息 |
| `must-be-unresolved` | 该证据单元的关系层必须是 unresolved 形状 |
| `equals` / `not-equals` | 字段相等 / 不等 |
| `matches-pattern` | 字段匹配给定正则 |
| `set-unchanged` | 集合在操作前后完全相同 |
| `signature-excludes` | 静态检查：函数签名/实现不出现指定标识符 |
| `coverage-total` | 分类覆盖全部证据单元，不允许静默跳过 |

---

## 4. 用例矩阵（摘要）

| # | 名称 | 依赖 | 备注 |
| --- | --- | --- | --- |
| T1 | Entity color isolation | 现状即可验证 | 颜色与关系字段完全无关 |
| T2 | Sovereign isolation | 关系层实施后 | 改 `sovereignId` 不得改 identity/颜色 |
| T3 | Authority isolation | 关系层实施后 | 占领不改变被占领国身份 |
| T4 | Relationship isolation | 关系层实施后 | Sierra Leone 不因 colony/protectorate 拆 polity |
| T5 | Cross-key（UK/USA/USSR/DK-NO/SE-NO/Japan/Italy） | 关系层实施后 | raw key 只是证据 |
| T6 | Occupation（Japan、Germany 四区、Korea） | 关系层实施后 | `sovereignId ≠ authorityId` |
| T7 | Colonial（Sierra Leone，含位于宗主国 key 下的 feature） | 关系层实施后 | 选择器需支持 name-only |
| T8 | Eritrea 三阶段 | 关系层实施后 | 1941–1952 / 1952–1962（必须 unresolved）/ 1994+ |
| T9 | Conservatism（UNNAMED 7,046 + 无 NAME 12） | 关系层实施后 | 禁止猜测；解析器无几何输入 |
| T10 | Determinism（AR5 首次落地） | 关系层实施后 | 两次构建字节一致 |
| T11 | Production file protection | 任何一次运行 | 生产产物哈希门禁 |
| T12 | Coverage & audit | 关系层实施后 | `resolved + unresolved = 10,095` |
| T13 | Rule conflict → build failure | 关系层实施后 | 沿用既有冲突抛错惯例 |
| T14 | Namespace guard | 规则集校验期 | 规则 `output` 出现 `entityId` 即失败 |

---

## 5. OPEN QUESTIONS 索引（详见报告 §13）

| OQ | 主题 | 相关用例 |
| --- | --- | --- |
| OQ-1 | ✅ **已裁定（冻结）**：`sovereignId` = 既有 polity `entityId` \| `null`，不用独立 `sov:` 命名空间；不得反向参与 entityId/color resolver | T5、T14 |
| OQ-2 | ✅ **已裁定（冻结）**：`authorityId` = `auth:<SLUG>` \| `null`；注册表 `data/relations/authorities.json`（本阶段不创建）；`controllerEntityId` 仅为说明性元数据 | T3、T6、T14 |
| OQ-3 | `relationship` 是否允许 `null`（本设计取「不允许」） | T4、T7 |
| OQ-4 | ⚠️ **保持 OPEN QUESTION**：无 `federation` 取值（Eritrea 1952–1962）——枚举继续冻结，不在 P4.1-A / P4.1-B 加入，不得用 `autonomous` 偷换，不改 `ER-ETHIOPIA.periods`，留待 P4.1-C | T8 |
| OQ-5 | 无 `dominion` 取值（Newfoundland 等） | T5 |
| OQ-6 | 无 `personal-union` 取值（Hanover / 双元王国） | T5 |
| OQ-7 | 无 `chartered` 取值（British East India Company） | T5 |
| OQ-8 | 单值 vs 多主体 `sovereignId`/`authorityId`（Kuril 双边声索；共管） | T6、T9 |
| OQ-9 | `UNNAMED` 哨兵 vs `entityId: null` | T9 |
| OQ-10 | ⏳ **保持 OPEN QUESTION（待进入 P4.1-B 前单独批准，未实施）**：存储形态 sidecar 年份文件（推荐） vs 写进年份文件 `properties` | T2–T4、T11 |
| OQ-11 | 是否需要 feature 级选择器（当前证据显示不需要） | T5、T7 |
| OQ-12 | `resolutionStatus` 是否需要第三态，或改为逐字段 | T9、T12 |
| OQ-13 | 是否需要 `validFrom`/`validTo`（无快照区间无法验证） | T8 |
| OQ-14 | 本项目不是 git 仓库：哈希门禁 vs `git diff` 证明 | T11 |

---

## 6. 将来怎么用（建议，未实施）

1. 先实现报告 §12 的 B1–B6 骨架：空规则集 + `scripts/lib/relations.mjs` + 54 个 sidecar + 覆盖度报告 + T2–T4/T9–T14 断言；**不填历史值**。
2. 让 T11 成为构建门禁：任何一次 `data:relations` 运行前后，`data/identity/**`、`public/data/entities.json`、`public/data/manifest.json`、`public/data/years/**` 的字节数与 SHA-256 必须不变。
3. 再由人逐条裁决历史值，每加一条规则就在 `cases.json` 增加对应断言；`openQuestion` 字段只增不减，直到 OQ 被正式裁定。

---

## 7. 本目录的合规声明

* 本目录文件全部是**新增**文件，位于用户 m02063 指定的白名单 `tests/fixtures/P4.1-A/` 内。
* 本阶段未修改任何生产数据：`data/**`、`public/data/**`（含 54 个年份文件）、`aliases.json`、`colors.json`、`entities.json`、`src/**`、`scripts/**`、`package.json`、几何数据全部零改动（哈希见报告 §12 与交付汇报）。
* 本阶段未新增任何 relationship 枚举、未做任何历史裁决、未给 `UNNAMED` 猜 polity、未进入 P4.1-B。
