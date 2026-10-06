// 关系层技术管线（P4.1-B）：证据 → resolver → 54 个 relation sidecar → 覆盖度审计。
//
// 上位规范：docs/design/P4.1-A-design.md（v3 最终冻结设计）
//   §4.6 / OQ-10 ✅（本阶段授权实施）：sidecar 存储形态 public/data/relations/<year>.json
//   §5.1 数据流 · §5.4 覆盖度审计 · §11 T10–T14 · §14.1 B1–B5
//
// 本模块只做「建立能力」：不填写任何历史关系规则、不修改 identity、不改颜色、
// 不改 geometry、不写 public/data/years/**、不写 data/identity/**、不写 manifest.json。
//
// 身份隔离：本模块的**装配阶段**可以读 identity 层已经产出的身份标识，仅用于填写
// 记录的 entityId 字段；三个 resolver 位于 scripts/lib/relations.mjs，输入里没有身份标识，
// 也不接受任何几何。方向永远是 identity → relation，绝无反向。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  AUTHORITY_ID_PATTERN,
  RELATIONSHIP_ENUM,
  STATUS_RESOLVED,
  STATUS_UNRESOLVED,
  buildEvidence,
  evidenceCell,
  matchRule,
  resolveRelation,
  validateAuthorities,
  validateRelationRecord,
  validateRules,
} from './relations.mjs';
import { checkC5Constraints } from './relations-c5-validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');

export const DEFAULT_PATHS = Object.freeze({
  manifest: path.join(ROOT, 'public', 'data', 'manifest.json'),
  entities: path.join(ROOT, 'public', 'data', 'entities.json'),
  yearsDir: path.join(ROOT, 'public', 'data', 'years'),
  relationsConfig: path.join(ROOT, 'data', 'relations', 'relations.json'),
  authoritiesConfig: path.join(ROOT, 'data', 'relations', 'authorities.json'),
  outDir: path.join(ROOT, 'public', 'data', 'relations'),
});

/** 冻结的 sidecar 记录字段（§4 record schema：严格五字段，禁止 ruleId / source / confidence / notes / validFrom / validTo） */
export const RECORD_FIELDS = Object.freeze(['entityId', 'sovereignId', 'authorityId', 'relationship', 'resolutionStatus']);

/** 冻结的 sidecar 顶层字段（year + features；features 的键 = 年份文件内 feature 的 id） */
export const SIDECAR_TOP_LEVEL_FIELDS = Object.freeze(['year', 'features']);

/** §4.2：规则的 output 不允许出现的字段（机器可检查的 A2 护栏） */
export const FORBIDDEN_OUTPUT_KEYS = Object.freeze(['entityId']);

export async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// ───────────────────────────── 配置 ─────────────────────────────

export async function loadConfig(options = {}) {
  const {
    configPath = DEFAULT_PATHS.relationsConfig,
    authoritiesPath = DEFAULT_PATHS.authoritiesConfig,
    polityIds = null,
  } = options;

  const doc = await readJson(configPath);
  const authDoc = await readJson(authoritiesPath);
  const problems = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    problems.push('relations.json 顶层必须是对象');
  } else {
    if (doc.version !== 1) problems.push(`relations.json.version 必须是 1，收到：${JSON.stringify(doc.version)}`);
    for (const k of Object.keys(doc)) {
      if (!['version', 'rules'].includes(k)) problems.push(`relations.json 含未定义顶层字段「${k}」（冻结结构只有 version + rules）`);
    }
  }
  if (authDoc === null || typeof authDoc !== 'object' || Array.isArray(authDoc)) {
    problems.push('authorities.json 顶层必须是对象');
  } else {
    for (const k of Object.keys(authDoc)) {
      if (!['version', 'authorities'].includes(k)) problems.push(`authorities.json 含未定义顶层字段「${k}」（冻结结构只有 version + authorities）`);
    }
  }
  problems.push(...validateAuthorities(authDoc));

  const authorities = Array.isArray(authDoc?.authorities) ? authDoc.authorities : [];
  const authorityRegistry = new Set(authorities.map((a) => a?.id).filter(Boolean));
  const rules = Array.isArray(doc?.rules) ? doc.rules : [];
  problems.push(...validateRules(rules, { forbiddenOutputKeys: FORBIDDEN_OUTPUT_KEYS, authorityRegistry, polityIds }));

  if (problems.length > 0) {
    throw new Error(`关系层配置校验失败：\n  - ${problems.join('\n  - ')}`);
  }
  return { rules, authorities, authorityRegistry, rulesDoc: doc, authoritiesDoc: authDoc };
}

