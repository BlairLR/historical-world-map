// 关系层解析器（sovereign / authority / relationship）—— P4.1-B 骨架实现。
//
// 上位规范：docs/design/P4.1-A-design.md（v3 最终冻结设计）
//   §4.1 feature 五字段记录 · §4.2 规则层记录 · §4.4/§4.4.1 null 语义
//   §5.2 共享与禁止矩阵 · §5.3 匹配优先级与选择器 · §6.5 resolutionStatus 派生
//   §7.1 relationship 枚举（11 项，冻结）· §13 OQ-1 / OQ-2（命名空间冻结）
//
// 本模块是「关系层不得反向影响身份层」这条硬规则的**机器可检查边界**：
//   · 函数签名里没有身份标识字段、没有颜色字段、没有任何几何输入；
//   · 输出的四个字段只有 sovereignId / authorityId / relationship / resolutionStatus；
//   · 只复用 identity 层的 normalizeKey()（纯格式归一化函数），不复用其任何解析结果。
//
// 本文件**不得出现**身份标识字段名、颜色字段名、几何字段名（含注释）——
// tests/relations/run.mjs 的 R4 / R5 会对本文件源码做静态断言。

import { normalizeKey } from './identity.mjs';

// ───────────────────────────── 冻结常量 ─────────────────────────────

/** §7.1：relationship 第一版枚举，11 项，本阶段不增删改（不含 federation / dominion / personal-union / chartered） */
export const RELATIONSHIP_ENUM = Object.freeze([
  'sovereign-territory',
  'colony',
  'protectorate',
  'occupied',
  'dependency',
  'mandate',
  'trusteeship',
  'autonomous',
  'condominium',
  'administered',
  'unknown',
]);

export const RELATIONSHIP_UNKNOWN = 'unknown';

/** §6.5：第一版只有 2 个值（禁止 partial / conflict / ambiguous / unknown 等新状态） */
export const STATUS_RESOLVED = 'resolved';
export const STATUS_UNRESOLVED = 'unresolved';
export const STATUS_ENUM = Object.freeze([STATUS_RESOLVED, STATUS_UNRESOLVED]);

/** §4.2：规则必须携带 confidence，取值闭集 */
export const CONFIDENCE_ENUM = Object.freeze(['high', 'medium', 'low']);

/** §4.5 / OQ-2 ✅：authority 使用独立命名空间 auth:<SLUG> */
export const AUTHORITY_ID_SOURCE = '^auth:[A-Z0-9][A-Z0-9-]*$';
export const AUTHORITY_ID_PATTERN = new RegExp(AUTHORITY_ID_SOURCE);

/** §5.3 优先级表：数组下标 + 1 = 优先级编号（数字越小越优先）。未列出的形态一律非法。 */
export const SELECTOR_FORMS = Object.freeze([
  Object.freeze(['key', 'name', 'years']),
  Object.freeze(['key', 'name']),
  Object.freeze(['key', 'years']),
  Object.freeze(['key']),
  Object.freeze(['name', 'years']),
  Object.freeze(['name']),
]);

const SELECTOR_FIELDS = Object.freeze(['key', 'name', 'years']);
const OUTPUT_FIELDS = Object.freeze(['sovereignId', 'authorityId', 'relationship']);

// ───────────────────────────── 证据层 ─────────────────────────────

/**
 * 逐字段归一化 + 空白折叠：空白 / 空串 / null / undefined → null。
 * 复用 identity 层的 normalizeKey()，保证与 key 的口径一致（§5.1）。
 */
export function normalizeEvidenceField(value) {
  if (value === null || value === undefined) return null;
  const s = normalizeKey(String(value));
  return s === '' ? null : s;
}

