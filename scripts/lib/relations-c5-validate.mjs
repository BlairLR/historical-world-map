// C5-D1 / C5-D2 最小约束检查（**warning 模式**，不阻断构建）
//
// 依据：docs/design/P4.1-C-OQ-decisions.md 中 C5 的正式语义
//   · sovereignId = 法理 / 法律上的主权归属
//   · authorityId = 实际行使控制、行政或军事管理权力的主体
// 以及该文件中仍标记 **OPEN** 的两项衍生问题：
//   · C5-D1：哪些 relationship 允许 `null + resolved`
//   · C5-D2：是否把 relationship → sovereignId / authorityId 的约束机器化
//
// 本模块只实现「最小、可判定、零误伤」的那部分检查，并且**只提示、不阻断**：
//   occupied            ⇒ sovereignId 非空（P4.1-A v3 §7；与 Batch 1 六条的实际形状存在张力，即 OQ-C5）
//                         且 authorityId 非空（占领当局应有主体）
//   sovereign-territory ⇒ sovereignId === 该 feature 的 entityId（主权归属即该政权本身）
//   colony / protectorate / dependency / mandate / trusteeship / autonomous / administered
//                       ⇒ sovereignId 非空（存在法理主权者）
//   administered        ⇒ authorityId 非空（行使管理者）
//   condominium / unknown ⇒ **显式豁免**：允许 `null + resolved`（C5-D1 待裁定，不做判定）
//   unresolved          ⇒ 跳过（已由 relations.mjs §4.4.1 推论 2 机器校验，属阻断式校验）
//
// 边界（不可越界）：纯函数。不读盘、不写盘、不修改任何记录、不新增字段、不改枚举，
// 也不影响 sidecar 内容与 digest；返回值仅为人类可读的提示字符串。
// 与 scripts/lib/relations.mjs 的关系：那边是**冻结的阻断式** schema/状态校验，
// 这边是**可关闭的**语义提示，二者互不替代。

/** 这些 relationship 必须有非空 sovereignId（`occupied` 见下方单独说明） */
export const C5_SOVEREIGN_REQUIRED = Object.freeze([
  'colony',
  'protectorate',
  'dependency',
  'mandate',
  'trusteeship',
  'autonomous',
  'administered',
  'occupied',
]);

/** 这些 relationship 显式允许 `null + resolved`（C5-D1 未裁定前不做判定） */
export const C5_NULL_SOVEREIGN_ALLOWED = Object.freeze(['condominium', 'unknown']);

/** 这些 relationship 必须有非空 authorityId（实际行使控制/管理的主体） */
export const C5_AUTHORITY_REQUIRED = Object.freeze(['occupied', 'administered']);

/** relationship 自指检查：主权归属必须就是该 feature 自身所属政权 */
export const C5_SELF_SOVEREIGN = Object.freeze(['sovereign-territory']);

function describe(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/**
 * 检查一条 sidecar 记录是否满足 C5 最小约束。
 * @param {object} record 五字段记录（entityId / sovereignId / authorityId / relationship / resolutionStatus）
 * @param {{year?: number|string, featureId?: string|number}} context 仅用于提示文案定位，不参与判定
 * @returns {string[]} 提示数组（空数组 = 满足）
 */
export function checkC5Constraints(record, context = {}) {
  const warnings = [];
  if (record === null || typeof record !== 'object') return warnings;
  // unresolved 的保守形状已由 §4.4.1 推论 2 阻断式校验覆盖，不属于 C5 语义检查范围
  if (record.resolutionStatus !== 'resolved') return warnings;

  const where = `${context.year ?? '?'} 年 feature id=${context.featureId ?? '?'}`;
  const relationship = record.relationship;
  const sovereignId = record.sovereignId ?? null;
  const authorityId = record.authorityId ?? null;
  const entityId = record.entityId ?? null;

  if (C5_SELF_SOVEREIGN.includes(relationship)) {
    if (sovereignId !== entityId) {
      warnings.push(
        `${where}：${relationship} 的 sovereignId 应等于该 feature 的 entityId（sovereignId=${describe(sovereignId)}，entityId=${describe(entityId)}）`,
      );
    }
  } else if (C5_SOVEREIGN_REQUIRED.includes(relationship) && sovereignId === null) {
    const note = relationship === 'occupied' ? '；P4.1-A v3 §7「occupied ⇒ sovereignId 非空」（OQ-C5 张力）' : '';
    warnings.push(`${where}：${relationship} 应有非空 sovereignId（当前为 null）${note}`);
  }

  if (C5_AUTHORITY_REQUIRED.includes(relationship) && authorityId === null) {
    warnings.push(`${where}：${relationship} 应有非空 authorityId（当前为 null）`);
  }

  return warnings;
}