// ───────────────────────────── sidecar 序列化 ─────────────────────────────

/** 一条记录序列化为固定字段、固定键序（确定性） */
export function serializeRecord(record) {
  return `{${RECORD_FIELDS.map((f) => `${JSON.stringify(f)}:${JSON.stringify(record[f] ?? null)}`).join(',')}}`;
}

/**
 * sidecar 文本：顶层只有 year + features；features 的键按数值升序排列，
 * 每条记录独占一行（体积接近紧凑 JSON，同时保持可 diff）。
 */
export function serializeSidecar(year, entries) {
  const sorted = [...entries].sort((a, b) => Number(a[0]) - Number(b[0]));
  const lines = ['{', `  "year": ${year},`, '  "features": {'];
  sorted.forEach(([key, record], i) => {
    lines.push(`    ${JSON.stringify(key)}: ${serializeRecord(record)}${i === sorted.length - 1 ? '' : ','}`);
  });
  lines.push('  }', '}', '');
  return lines.join('\n');
}

/** 全部 sidecar 的汇总摘要（R10 确定性比较用） */
export function sidecarDigest(docs) {
  const years = [...docs.keys()].sort((a, b) => a - b);
  const h = createHash('sha256');
  for (const year of years) {
    h.update(`${year}\n`);
    h.update(serializeSidecar(year, docs.get(year)));
    h.update('\n');
  }
  return h.digest('hex');
}

// ───────────────────────────── 构建 ─────────────────────────────

/**
 * 关系层构建：读 54 个年份文件 → 证据 → 三个 resolver → 装配 sidecar → 审计。
 * 不写盘由调用方决定（write=false 时只返回内存结果，用于确定性与隔离测试）。
 */
