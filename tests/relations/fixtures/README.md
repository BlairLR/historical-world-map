# P4.1-B 关系层测试夹具（fixtures）

这些夹具是 **测试输入**，只被 `tests/relations/run.mjs` 使用。

- 它们**不是**历史数据，**不是**生产配置，**不得**复制到 `data/relations/**`。
- 生产配置 `data/relations/relations.json` 在整个 P4.1-B 阶段保持 `{"version":1,"rules":[]}`（零历史规则）；
  `data/relations/authorities.json` 保持 `{"version":1,"authorities":[]}`。
- 夹具里的 `sovereignId` 取既有 polity entityId（`UK-UNITED-KINGDOM`）**仅为了让 schema 通过校验**，
  不代表任何历史判断；`auth:TEST-ADMIN` 是测试专用 authority，`controllerEntityId: null`。
- 所有夹具构建的输出目录都在系统 TEMP，绝不写入 `public/data/relations/**`（T2/T3/T4/T11 会对此做哈希断言）。

| 夹具 | 用途 | 规则形态 | 断言点 |
|---|---|---|---|
| `sov-only/` | T2 Sovereign isolation | `{key, years}` 只设置 `sovereignId` | 记录里 `authorityId` 必须全为 `null`；entityId 列不变 |
| `auth-only/` | T3 Authority isolation | `{key, years}` 只设置 `authorityId` | 记录里 `sovereignId` 必须全为 `null`；entityId 列不变；authorityId 必须已在 `authorities.json` 注册 |
| `rel-only/` | T4 Relationship isolation | `{key, years}` 只设置 `relationship` | 记录里 `sovereignId` / `authorityId` 必须全为 `null`；entityId 集合不增不减 |
| `conflict/` | T13 / R9 规则冲突 | 两条同优先级（`{key}`）且输出不同的规则 | 构建必须以明确错误信息失败（含两条规则 id） |
| `forbidden-output/` | R6 关系层不得输出身份 | 规则 `output` 里含 `entityId` | 配置校验必须失败 |

选择器注意：`match.key` / `match.name` 使用**归一化后**的值（v3 §5.3 第 384 行），
因此 `uk` 是 `UK` 的归一化键，`united kingdom` 是 `United Kingdom` 的归一化键。