function usable(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * 从一年的 feature 属性构造「证据单元」。
 * 输入只允许：year + 四个证据字段（subject / name / partOf / abbrev）。
 * raw key 的派生沿用 §5.1（与 scripts/build-data.mjs:154 同规则）：
 *   rawKey = SUBJECTO || NAME；两者都不可用 → 无 key（关系层不得猜测）。
 */
export function buildEvidence(properties, year) {
  if (!Number.isInteger(year)) throw new Error(`证据层要求整数年份，收到：${JSON.stringify(year)}`);
  const p = properties ?? {};
  const subject = normalizeEvidenceField(p.subject);
  const name = normalizeEvidenceField(p.name);
  let key = null;
  if (usable(p.subject)) key = normalizeEvidenceField(p.subject);
  else if (usable(p.name)) key = normalizeEvidenceField(p.name);
  if (key === '') key = null;
  return {
    year,
    key,
    name,
    subject,
    partOf: normalizeEvidenceField(p.partOf),
    abbrev: normalizeEvidenceField(p.abbrev),
  };
}

/** 证据单元的稳定标签，用于冲突报错与审计输出 */
export function evidenceLabel(evidence) {
  return `(year=${evidence.year}, key=${JSON.stringify(evidence.key)}, name=${JSON.stringify(evidence.name)})`;
}

export function evidenceCell(evidence) {
  return `${evidence.year}\u0000${evidence.key ?? ''}\u0000${evidence.name ?? ''}`;
}

// ───────────────────────────── 规则 / 选择器 ─────────────────────────────

/** match 中实际出现的字段（`name: null` 是合法选择器值，因此按「键是否存在」判定） */
export function selectorFieldsOf(match) {
  if (match === null || typeof match !== 'object' || Array.isArray(match)) return null;
  return SELECTOR_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(match, f));
}

/** §5.3：返回优先级编号（1..6）；形态不在表内即抛错（不静默降级） */
export function rulePriority(match) {
  const present = selectorFieldsOf(match);
  if (!present) throw new Error(`规则 match 必须是对象，收到：${JSON.stringify(match)}`);
  if (present.length === 0) {
    throw new Error('规则 match 为空：§5.3 的优先级表未定义该形态（不提供「匹配一切」的规则）');
  }
  const idx = SELECTOR_FORMS.findIndex(
    (form) => form.length === present.length && form.every((f) => present.includes(f)),
  );
  if (idx < 0) {
    throw new Error(
      `规则 match 形态非法：{${present.join(', ')}} —— §5.3 只定义 ${SELECTOR_FORMS.length} 种形态（无 years-only、无 regex / glob / prefix）`,
    );
  }
  return idx + 1;
}

export function ruleMatches(match, evidence) {
  const present = selectorFieldsOf(match) ?? [];
  if (present.includes('key')) {
    if (evidence.key === null || evidence.key === undefined) return false;
    if (evidence.key !== match.key) return false;
  }
  if (present.includes('name')) {
    if (match.name === null) {
      if (evidence.name !== null) return false;
    } else if (evidence.name !== match.name) return false;
  }
  if (present.includes('years')) {
    const y = match.years;
    if (!Array.isArray(y) || y.length !== 2 || !Number.isInteger(y[0]) || !Number.isInteger(y[1]) || y[0] > y[1]) {
      throw new Error(`规则 match.years 必须是 [from, to] 闭区间（整数、from ≤ to），收到：${JSON.stringify(y)}`);
    }
    if (evidence.year < y[0] || evidence.year > y[1]) return false;
  }
  return true;
}

/** 规则的 output 归一化为固定三字段（键序固定，null 保持 null） */
export function normalizeOutput(output) {
  const o = output ?? {};
  return {
    sovereignId: o.sovereignId ?? null,
    authorityId: o.authorityId ?? null,
    relationship: o.relationship,
  };
}

function outputKey(output) {
  return JSON.stringify([output.sovereignId, output.authorityId, output.relationship]);
}

/** 规则 id 的确定性排序（同优先级、同输出时的审计选择；不改变输出值） */
function byRuleId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * §5.3 匹配：取最高优先级命中。
 * 同优先级多命中且输出不同 → 抛错（构建失败），不得 first-match / last-match / 静默覆盖（§6.3、T13、R9）。
 */