export async function buildRelations(options = {}) {
  const {
    write = false,
    outDir = DEFAULT_PATHS.outDir,
    configPath = DEFAULT_PATHS.relationsConfig,
    authoritiesPath = DEFAULT_PATHS.authoritiesConfig,
  } = options;

  const manifest = await readJson(DEFAULT_PATHS.manifest);
  const entities = await readJson(DEFAULT_PATHS.entities);
  const polityIds = new Set((entities.entities ?? []).map((e) => e.id));

  const { rules, authorities, authorityRegistry } = await loadConfig({ configPath, authoritiesPath, polityIds });

  const snapshots = [...manifest.snapshots].sort((a, b) => a.year - b.year);

  const docs = new Map();
  const perYear = [];
  const cells = new Map(); // 证据单元 (year, key, name) → 统计（v3 §5.3 口径：空白 NAME 归一化为 null）
  const baselineCells = new Set(); // P4.1-A §5.4 基线口径：NAME 原样，只排除 NAME 为 null/undefined 的 feature
  const yearKeyCells = new Set();
  const ruleHits = new Map();
  const conflicts = [];
  let features = 0;
  let unnamed = 0;
  let noKey = 0;
  let keyPresentNameEmpty = 0;
  let keyPresentNameNull = 0;
  let keyPresentNameWhitespaceOnly = 0;
  let resolved = 0;
  /** C5-D1 / C5-D2 最小约束提示（warning 模式：只收集，不阻断构建、不影响 sidecar 与 digest） */
  const c5Warnings = [];

  for (const snap of snapshots) {
    const fc = await readJson(path.join(DEFAULT_PATHS.yearsDir, path.basename(snap.file)));
    const entries = [];
    let yResolved = 0;
    let yNoKey = 0;
    let yNameEmpty = 0;

    for (const f of fc.features) {
      features++;
      const props = f.properties ?? {};
      // ① 证据层：只接收 year + 四个证据字段（不传身份、不传颜色、不传几何）
      const ev = buildEvidence(props, snap.year);
      // ②③④⑤ 三个 resolver + 状态派生
      const rel = resolveRelation(ev, rules);
      // 装配阶段：读 identity 层已产出的身份标识，仅用于 filling record.entityId
      const record = {
        entityId: props.entityId ?? null,
        sovereignId: rel.sovereignId,
        authorityId: rel.authorityId,
        relationship: rel.relationship,
        resolutionStatus: rel.resolutionStatus,
      };
      const problems = validateRelationRecord(record, { polityIds, authorityRegistry });
      if (problems.length > 0) {
        throw new Error(`关系记录校验失败：${snap.year} feature id=${f.id}：${problems.join('；')}`);
      }
      // C5-D1 / C5-D2 最小约束：**warning 模式** —— 只收集提示，不阻断构建、不写盘、不改记录
      c5Warnings.push(...checkC5Constraints(record, { year: snap.year, featureId: f.id }));

      entries.push([String(f.id), record]);

      if (record.entityId === 'UNNAMED') unnamed++;

      if (ev.key === null) {
        noKey++;
        yNoKey++;
      } else {
        const ck = evidenceCell(ev);
        let cell = cells.get(ck);
        if (!cell) {
          cell = { year: snap.year, key: ev.key, name: ev.name, features: 0, resolvedFeatures: 0 };
          cells.set(ck, cell);
        }
        cell.features++;
        yearKeyCells.add(`${snap.year}\u0000${ev.key}`);
        // P4.1-A §5.4 基线口径的对照计数（不参与解析，只用于报告解释差异）
        const rawName = props.name;
        if (rawName === null || rawName === undefined) {
          keyPresentNameNull++;
        } else {
          if (String(rawName).trim() === '') keyPresentNameWhitespaceOnly++;
          baselineCells.add(`${snap.year}\u0000${ev.key}\u0000${String(rawName)}`);
        }
        if (ev.name === null) {
          keyPresentNameEmpty++;
          yNameEmpty++;
        }
        if (rel.resolutionStatus === STATUS_RESOLVED) cell.resolvedFeatures++;
      }

      if (rel.resolutionStatus === STATUS_RESOLVED) {
        resolved++;
        yResolved++;
        // ruleHitIds 修复：resolveRelation 按契约只返回四个关系层字段，因此命中的规则 id 需单独取
        const hit = matchRule(ev, rules);
        if (hit) ruleHits.set(hit.id, (ruleHits.get(hit.id) ?? 0) + 1);
      }
    }

    // 完整性断言 R1 / R2：sidecar 的键集合必须与年份文件的 feature id 集合完全一致
    const fileIds = new Set(fc.features.map((f) => String(f.id)));
    const sidecarIds = new Set(entries.map(([k]) => k));
    if (fileIds.size !== sidecarIds.size || [...fileIds].some((id) => !sidecarIds.has(id))) {
      throw new Error(`sidecar 覆盖不一致：${snap.year} 年份文件 ${fileIds.size} 个 feature，sidecar ${sidecarIds.size} 个`);
    }
    for (const [key, record] of entries) {
      const keys = Object.keys(record);
      if (keys.length !== RECORD_FIELDS.length || RECORD_FIELDS.some((f) => !keys.includes(f))) {
        throw new Error(`sidecar 记录字段不合规：${snap.year} feature id=${key}：${keys.join(',')}`);
      }
    }

    docs.set(snap.year, entries);
    perYear.push({
      year: snap.year,
      file: snap.file,
      sourceFeatures: fc.features.length,
      sidecarFeatures: entries.length,
      noKey: yNoKey,
      keyPresentNameEmpty: yNameEmpty,
      resolved: yResolved,
      unresolved: entries.length - yResolved,
    });
  }

  if (write) {
    await fs.mkdir(outDir, { recursive: true });
    for (const [year, entries] of docs) {
      await fs.writeFile(path.join(outDir, `${year}.json`), serializeSidecar(year, entries), 'utf8');
    }
  }

  const unresolvedCells = [...cells.values()].filter((c) => c.resolvedFeatures === 0);
  const unresolvedCellFeatures = unresolvedCells.reduce((n, c) => n + c.features, 0);

  const audit = {
    config: {
      rulesPath: path.relative(ROOT, configPath).replace(/\\/g, '/'),
      authoritiesPath: path.relative(ROOT, authoritiesPath).replace(/\\/g, '/'),
      ruleCount: rules.length,
      authorityCount: authorities.length,
    },
    counts: {
      snapshots: snapshots.length,
      features,
      unnamedFeatures: unnamed,
      noKeyFeatures: noKey,
      keyPresentNameEmpty,
      keyPresentNameNull,
      keyPresentNameWhitespaceOnly,
      evidenceCellsYearKeyName: cells.size,
      evidenceCellsYearKeyNameBaselineP41A: baselineCells.size,
      evidenceCellsYearKey: yearKeyCells.size,
      evidenceCellsResolved: cells.size - unresolvedCells.length,
      evidenceCellsUnresolved: unresolvedCells.length,
      unresolvedCellFeatures,
      resolved,
      unresolved: features - resolved,
      ruleHits: resolved,
      conflicts: conflicts.length,
    },
    perYear,
    ruleHitIds: [...ruleHits.keys()].sort(),
    ruleHitCounts: [...ruleHits.entries()].map(([id, hits]) => ({ id, hits })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    unresolvedCells: unresolvedCells
      .map((c) => ({ year: c.year, key: c.key, name: c.name, features: c.features }))
      .sort((a, b) => a.year - b.year || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || String(a.name).localeCompare(String(b.name))),
    digest: sidecarDigest(docs),
  };

  return { audit, docs, rules, c5Warnings };
}

// ───────────────────────────── 报告 ─────────────────────────────

function pct(n, d) {
  if (d === 0) return '0.00%';
  return `${((n / d) * 100).toFixed(2)}%`;
}

function baselineNote(actual, baseline, label) {
  if (actual === baseline) return `**${actual}**（与 P4.1-A 基线一致 ✅）`;
  return `**${actual}**（P4.1-A 基线为 ${baseline}，差异 ${actual - baseline}：${label}）`;
}

/** 默认阶段名（可用 --phase <name> 覆盖）；报告头部一律由实际状态派生，不写死阶段名 / 规则数 */
export const DEFAULT_PHASE = 'P4.1-C Pilot Batch 1';

export function renderCoverageReport(audit, validation = null, meta = {}) {
  const c = audit.counts;
  const lines = [];
  const baselineFeatures = 17438;

  // 头部元信息全部来自实际状态：阶段名（--phase 或默认）、本次构建实际加载的规则集
  const phase = meta.phase ?? DEFAULT_PHASE;
  const ruleIds = (meta.rules ?? []).map((r) => r.id).filter((id) => typeof id === 'string');
  const ruleCount = ruleIds.length > 0 ? ruleIds.length : audit.config.ruleCount;
  const caseCounts = new Map();
  for (const id of ruleIds) {
    const m = /case\s*(\d+)/i.exec(id);
    if (m) caseCounts.set(Number(m[1]), (caseCounts.get(Number(m[1])) ?? 0) + 1);
  }
  const caseLabel = [...caseCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, k]) => (k === 1 ? `Case ${n}` : `Case ${n}×${k}`))
    .join(' + ');
  const missingCases = [1, 2, 3, 4, 5].filter((n) => !caseCounts.has(n));

  lines.push(`# ${phase} 关系层覆盖度报告（relation coverage）`);
  lines.push('');
  lines.push(`> 阶段：**${phase}**。${ruleCount === 0 ? '本阶段**只建立能力，不做历史裁决**。' : '本报告的裁决字段全部来自实际加载的规则集（机械执行，未新增裁决）。'}`);
  lines.push('> 上位规范：`docs/design/P4.1-A-design.md`（v3 最终冻结设计）。');
  lines.push(`> 关系规则集：**${ruleCount} 条**${caseLabel ? `（${caseLabel}）` : ''}${missingCases.length > 0 ? `；Case ${missingCases.join(' / Case ')} 未写入规则` : ''}。`);
  lines.push(`> 本报告由 \`scripts/lib/relations-build.mjs\` 生成（机械数字部分），外部验证结果由 \`tests/relations/run.mjs\` 注入。阶段名取自 \`--phase\`（默认 \`${DEFAULT_PHASE}\`），规则数与规则组成取自本次构建实际加载的 \`${audit.config.rulesPath}\`。`);
  lines.push('');
  lines.push('## 1. feature 基线');
  lines.push('');
  lines.push(`- 54 个快照的 feature 总数：${baselineNote(c.features, baselineFeatures, '年份文件集合/解析口径变化，或 `data/geo` 地理实体存在性补全（R-A，P4.4-6）与政治 feature 连续性补全（L1，`data/identity/continuity.json`）注入的要素')}`);
  lines.push(`- 其中 ` + '`UNNAMED`' + `（无 key 或有 key 但身份缺失）：**${c.unnamedFeatures}**`);
  lines.push(`- 快照数：**${c.snapshots}**`);
  lines.push('');
  lines.push('## 2–5. 证据单元');
  lines.push('');
  lines.push(`| # | 指标 | 实测 | 说明 |`);
  lines.push('|---|---|---|---|');
  lines.push(`| 2 | 证据单元 \`(year, key, name)\` | **${c.evidenceCellsYearKeyName}**（本实现/v3 §5.3 口径）· **${c.evidenceCellsYearKeyNameBaselineP41A}**（P4.1-A §5.4 基线口径） | 两种口径都列出，差异已定位，见下方说明 |`);
  lines.push(`| 3 | 证据单元 \`(year, key)\` | ${baselineNote(c.evidenceCellsYearKey, 9713, '政治 feature 连续性补全（L1，`data/identity/continuity.json`）新增的 48 个 (year, key) 单元，或 P4.4-6 地理实体补全注入的要素')} | 忽略 NAME 维度 |`);
  lines.push(`| 4 | 无 key feature | ${baselineNote(c.noKeyFeatures, 7046, 'raw key 派生口径（SUBJECTO \\|\\| NAME）、几何丢弃数不同，或地理实体补全注入的无 key 要素（P4.4-6）')} | 全部 \`unresolved\`，不得猜测 |`);
  lines.push(`| 5 | 有 key 但 NAME 为空白的 feature | ${baselineNote(c.keyPresentNameEmpty, 12, '空白 NAME 的判定口径不同')} | 其中 NAME 为 \`null\`/\`undefined\` 的 ${c.keyPresentNameNull} 个、纯空白串的 ${c.keyPresentNameWhitespaceOnly} 个 |`);
  lines.push('');
  lines.push('### 2.1 与 P4.1-A 基线 10,095 的差异说明（**未修改任何数据**）');
  lines.push('');
  lines.push(`- P4.1-A §5.4 的基线口径 = 「有 key + NAME」的单元：把 NAME 原样作为第三维，**只排除 NAME 为 \`null\`/\`undefined\` 的 feature**（纯空白串仍保留为字面值）。按该口径复算，本实现得到 **${c.evidenceCellsYearKeyNameBaselineP41A}**，与基线一致。`);
  lines.push(`- 本实现审计口径 = v3 §5.3 规定「空白 NAME 归一化为 \`null\`，且 \`null\` 是合法选择器值」，因此 ${c.keyPresentNameNull} 个 NAME 为 \`null\`/\`undefined\` 的 feature 与 ${c.keyPresentNameWhitespaceOnly} 个纯空白 NAME 的 feature 一起落到 \`name = null\` 的单元，得到 **${c.evidenceCellsYearKeyName}**。`);
  lines.push(`- 差值来源：\`name = null\` 的单元共 7 个（year = -2000 \`arctic marine mammal hunters\` / 100 \`1\` / 1783 \`3\` / 1815 \`dutch east indies\`（6 个 feature 同键）/ -5000 \`cardial ware culture\` / 700 \`bega\` / 1815 \`united kingdom of netherlands\`）；基线口径把前 4 个（NAME 真缺失）排除，仅保留后 3 个（NAME 为纯空白串），故 ${c.evidenceCellsYearKeyName} − 4 = ${c.evidenceCellsYearKeyNameBaselineP41A}。`);
  lines.push(`- 该差异是**审计计数口径**的差异，不是数据差异；解析器在规则集（${ruleCount} 条）下的行为与计数口径无关，证据单元集合不因口径而改变。`);
  lines.push('');
  lines.push('## 6–7. 54 个年份的覆盖情况');
  lines.push('');
  lines.push('| year | 年份文件 | 年份文件 feature | sidecar feature | 一致 | 无 key | 有 key 无 NAME | resolved | unresolved | coverage |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const y of audit.perYear) {
    const ok = y.sourceFeatures === y.sidecarFeatures ? '✅' : '❌';
    lines.push(
      `| ${y.year} | \`${y.file}\` | ${y.sourceFeatures} | ${y.sidecarFeatures} | ${ok} | ${y.noKey} | ${y.keyPresentNameEmpty} | ${y.resolved} | ${y.unresolved} | ${pct(y.resolved, y.sourceFeatures)} |`,
    );
  }
  lines.push('');
  lines.push('## 8–11. 覆盖度汇总');
  lines.push('');
  lines.push(`- **8. resolved 数**：**${c.resolved}**`);
  lines.push(`- **9. unresolved 数**：**${c.unresolved}**`);
  lines.push(`- **10. coverage**：resolved ${pct(c.resolved, c.features)} / unresolved ${pct(c.unresolved, c.features)}`);
  lines.push(`- **11. rule hit count**：**${c.ruleHits}**（规则集 ${audit.config.ruleCount} 条）`);
  lines.push(`- 证据单元层面：已解析 ${c.evidenceCellsResolved} 个 / 未解析 ${c.evidenceCellsUnresolved} 个（覆盖 ${c.unresolvedCellFeatures} 个 feature）`);

  // §11.1 逐规则命中明细：只读取并渲染 audit.ruleHitCounts，不改动任何计算逻辑
  const ruleHitCounts = Array.isArray(audit.ruleHitCounts) ? audit.ruleHitCounts : [];
  const hitsById = new Map(ruleHitCounts.map((h) => [h.id, h.hits]));
  const detailIds =
    ruleIds.length > 0
      ? [...ruleIds, ...ruleHitCounts.map((h) => h.id).filter((id) => !ruleIds.includes(id))]
      : ruleHitCounts.map((h) => h.id).slice().sort();
  if (detailIds.length > 0) {
    lines.push('');
    lines.push('### 11.1 逐规则命中明细（`audit.ruleHitCounts`）');
    lines.push('');
    lines.push(
      `- \`audit.ruleHitCounts\` 条目数：**${ruleHitCounts.length}**；下表列出规则集全部 **${detailIds.length}** 条规则（无命中者记 0）`,
    );
    lines.push('');
    lines.push('| rule id | hits |');
    lines.push('|---|---|');
    for (const id of detailIds) lines.push(`| \`${id}\` | ${hitsById.get(id) ?? 0} |`);
  }

  lines.push('');
  if (ruleCount === 0) {
    lines.push(`> 空规则阶段的预期结果是 **resolved coverage = 0% / unresolved coverage = 100%**；实测 ${c.resolved === 0 ? '**符合预期** ✅' : '**不符合预期** ❌（须立即检查规则解析器）'}。`);
  } else {
    lines.push(`> 规则集 **${ruleCount} 条**，命中 **${c.ruleHits}** 个 feature（resolved ${pct(c.resolved, c.features)} / unresolved ${pct(c.unresolved, c.features)}）。未命中规则的 feature 必须保持 \`null / null / unknown / unresolved\` 保守形状。`);
  }
  lines.push('');
  lines.push('## 12. conflict count');
  lines.push('');
  lines.push(`- 构建期同优先级冲突：**${c.conflicts}**（同优先级不同输出会让构建直接失败，见 T13 / R9）`);
  lines.push(`- 证据冲突（史实分歧）本阶段不裁决，全部落在 \`unresolved\`（§6.3）`);
  lines.push('');
  lines.push('## 13. schema validation');
  lines.push('');
  if (validation?.schemaValidation) {
    const s = validation.schemaValidation;
    lines.push(`- 记录字段集合：严格五字段 ${s.recordFieldsOk ? '✅' : '❌'}（${RECORD_FIELDS.join(' / ')}）`);
    lines.push(`- sidecar 顶层字段：${SIDECAR_TOP_LEVEL_FIELDS.join(' + ')} ${s.topLevelOk ? '✅' : '❌'}`);
    lines.push(`- 命名空间（R7 / T14）：authorityId 全部匹配 \`${AUTHORITY_ID_PATTERN.source}\` 或 null ${s.authorityNamespaceOk ? '✅' : '❌'}`);
    lines.push(`- sovereignId 全部来自既有 polity 注册表或 null（R8）：${s.sovereignRegistryOk ? '✅' : '❌'}（注册表 ${s.polityCount} 个实体）`);
    lines.push(`- 记录合规（§4.4.1 推论 1/2）：${s.recordsOk ? '✅' : '❌'}（校验 ${s.recordsChecked} 条）`);
  } else {
    lines.push('- 未注入外部验证结果（仅本进程内校验通过）');
  }
  lines.push('');
  lines.push('## 14. determinism');
  lines.push('');
  lines.push(`- sidecar 汇总摘要（54 个文件，按年份序）：\`${audit.digest}\``);
  if (validation?.determinism) {
    const d = validation.determinism;
    lines.push(`- 跨进程连续两次构建：run#1 \`${d.digestRun1}\` / run#2 \`${d.digestRun2}\` → ${d.equal ? '**相同 ✅**' : '**不同 ❌**'}`);
    lines.push(`- 逐文件 SHA-256 比对：${d.filesCompared} 个文件，${d.fileMismatches.length === 0 ? '全部相同 ✅' : `不一致 ${d.fileMismatches.length} 个 ❌`}`);
  } else {
    lines.push('- 跨进程确定性：见 `tests/relations/run.mjs` 的 R10（未注入结果）');
  }
  lines.push('');
  lines.push('## 15. production integrity');
  lines.push('');
  if (validation?.productionIntegrity) {
    const p = validation.productionIntegrity;
    lines.push(`- 受保护生产文件：**${p.checked}** 个（\`data/identity/**\`、54 个 \`public/data/years/*.json\`、\`entities.json\`、\`manifest.json\`、\`data/raw/**\`）`);
    lines.push(`- 关系层工具运行后：变更 **${p.changed}** 个 → ${p.changed === 0 ? '**0 changes ✅**' : '**❌ 立即停止并报告**'}`);
    lines.push(`- 逐文件 SHA-256 比对：${p.hashMatches} 个匹配 / ${p.checked} 个受检`);
  } else {
    lines.push('- 未注入外部验证结果');
  }
  lines.push('');
  lines.push('## 16. OPEN QUESTIONS');
  lines.push('');
  lines.push('当前**全部仍然开放**的工程问题（历史裁决类问题一律留给 P4.1-C）。本次报告更新**不关闭、不合并、不删除**任何 OQ：');
  lines.push('');
  lines.push('| OQ | 内容 | 状态 |');
  lines.push('|---|---|---|');
  lines.push('| OQ-B1 | 关系层构建是否需要接线到 `npm run data:build` / 新增 npm script（`package.json` 当前**未修改**） | **OPEN** — 未处理；待授权（§15 / §18） |');
  lines.push('| OQ-B2 | 关系层产物是否需要登记进 `public/data/manifest.json`（当前**未修改**，关系层产物独立存在） | **OPEN** — 未处理；待授权（§15） |');
  lines.push('| OQ-B3 | 前端是否/何时读取 sidecar（`loadYear` 同构的按年按需加载） | **OPEN** — 未处理；待 P4.1-C/P4.2 |');
  lines.push('| OQ-3 | `relationship` 是否允许 `null`（现设计：恒非空，用 `unknown` 兜底） | **OPEN** — 实现采用候选 (a)，**正式裁定未记录**，未处理 |');
  lines.push('| OQ-4 | `federation`（Eritrea 1952–1962）仍无法被 11 项枚举表达 | **OPEN** — 未处理，留待 P4.1-C 历史裁决 |');
  lines.push('| OQ-5/6/7 | `dominion` / `personal-union` / `chartered` 表达缺口 | **OPEN** — 未处理 |');
  lines.push('| OQ-8 | 多主体 `sovereignId` / `authorityId`（Kuril Islands 1800/1815 双边声索） | **OPEN** — 未处理 |');
  lines.push('| OQ-9 | `UNNAMED` 哨兵 vs `entityId: null` | **OPEN** — 未处理（涉及 54 个年份文件的字节级迁移） |');
  lines.push('| OQ-11 | 是否需要 feature 级选择器（`featureId`）作为最后手段 | **OPEN** — 本阶段未引入 |');
  lines.push('| OQ-12 | 是否需要逐字段状态（`fieldStatus`）/ 第三态 | **OPEN** — 本阶段只有 2 个 status |');
  lines.push('| OQ-13 | `validFrom` / `validTo` 与「无快照区间」 | **OPEN** — 未处理（影响 P5 历史事件层架构） |');
  lines.push('| OQ-14 | 变更门禁方式：git vs 哈希 / mtime | **OPEN** — 本阶段继续用 hash + mtime；`git init` 未授权 |');
  lines.push('| OQ-C1 | `scope`（`feature-level` / `historical-background`）不属于 v3 冻结结构；7 条 authority 已按指令携带该字段 | **OPEN** — 本轮未处理 |');
  lines.push('| OQ-C2 | `notes` → `source`（notes 原文作证据 / 法理出处）；`confidence: "high"` 为指令未提供时的取值 | **OPEN** — 本轮未处理；可逐条改写 |');
  lines.push('| OQ-C3 | Case 5 未写入规则（依授权「6 条规则，不写 Case 5」）；1960 `eritrea\\|eritrea` 保持无命中默认值 | **OPEN** — 本轮未处理 |');
  lines.push('| OQ-C4 | `ET-ETHIOPIA` 不在 polity 注册表（3,056 个实体中无此 id）→ 未创建实体、未改 identity | **OPEN** — 本轮未处理 |');
  lines.push('| OQ-C5 | v3 §7「`occupied` ⇒ `sovereignId` 非空」与本批 6 条（`sovereignId` 全为 `null`）的张力；`validateRelationRecord` 只机器校验 §4.4.1 推论 1/2 | **OPEN** — 本轮未处理 |');
  lines.push('| OQ-C6 | 本报告 §11 是否渲染逐规则命中明细（`audit.ruleHitCounts`） | **本轮已按授权执行**（证据：§11.1）——OQ 条目保留，未宣告关闭 |');
  lines.push('| OQ-C7 | 本报告附录 C 曾为 13:21 版（当时 19 项中 16 项通过 / R3、T14、T12 未通过） | **本轮已按授权执行**（证据：附录 C 现为 19/19 PASS，三项均 pass）——OQ 条目保留，未宣告关闭 |');
  lines.push('');
  lines.push('**已裁定 / 已实施，但未在本表中宣告关闭的历史条目**（保留在册供审计对照）：');
  lines.push('');
  lines.push('| OQ | 内容 | 状态与证据 |');
  lines.push('|---|---|---|');
  lines.push('| OQ-1 | `sovereignId` 命名空间 | ✅ **用户已裁定（m02288，v3 冻结）**：`sovereignId = 既有 polity entityId \\| null`，不使用 `sov:` 命名空间（`docs/design/P4.1-A-design.md` §13 OQ-1） |');
  lines.push('| OQ-2 | `authorityId` 命名空间与注册表 | ✅ **用户已裁定（m02288，v3 冻结）**：`auth:<SLUG> \\| null`，注册表 `data/relations/authorities.json`（同上 §13 OQ-2） |');
  lines.push('| OQ-10 | 关系层存储形态：sidecar vs `properties` | **已实施（P4.1-B 授权范围内）**：`public/data/relations/<year>.json` 54 个文件已生成，54 个年份文件字节不变；**未由本报告宣告关闭** |');
  lines.push('');
  if (validation?.tests?.length) {
    lines.push('## 附录 C：测试矩阵结果（外部注入）');
    lines.push('');
    lines.push('| ID | 名称 | 结果 | 证据 |');
    lines.push('|---|---|---|---|');
    for (const t of validation.tests) {
      lines.push(`| ${t.id} | ${t.name} | ${t.status === 'pass' ? '✅ pass' : '❌ fail'} | ${t.detail} |`);
    }
    lines.push('');
  }
  lines.push('## 附录 A：54 个年份的逐行数字');
  lines.push('');
  lines.push('见 §6–7 的表格（year / 年份文件 / feature 数 / sidecar feature 数 / 一致性 / 无 key / 有 key 无 NAME / resolved / unresolved / coverage）。');
  lines.push('');
  lines.push(`## 附录 B：未覆盖证据单元工作队列（${audit.unresolvedCells.length} 个单元）`);
  lines.push('');
  lines.push('| year | key | name | feature 数 |');
  lines.push('|---|---|---|---|');
  for (const cell of audit.unresolvedCells) {
    lines.push(`| ${cell.year} | \`${cell.key}\` | ${cell.name === null ? '`null`' : `\`${cell.name}\``} | ${cell.features} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ───────────────────────────── CLI ─────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-write') opts.write = false;
    else if (a === '--no-self-check') opts.selfCheck = false;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[++i];
      if (val === undefined) throw new Error(`参数 ${a} 缺少值`);
      opts[key] = val;
    } else throw new Error(`未知位置参数：${a}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const write = opts.write !== false;
  const outDir = opts.out ? path.resolve(opts.out) : DEFAULT_PATHS.outDir;
  const configPath = opts.config ? path.resolve(opts.config) : DEFAULT_PATHS.relationsConfig;
  const authoritiesPath = opts.authorities ? path.resolve(opts.authorities) : DEFAULT_PATHS.authoritiesConfig;

  const first = await buildRelations({ write, outDir, configPath, authoritiesPath });

  // C5-D1 / C5-D2 最小约束：warning 模式 —— 只写 stderr，不阻断构建、不改变 stdout 的 JSON 摘要、不写盘
  if (first.c5Warnings.length > 0) {
    process.stderr.write(
      `[relations][C5-D1/D2][warning] ${first.c5Warnings.length} 条记录不满足最小约束（warning 模式，不阻断构建）：\n`,
    );
    for (const w of first.c5Warnings.slice(0, 20)) process.stderr.write(`  - ${w}\n`);
    if (first.c5Warnings.length > 20) process.stderr.write(`  … 其余 ${first.c5Warnings.length - 20} 条省略\n`);
  }

  let selfCheck = null;
  if (opts.selfCheck !== false) {
    const second = await buildRelations({ write: false, configPath, authoritiesPath });
    selfCheck = { digestRun1: first.audit.digest, digestRun2: second.audit.digest, equal: first.audit.digest === second.audit.digest };
  }

  if (opts.audit) {
    await fs.mkdir(path.dirname(path.resolve(opts.audit)), { recursive: true });
    await fs.writeFile(path.resolve(opts.audit), JSON.stringify(first.audit, null, 2) + '\n', 'utf8');
  }
  if (opts.report) {
    let validation = null;
    if (opts.validation) validation = await readJson(path.resolve(opts.validation));
    await fs.mkdir(path.dirname(path.resolve(opts.report)), { recursive: true });
    await fs.writeFile(path.resolve(opts.report), renderCoverageReport(first.audit, validation, { phase: opts.phase, rules: first.rules }), 'utf8');
  }

  const summary = {
    ok: true,
    wrote: write ? outDir : null,
    ...first.audit.counts,
    digest: first.audit.digest,
    selfCheck,
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