export function matchRule(evidence, rules) {
  const list = Array.isArray(rules) ? rules : [];
  let best = null;
  let hits = [];
  for (const rule of list) {
    const priority = rulePriority(rule.match);
    if (!ruleMatches(rule.match, evidence)) continue;
    if (best === null || priority < best) {
      best = priority;
      hits = [];
    }
    if (priority === best) hits.push({ id: rule.id, output: normalizeOutput(rule.output) });
  }
  if (hits.length === 0) return null;
  const distinct = new Map();
  for (const h of hits) distinct.set(outputKey(h.output), h.output);
  if (distinct.size > 1) {
    const ids = hits.map((h) => h.id).sort().join(' / ');
    const outs = [...distinct.values()].map((o) => JSON.stringify(o)).join('  vs  ');
    throw new Error(
      `关系规则冲突（同优先级、不同输出）：证据单元 ${evidenceLabel(evidence)} 命中优先级 ${best} 的 ${hits.length} 条规则 [${ids}]；输出：${outs}`,
    );
  }
  const chosen = [...hits].sort(byRuleId)[0];
  return { id: chosen.id, priority: best, output: chosen.output };
}

/**
 * §5.1：④ relationship resolver + ⑤ resolutionStatus 派生。
 * 无命中 → null / null / "unknown" / "unresolved"（§6.1「证据不足」行）。
 */
export function resolveRelation(evidence, rules = []) {
  const hit = matchRule(evidence, rules);
  if (!hit) {
    return {
      sovereignId: null,
      authorityId: null,
      relationship: RELATIONSHIP_UNKNOWN,
      resolutionStatus: STATUS_UNRESOLVED,
    };
  }
  return {
    sovereignId: hit.output.sovereignId,
    authorityId: hit.output.authorityId,
    relationship: hit.output.relationship,
    resolutionStatus: STATUS_RESOLVED,
  };
}

// ───────────────────────────── 校验 ─────────────────────────────

/**
 * 规则集校验（含 §4.2「output 不得出现身份标识字段」——由调用方把该键名作为
 * forbiddenOutputKeys 传入，使本文件不出现该字段名，从而让 R4 的静态断言成立）。
 */
export function validateRules(rules, options = {}) {
  const { forbiddenOutputKeys = [], authorityRegistry = new Set(), polityIds = null } = options;
  const problems = [];
  if (!Array.isArray(rules)) return ['rules 必须是数组'];
  const seen = new Set();
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const at = `rules[${i}]`;
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      problems.push(`${at} 必须是对象`);
      continue;
    }
    const id = rule.id;
    if (typeof id !== 'string' || id.trim() === '') problems.push(`${at}.id 必须是非空字符串`);
    else if (seen.has(id)) problems.push(`${at}.id 重复：${id}`);
    else seen.add(id);

    try {
      const priority = rulePriority(rule.match);
      if (priority > 6) problems.push(`${at}.match 优先级越界`);
    } catch (e) {
      problems.push(`${at}.match 非法：${e.message}`);
    }

    const match = rule.match ?? {};
    if (Object.prototype.hasOwnProperty.call(match, 'key') && typeof match.key !== 'string') {
      problems.push(`${at}.match.key 必须是字符串`);
    }
    if (Object.prototype.hasOwnProperty.call(match, 'name') && match.name !== null && typeof match.name !== 'string') {
      problems.push(`${at}.match.name 必须是字符串或 null（null = NAME 为空的选择器）`);
    }

    const output = rule.output;
    if (output === null || typeof output !== 'object' || Array.isArray(output)) {
      problems.push(`${at}.output 必须是对象`);
    } else {
      for (const k of Object.keys(output)) {
        if (forbiddenOutputKeys.includes(k)) problems.push(`${at}.output 不得出现字段「${k}」（§4.2：关系层不得输出身份）`);
        else if (!OUTPUT_FIELDS.includes(k)) problems.push(`${at}.output 含未定义字段「${k}」`);
      }
      for (const k of OUTPUT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(output, k)) problems.push(`${at}.output 缺少字段「${k}」`);
      }
      const sov = output.sovereignId ?? null;
      if (sov !== null && typeof sov !== 'string') problems.push(`${at}.output.sovereignId 必须是字符串或 null`);
      else if (sov !== null && polityIds && !polityIds.has(sov)) problems.push(`${at}.output.sovereignId 不在既有 polity 注册表中：${sov}`);
      const auth = output.authorityId ?? null;
      if (auth !== null) {
        if (typeof auth !== 'string' || !AUTHORITY_ID_PATTERN.test(auth)) {
          problems.push(`${at}.output.authorityId 必须匹配 ${AUTHORITY_ID_SOURCE}，收到：${JSON.stringify(auth)}`);
        } else if (!authorityRegistry.has(auth)) {
          problems.push(`${at}.output.authorityId 未在 authorities.json 中注册：${auth}`);
        }
      }
      if (!RELATIONSHIP_ENUM.includes(output.relationship)) {
        problems.push(`${at}.output.relationship 不在冻结的 11 项枚举内：${JSON.stringify(output.relationship)}`);
      }
    }

    if (typeof rule.source !== 'string' || rule.source.trim() === '') problems.push(`${at}.source 必填（非空字符串）`);
    if (!CONFIDENCE_ENUM.includes(rule.confidence)) {
      problems.push(`${at}.confidence 必须是 ${CONFIDENCE_ENUM.join(' | ')}`);
    }
  }
  return problems;
}

/** authority 注册表校验：命名空间必须是 auth:<SLUG> */
export function validateAuthorities(doc) {
  const problems = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return ['authorities.json 顶层必须是对象'];
  if (doc.version !== 1) problems.push(`authorities.json.version 必须是 1，收到：${JSON.stringify(doc.version)}`);
  if (!Array.isArray(doc.authorities)) return [...problems, 'authorities.json.authorities 必须是数组'];
  const seen = new Set();
  doc.authorities.forEach((entry, i) => {
    const at = `authorities[${i}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${at} 必须是对象`);
      return;
    }
    if (typeof entry.id !== 'string' || !AUTHORITY_ID_PATTERN.test(entry.id)) {
      problems.push(`${at}.id 必须匹配 ${AUTHORITY_ID_SOURCE}，收到：${JSON.stringify(entry.id)}`);
    } else if (seen.has(entry.id)) problems.push(`${at}.id 重复：${entry.id}`);
    else seen.add(entry.id);
  });
  return problems;
}

/**
 * 记录校验：§4.4.1 两条推论 + §4.5 命名空间 + §6.5 状态闭集。
 * polityIds 是**既有 polity 注册表的全集**（不是当前 feature 的身份），用于 T14 / R8。
 */
export function validateRelationRecord(record, options = {}) {
  const { polityIds = null, authorityRegistry = new Set() } = options;
  const problems = [];
  const { sovereignId, authorityId, relationship, resolutionStatus } = record;

  if (!RELATIONSHIP_ENUM.includes(relationship)) {
    problems.push(`relationship 不在冻结的 11 项枚举内：${JSON.stringify(relationship)}`);
  }
  if (!STATUS_ENUM.includes(resolutionStatus)) {
    problems.push(`resolutionStatus 不在闭集内：${JSON.stringify(resolutionStatus)}`);
  }
  if (authorityId !== null) {
    if (typeof authorityId !== 'string' || !AUTHORITY_ID_PATTERN.test(authorityId)) {
      problems.push(`authorityId 必须匹配 ${AUTHORITY_ID_SOURCE} 或为 null：${JSON.stringify(authorityId)}`);
    } else if (!authorityRegistry.has(authorityId)) {
      problems.push(`authorityId 未在 authorities.json 中注册：${authorityId}`);
    }
  }
  if (sovereignId !== null) {
    if (typeof sovereignId !== 'string') problems.push(`sovereignId 必须是字符串或 null：${JSON.stringify(sovereignId)}`);
    else if (polityIds && !polityIds.has(sovereignId)) problems.push(`sovereignId 不在既有 polity 注册表中：${sovereignId}`);
  }
  if (relationship !== RELATIONSHIP_UNKNOWN && resolutionStatus !== STATUS_RESOLVED) {
    problems.push('relationship ≠ unknown 但 resolutionStatus ≠ resolved（§4.4.1 推论 1）');
  }
  if (resolutionStatus === STATUS_UNRESOLVED && !(sovereignId === null && authorityId === null && relationship === RELATIONSHIP_UNKNOWN)) {
    problems.push('unresolved 记录必须是 null + null + unknown 形状（§4.4.1 推论 2）');
  }
  return problems;
}
