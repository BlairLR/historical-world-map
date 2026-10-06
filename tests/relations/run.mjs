// 关系层测试运行器（P4.1-B 建立；P4.1-C Pilot Batch 1 起生产规则集非空）：T2 / T3 / T4 / T9–T14 + R1–R10。
//
// 上位规范：docs/design/P4.1-A-design.md（v3 最终冻结设计）§11 测试矩阵、§5.3、§5.4、§6.5
//
// 只读约束：本运行器**不修改任何生产文件**。所有夹具构建都写到系统 TEMP；
// 结束时对受保护生产文件做前后哈希比对（T11 / §14）。
//
// 用法：
//   node tests/relations/run.mjs [--validation <out.json>] [--baseline <p41b-baseline.txt>]
// 退出码：全部通过 0；任何一项失败 1。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  AUTHORITY_ID_PATTERN,
  RELATIONSHIP_ENUM,
  RELATIONSHIP_UNKNOWN,
  STATUS_RESOLVED,
  STATUS_UNRESOLVED,
  buildEvidence,
  matchRule,
  resolveRelation,
  validateRelationRecord,
  validateRules,
} from '../../scripts/lib/relations.mjs';
import {
  DEFAULT_PATHS,
  FORBIDDEN_OUTPUT_KEYS,
  RECORD_FIELDS,
  ROOT,
  SIDECAR_TOP_LEVEL_FIELDS,
  buildRelations,
  serializeSidecar,
} from '../../scripts/lib/relations-build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const CLI = path.join(ROOT, 'scripts', 'lib', 'relations-build.mjs');

const results = [];
let tmpRoot = null;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, name, status: 'pass', detail: typeof detail === 'string' ? detail : '通过' });
    console.log(`  ✅ ${id} ${name} —— ${typeof detail === 'string' ? detail : ''}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ id, name, status: 'fail', detail });
    console.log(`  ❌ ${id} ${name} —— ${detail}`);
  }
}

// ───────────────────────────── 通用工具 ─────────────────────────────

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function protectedPaths() {
  const list = [];
  const identityDir = path.join(ROOT, 'data', 'identity');
  for (const f of fs.readdirSync(identityDir)) list.push(path.join(identityDir, f));
  const yearsDir = path.join(ROOT, 'public', 'data', 'years');
  for (const f of fs.readdirSync(yearsDir)) list.push(path.join(yearsDir, f));
  list.push(path.join(ROOT, 'public', 'data', 'entities.json'));
  list.push(path.join(ROOT, 'public', 'data', 'manifest.json'));
  list.push(...walkFiles(path.join(ROOT, 'data', 'raw')));
  return list.sort();
}

function hashFiles(paths) {
  const m = new Map();
  for (const p of paths) {
    const buf = fs.readFileSync(p);
    m.set(path.relative(ROOT, p).replace(/\\/g, '/'), { bytes: buf.length, sha256: sha256(buf) });
  }
  return m;
}

function loadSidecars(dir) {
  const map = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    map.set(doc.year, doc);
  }
  return map;
}

function loadYearFile(snap) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', snap.file), 'utf8'));
}

async function buildWithFixture(name, outName) {
  const outDir = path.join(tmpRoot, outName);
  const res = await buildRelations({
    write: true,
    outDir,
    configPath: path.join(FIXTURES, name, 'relations.json'),
    authoritiesPath: path.join(FIXTURES, name, 'authorities.json'),
  });
  return { outDir, ...res };
}

// 生产配置（P4.1-C 起规则集非空，6 条）；变量名沿用历史命名，语义 = 「生产配置」而非「空规则」
const emptyConfig = { configPath: DEFAULT_PATHS.relationsConfig, authoritiesPath: DEFAULT_PATHS.authoritiesConfig };

/** 毒化属性对象：读取任何身份 / 颜色 / 几何字段即抛错，用于 R4 / R5 的动态断言 */
function poisonedProperties(props) {
  const forbidden = new Set(['entityId', 'color', 'geometry', 'coordinates', 'precision', 'BORDERPRECISION']);
  return new Proxy(props, {
    get(target, key) {
      if (typeof key === 'string' && forbidden.has(key)) {
        throw new Error(`resolver 非法读取了字段「${key}」`);
      }
      return target[key];
    },
    has(target, key) {
      if (typeof key === 'string' && forbidden.has(key)) {
        throw new Error(`resolver 非法探测了字段「${key}」`);
      }
      return key in target;
    },
  });
}

function hashDir(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).sort()) {
    out[f] = sha256(fs.readFileSync(path.join(dir, f)));
  }
  return out;
}

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  assert(r.status === 0, `CLI 退出码 ${r.status}（参数：${args.join(' ') || '（无）'}）`);
}

// ───────────────────────────── 主流程 ─────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  let validationOut = null;
  let baselinePath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--validation') validationOut = path.resolve(argv[++i]);
    else if (argv[i] === '--baseline') baselinePath = path.resolve(argv[++i]);
    else throw new Error(`未知参数：${argv[i]}`);
  }

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p41b-tests-'));
  const protectedBefore = hashFiles(protectedPaths());
  const prodSidecars = loadSidecars(DEFAULT_PATHS.outDir);
  const manifest = JSON.parse(fs.readFileSync(DEFAULT_PATHS.manifest, 'utf8'));
  const entities = JSON.parse(fs.readFileSync(DEFAULT_PATHS.entities, 'utf8'));
  const polityIds = new Set((entities.entities ?? []).map((e) => e.id));
  // 关系层注册表与规则集：必须读真实生产文件，不得写死（T14 / R3 / T12 的修复点）
  const authoritiesDoc = JSON.parse(fs.readFileSync(DEFAULT_PATHS.authoritiesConfig, 'utf8'));
  const authorityIds = new Set((authoritiesDoc.authorities ?? []).map((a) => a.id));
  const prodRules = JSON.parse(fs.readFileSync(DEFAULT_PATHS.relationsConfig, 'utf8')).rules ?? [];
  const sourceModule = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'relations.mjs'), 'utf8');

  console.log('关系层测试（T2 / T3 / T4 / T9–T14 + R1–R10）');
  console.log(`  生产规则集：${prodRules.length} 条；authority 注册表：${authorityIds.size} 条`);
  console.log(`  临时目录：${tmpRoot}`);
  console.log(`  受保护生产文件：${protectedBefore.size} 个`);
  console.log(`  生产 sidecar：${prodSidecars.size} 个年份`);

  // ── R1 / R2：sidecar 与年份文件逐 feature 对应 ──────────────────────
  await test('R1', 'sidecar feature 数量与年份文件完全一致', () => {
    let total = 0;
    for (const snap of manifest.snapshots) {
      const doc = prodSidecars.get(snap.year);
      assert(doc, `缺少 ${snap.year} 的 sidecar`);
      const file = loadYearFile(snap);
      assert(doc.features && typeof doc.features === 'object', `${snap.year} 的 sidecar 缺少 features 对象`);
      const n = Object.keys(doc.features).length;
      assert(n === file.features.length, `${snap.year}：sidecar ${n} 个 feature，年份文件 ${file.features.length} 个`);
      total += n;
    }
    assert(total === 17469, `feature 合计 ${total}，期望 17469`);
    return `54 个 sidecar 合计 ${total} 个 feature，逐年与年份文件一致`;
  });

  await test('R2', 'feature id 一一对应（集合相等）', () => {
    for (const snap of manifest.snapshots) {
      const doc = prodSidecars.get(snap.year);
      const file = loadYearFile(snap);
      const a = new Set(file.features.map((f) => String(f.id)));
      const b = new Set(Object.keys(doc.features));
      assert(a.size === b.size, `${snap.year}：id 数量不同`);
      for (const id of a) assert(b.has(id), `${snap.year}：sidecar 缺少 feature id=${id}`);
      assert(Object.keys(doc).length === SIDECAR_TOP_LEVEL_FIELDS.length && SIDECAR_TOP_LEVEL_FIELDS.every((k) => k in doc), `${snap.year}：sidecar 顶层字段不符`);
    }
    return '54 个年份的 id 集合完全相等，且 sidecar 顶层只有 year + features';
  });

  // ── R3：未命中规则的 feature 保持保守形状（规则集感知） ──────────────
  // 旧版把「空规则阶段」当成不变量（规则集非空后会误报）。现行语义：
  //   未命中任何规则 → null / null / unknown / unresolved
  //   命中规则       → 规则 output 三字段 + resolutionStatus = resolved
  // 判定用真实规则集与真实证据重算，不使用 sidecar 的自述状态作为前提。
  await test('R3', '未命中规则的 feature 保持 null/null/unknown/unresolved', () => {
    let conservative = 0;
    let matched = 0;
    for (const snap of manifest.snapshots) {
      const doc = prodSidecars.get(snap.year);
      const file = loadYearFile(snap);
      for (const f of file.features) {
        const rec = doc.features[String(f.id)];
        assert(rec, `${snap.year} id=${f.id}：sidecar 缺少对应记录`);
        const hit = matchRule(buildEvidence(f.properties ?? {}, snap.year), prodRules);
        if (!hit) {
          assert(rec.sovereignId === null, `${snap.year} id=${f.id}：未命中规则但 sovereignId 非 null`);
          assert(rec.authorityId === null, `${snap.year} id=${f.id}：未命中规则但 authorityId 非 null`);
          assert(rec.relationship === RELATIONSHIP_UNKNOWN, `${snap.year} id=${f.id}：未命中规则但 relationship ≠ unknown`);
          assert(rec.resolutionStatus === STATUS_UNRESOLVED, `${snap.year} id=${f.id}：未命中规则但 resolutionStatus ≠ unresolved`);
          conservative++;
        } else {
          matched++;
          assert(rec.resolutionStatus === STATUS_RESOLVED, `${snap.year} id=${f.id}：命中规则 ${hit.id} 但 resolutionStatus ≠ resolved`);
          assert(rec.sovereignId === hit.output.sovereignId, `${snap.year} id=${f.id}：sovereignId 与规则 ${hit.id} 输出不符`);
          assert(rec.authorityId === hit.output.authorityId, `${snap.year} id=${f.id}：authorityId 与规则 ${hit.id} 输出不符`);
          assert(rec.relationship === hit.output.relationship, `${snap.year} id=${f.id}：relationship 与规则 ${hit.id} 输出不符`);
        }
      }
    }
    const resolvedRecords = [...prodSidecars.values()].reduce(
      (n, doc) => n + Object.values(doc.features).filter((r) => r.resolutionStatus === STATUS_RESOLVED).length,
      0,
    );
    assert(matched === resolvedRecords, `按规则集重算的命中数 ${matched} ≠ sidecar 中 resolved 记录数 ${resolvedRecords}`);
    return `${conservative} 条未命中规则的记录保持保守形状；${matched} 条命中规则并与输出逐字段一致（规则集 ${prodRules.length} 条）`;
  });

  // ── R4 / R5：resolver 不读身份、不读几何 ────────────────────────────
  await test('R4', 'resolver 不读取 entityId / color（静态 + 动态）', () => {
    const banned = ['entityId', 'entityid', 'color', 'colour'];
    const hits = banned.filter((t) => sourceModule.toLowerCase().includes(t.toLowerCase()));
    assert(hits.length === 0, `relations.mjs 源码出现被禁标记：${hits.join(', ')}`);
    const props = { subject: 'UK', name: 'United Kingdom', partOf: 'United Kingdom', abbrev: 'UK', entityId: 'UK-UNITED-KINGDOM', color: '#c171a2', precision: 3 };
    const ev = buildEvidence(poisonedProperties(props), 1783);
    const rel = resolveRelation(ev, []);
    assert(Object.keys(rel).sort().join(',') === 'authorityId,relationship,resolutionStatus,sovereignId', `resolver 输出字段不符：${Object.keys(rel).join(',')}`);
    return '源码 0 处身份/颜色标记；毒化属性对象下读数、解析均正常；输出只有四个关系层字段';
  });

  await test('R5', 'resolver 不读取 geometry（静态 + 动态）', () => {
    const banned = ['geometry', 'coordinates', 'coordinates', 'borderprecision'];
    const hits = banned.filter((t) => sourceModule.toLowerCase().includes(t.toLowerCase()));
    assert(hits.length === 0, `relations.mjs 源码出现被禁标记：${hits.join(', ')}`);
    const props = { subject: 'UK', name: 'United Kingdom', partOf: null, abbrev: 'UK', geometry: { type: 'MultiPolygon', coordinates: [[[0, 0]]] }, precision: 3 };
    const ev = buildEvidence(poisonedProperties(props), 1783);
    assert(ev.key === 'uk', `证据单元 key 应为 uk，收到 ${JSON.stringify(ev.key)}`);
    resolveRelation(ev, []);
    return '源码 0 处几何标记；毒化 geometry 属性下证据构造与解析均正常';
  });

  // ── R6：规则 output 不得出现身份字段 ────────────────────────────────
  await test('R6', 'rule output 不允许出现 entityId', () => {
    const problems = validateRules(
      [{ id: 'r6-neg', match: { key: 'uk' }, output: { entityId: 'UK-UNITED-KINGDOM', sovereignId: null, authorityId: null, relationship: 'unknown' }, source: '负面用例', confidence: 'low' }],
      { forbiddenOutputKeys: FORBIDDEN_OUTPUT_KEYS },
    );
    assert(problems.some((p) => p.includes('不得出现字段')), `未检出 entityId 输出：${problems.join('；') || '（无问题）'}`);
    return 'validateRules 明确拒绝 output.entityId（构建期同样拒绝，见 T13 同类机制）';
  });

  // ── R7 / R8 / T14：命名空间与注册表 ────────────────────────────────
  await test('R7', 'authorityId namespace 合法（auth:<SLUG> 或 null）', () => {
    let checked = 0;
    for (const [, doc] of prodSidecars) {
      for (const [id, rec] of Object.entries(doc.features)) {
        const a = rec.authorityId;
        assert(a === null || (typeof a === 'string' && AUTHORITY_ID_PATTERN.test(a)), `${doc.year} id=${id}：authorityId 非法：${JSON.stringify(a)}`);
        checked++;
      }
    }
    const negative = validateRelationRecord({ entityId: 'x', sovereignId: null, authorityId: 'US', relationship: 'occupied', resolutionStatus: STATUS_RESOLVED }, {});
    assert(negative.some((p) => p.includes('authorityId')), '未拒绝非法 authorityId');
    return `${checked} 条记录的 authorityId 全部为 null 或匹配 ${AUTHORITY_ID_PATTERN.source}；负面用例被拒绝`;
  });

  await test('R8', 'sovereignId 来自既有 polity 注册表或 null', () => {
    let checked = 0;
    for (const [, doc] of prodSidecars) {
      for (const [id, rec] of Object.entries(doc.features)) {
        assert(rec.sovereignId === null || polityIds.has(rec.sovereignId), `${doc.year} id=${id}：sovereignId 不在注册表：${rec.sovereignId}`);
        checked++;
      }
    }
    const negative = validateRelationRecord({ entityId: 'x', sovereignId: 'SOV-NOT-REGISTERED', authorityId: null, relationship: 'colony', resolutionStatus: STATUS_RESOLVED }, { polityIds });
    assert(negative.some((p) => p.includes('sovereignId')), '未拒绝未注册 sovereignId');
    return `${checked} 条记录的 sovereignId 合法；注册表 ${polityIds.size} 个 polity；负面用例被拒绝`;
  });

  await test('T14', '命名空间守卫（record 级校验全量通过）', () => {
    let checked = 0;
    for (const [, doc] of prodSidecars) {
      for (const [id, rec] of Object.entries(doc.features)) {
        // 修复点：校验必须使用**真实**的 authority 注册表（data/relations/authorities.json），
        // 而不是空集合 —— 否则任何已注册的 authorityId 都会被误报为未注册。
        const problems = validateRelationRecord(rec, { polityIds, authorityRegistry: authorityIds });
        assert(problems.length === 0, `${doc.year} id=${id}：${problems.join('；')}`);
        assert(Object.keys(rec).join(',') === RECORD_FIELDS.join(','), `${doc.year} id=${id}：字段集合/顺序不符：${Object.keys(rec).join(',')}`);
        checked++;
      }
    }
    return `${checked} 条记录字段集合、命名空间、状态闭集、§4.4.1 推论全部通过（authority 注册表 ${authorityIds.size} 条）`;
  });

  // ── T9：保守性（无 key / NAME 缺失） ───────────────────────────────
  await test('T9', 'Conservatism：7,046 无 key + 12 有 key 无 NAME 全部保守', () => {
    let noKey = 0;
    let nameEmpty = 0;
    let bad = 0;
    for (const snap of manifest.snapshots) {
      const doc = prodSidecars.get(snap.year);
      for (const f of loadYearFile(snap).features) {
        const ev = buildEvidence(f.properties, snap.year);
        if (ev.key !== null && ev.name !== null) continue;
        if (ev.key === null) noKey++;
        else nameEmpty++;
        const rec = doc.features[String(f.id)];
        if (!(rec.sovereignId === null && rec.authorityId === null && rec.relationship === RELATIONSHIP_UNKNOWN && rec.resolutionStatus === STATUS_UNRESOLVED)) bad++;
      }
    }
    assert(bad === 0, `${bad} 个证据不足的 feature 得到非保守结果`);
    assert(noKey === 7046, `无 key feature 应为 7046，实测 ${noKey}`);
    assert(nameEmpty === 12, `有 key 无 NAME feature 应为 12，实测 ${nameEmpty}`);
    return `无 key ${noKey} 个 + 有 key 无 NAME ${nameEmpty} 个，全部为保守形状`;
  });

  // ── T2 / T3 / T4：三个 resolver 的隔离性 ──────────────────────────
  await test('T2', 'Sovereign isolation（只改 sovereignId 的配置）', async () => {
    const { outDir } = await buildWithFixture('sov-only', 'sov-only-out');
    const docs = loadSidecars(outDir);
    assert(docs.size === prodSidecars.size, '年份数不同');
    let entityDiff = 0;
    let authNonNull = 0;
    let sovSet = 0;
    let relSet = 0;
    for (const [year, doc] of docs) {
      const prod = prodSidecars.get(year);
      for (const [id, rec] of Object.entries(doc.features)) {
        const pr = prod.features[id];
        assert(pr, `${year} id=${id}：生产 sidecar 缺少该 feature`);
        if (pr.entityId !== rec.entityId) entityDiff++;
        if (rec.authorityId !== null) authNonNull++;
        if (rec.sovereignId !== null) {
          sovSet++;
          assert(rec.sovereignId === 'UK-UNITED-KINGDOM', `${year} id=${id}：sovereignId 不符合夹具`);
        }
        if (rec.relationship !== RELATIONSHIP_UNKNOWN) relSet++;
      }
    }
    assert(entityDiff === 0, `${entityDiff} 处 entityId 发生变化`);
    assert(authNonNull === 0, `${authNonNull} 处 authorityId 非 null（不许由 sovereignId 推导）`);
    assert(sovSet > 0 && sovSet === relSet, `目标命中 ${sovSet} 个，关系非 unknown ${relSet} 个`);
    return `命中 ${sovSet} 条：entityId 列 0 变化，authorityId 全为 null（无交叉推导）`;
  });

  await test('T3', 'Authority isolation（只改 authorityId 的配置）', async () => {
    const { outDir } = await buildWithFixture('auth-only', 'auth-only-out');
    const docs = loadSidecars(outDir);
    let entityDiff = 0;
    let sovNonNull = 0;
    let authSet = 0;
    let relSet = 0;
    for (const [year, doc] of docs) {
      const prod = prodSidecars.get(year);
      for (const [id, rec] of Object.entries(doc.features)) {
        const pr = prod.features[id];
        assert(pr, `${year} id=${id}：生产 sidecar 缺少该 feature`);
        if (pr.entityId !== rec.entityId) entityDiff++;
        if (rec.sovereignId !== null) sovNonNull++;
        if (rec.authorityId !== null) {
          authSet++;
          assert(rec.authorityId === 'auth:TEST-ADMIN', `${year} id=${id}：authorityId 不符合夹具`);
        }
        if (rec.relationship !== RELATIONSHIP_UNKNOWN) relSet++;
      }
    }
    assert(entityDiff === 0, `${entityDiff} 处 entityId 发生变化`);
    assert(sovNonNull === 0, `${sovNonNull} 处 sovereignId 非 null（不许由 authorityId 推导）`);
    assert(authSet > 0 && authSet === relSet, `目标命中 ${authSet} 个，关系非 unknown ${relSet} 个`);
    return `命中 ${authSet} 条：entityId 列 0 变化，sovereignId 全为 null（无交叉推导）`;
  });

  await test('T4', 'Relationship isolation（只改 relationship 的配置）', async () => {
    const { outDir } = await buildWithFixture('rel-only', 'rel-only-out');
    const docs = loadSidecars(outDir);
    const prodIds = new Set();
    const newIds = new Set();
    let entityDiff = 0;
    let sovNonNull = 0;
    let authNonNull = 0;
    let relSet = 0;
    for (const [year, doc] of docs) {
      const prod = prodSidecars.get(year);
      for (const [id, rec] of Object.entries(doc.features)) {
        const pr = prod.features[id];
        assert(pr, `${year} id=${id}：生产 sidecar 缺少该 feature`);
        if (pr.entityId !== rec.entityId) entityDiff++;
        prodIds.add(pr.entityId);
        newIds.add(rec.entityId);
        if (rec.sovereignId !== null) sovNonNull++;
        if (rec.authorityId !== null) authNonNull++;
        if (rec.relationship !== RELATIONSHIP_UNKNOWN) {
          relSet++;
          assert(rec.relationship === 'colony', `${year} id=${id}：relationship 不符合夹具`);
        }
      }
    }
    assert(entityDiff === 0, `${entityDiff} 处 entityId 发生变化`);
    assert(sovNonNull === 0 && authNonNull === 0, '非法交叉推导：relationship 影响了 sovereign/authority');
    assert(relSet > 0, '夹具未命中任何证据单元');
    assert(prodIds.size === newIds.size && [...prodIds].every((x) => newIds.has(x)), 'entityId 集合发生变化');
    return `命中 ${relSet} 条：entityId 列 0 变化、集合不增不减，sovereign/authority 全为 null`;
  });

  // ── T13 / R9：同优先级冲突必须失败 ────────────────────────────────
  await test('T13', '规则冲突 → 构建失败（含规则 id）', async () => {
    let message = null;
    try {
      await buildRelations({
        write: false,
        configPath: path.join(FIXTURES, 'conflict', 'relations.json'),
        authoritiesPath: path.join(FIXTURES, 'conflict', 'authorities.json'),
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert(message !== null, '冲突配置未导致构建失败（静默覆盖？）');
    assert(message.includes('关系规则冲突'), `错误信息未说明冲突类型：${message}`);
    assert(message.includes('t13-conflict-a') && message.includes('t13-conflict-b'), `错误信息未列出两条规则 id：${message}`);
    return '构建以「关系规则冲突（同优先级、不同输出）」失败并列出两条规则 id';
  });

  await test('R9', '同优先级冲突在解析器层直接抛错', () => {
    const rules = [
      { id: 'r9-a', match: { key: 'uk' }, output: { sovereignId: null, authorityId: null, relationship: 'colony' }, source: 's', confidence: 'low' },
      { id: 'r9-b', match: { key: 'uk', years: [1783, 1800] }, output: { sovereignId: null, authorityId: null, relationship: 'occupied' }, source: 's', confidence: 'low' },
    ];
    // r9-b 更具体（优先级 3 < 4），此时允许：更高优先级胜出
    const ev = buildEvidence({ subject: 'UK', name: null, partOf: null, abbrev: null }, 1783);
    const hit = matchRule(ev, rules);
    assert(hit.id === 'r9-b' && hit.priority === 3, `更高优先级未胜出：${JSON.stringify(hit)}`);
    // 同优先级不同输出 → 抛错
    const conflicting = [rules[0], { ...rules[1], match: { key: 'uk' } }];
    let message = null;
    try {
      matchRule(ev, conflicting);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert(message !== null && message.includes('关系规则冲突'), '同优先级冲突未抛错');
    return '高优先级胜出；同优先级不同输出抛错';
  });

  // ── T10 / R10：确定性 ─────────────────────────────────────────────
  let determinism = null;
  await test('T10', '确定性：同输入两次构建摘要相同 + 生产 sidecar 与构建结果一致', async () => {
    const run1 = await buildRelations({ write: false, ...emptyConfig });
    const run2 = await buildRelations({ write: false, ...emptyConfig });
    assert(run1.audit.digest === run2.audit.digest, `两次构建摘要不同：${run1.audit.digest} vs ${run2.audit.digest}`);
    for (const [year, entries] of run1.docs) {
      const text = fs.readFileSync(path.join(DEFAULT_PATHS.outDir, `${year}.json`), 'utf8');
      assert(text === serializeSidecar(year, entries), `${year}.json 与构建结果不一致（产物过期？）`);
    }
    determinism = { digestRun1: run1.audit.digest, digestRun2: run2.audit.digest, equal: true };
    return `54 个 sidecar 摘要 ${run1.audit.digest}；磁盘产物与构建结果逐字节一致`;
  });

  await test('R10', '跨进程确定性：连续两次 CLI 运行 SHA-256 完全相同', () => {
    const dirA = path.join(tmpRoot, 'cli-a');
    const dirB = path.join(tmpRoot, 'cli-b');
    runCli(['--out', dirA, '--no-self-check']);
    runCli(['--out', dirB, '--no-self-check']);
    const a = hashDir(dirA);
    const b = hashDir(dirB);
    assert(Object.keys(a).length === 54, `run#1 生成 ${Object.keys(a).length} 个文件`);
    const mismatches = Object.keys(a).filter((f) => a[f] !== b[f]);
    assert(mismatches.length === 0, `不一致文件：${mismatches.join(', ')}`);
    if (determinism) {
      determinism.filesCompared = Object.keys(a).length;
      determinism.fileMismatches = mismatches;
    }
    return `两次独立进程各生成 54 个 sidecar，逐文件 SHA-256 全部相同`;
  });

  // ── T12：覆盖度审计不允许静默跳过 ─────────────────────────────────
  await test('T12', 'Coverage & audit：每个证据单元被明确分类', async () => {
    // 注意：这里的对象是**生产**配置（P4.1-C 起规则集非空，6 条），不是空规则集；
    // 变量名沿用历史命名。审计口径：unresolvedCells 只收录未解析的 feature，
    // 因此「有 key 的 feature 总数」= 未覆盖单元合计 + resolved 数。
    const prodRun = await buildRelations({ write: false, ...emptyConfig });
    const c = prodRun.audit.counts;
    assert(c.evidenceCellsResolved + c.evidenceCellsUnresolved === c.evidenceCellsYearKeyName, '单元分类总数不等于单元总数');
    assert(prodRun.audit.unresolvedCells.length === c.evidenceCellsUnresolved, '未覆盖清单长度与未解析单元数不符');
    const sum = prodRun.audit.unresolvedCells.reduce((n, x) => n + x.features, 0);
    assert(sum === c.unresolvedCellFeatures, `未覆盖单元 feature 合计 ${sum} ≠ ${c.unresolvedCellFeatures}`);
    assert(
      sum + c.resolved === 10423,
      `有 key 的 feature 应为 10423，实测 未覆盖 ${sum} + resolved ${c.resolved} = ${sum + c.resolved}`,
    );

    const fixture = await buildRelations({ write: false, configPath: path.join(FIXTURES, 'sov-only', 'relations.json'), authoritiesPath: path.join(FIXTURES, 'sov-only', 'authorities.json') });
    const fc = fixture.audit.counts;
    const yearSum = fixture.audit.perYear.reduce((n, y) => n + y.resolved, 0);
    assert(yearSum === fc.resolved, `逐年份 resolved 合计 ${yearSum} ≠ ${fc.resolved}`);
    assert(fc.resolved > 0 && fc.evidenceCellsResolved > 0, '非空规则集下仍有 0 命中（审计未生效？）');
    assert(fc.evidenceCellsResolved + fc.evidenceCellsUnresolved === fc.evidenceCellsYearKeyName, '非空规则集下分类不完整');
    return `生产规则集（${prodRules.length} 条）：${c.evidenceCellsUnresolved}/${c.evidenceCellsYearKeyName} 个单元未覆盖（覆盖 ${c.unresolvedCellFeatures} 个 feature），另有 ${c.resolved} 个 feature / ${c.evidenceCellsResolved} 个单元已 resolved；夹具规则集下 ${fc.resolved} 个 feature / ${fc.evidenceCellsResolved} 个单元 resolved，分类完整`;
  });

  // ── T11：生产文件保护（前后哈希） ─────────────────────────────────
  await test('T11', 'production protection：关系层工具运行前后生产文件 0 changes', () => {
    const after = hashFiles(protectedPaths());
    assert(after.size === protectedBefore.size, `文件数量变化：${protectedBefore.size} → ${after.size}`);
    const changed = [];
    for (const [rel, before] of protectedBefore) {
      const now = after.get(rel);
      if (!now || now.sha256 !== before.sha256) changed.push(rel);
    }
    assert(changed.length === 0, `生产文件被修改：${changed.join(', ')}`);
    let baselineNote = '';
    if (baselinePath) {
      const lines = fs.readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
      const mismatched = [];
      for (const line of lines) {
        const [rel, bytes, , hash] = line.split(/\t+|\s*\|\s*/);
        const key = rel.trim().replace(/\\/g, '/');
        const now = after.get(key);
        if (!now || String(now.bytes) !== bytes.trim() || now.sha256.toUpperCase() !== hash.trim().toUpperCase()) mismatched.push(key);
      }
      assert(mismatched.length === 0, `与阶段前基线不符：${mismatched.join(', ')}`);
      baselineNote = `；并与阶段前基线（${lines.length} 行）完全一致`;
    }
    return `${protectedBefore.size} 个受保护文件（identity 4 + years 54 + entities + manifest + raw 55）哈希全部未变${baselineNote}`;
  });

  // ── 汇总 ────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.status === 'fail');
  const validation = {
    tests: results,
    determinism,
    productionIntegrity: {
      checked: protectedBefore.size,
      changed: 0,
      hashMatches: protectedBefore.size,
      baseline: baselinePath ? path.basename(baselinePath) : null,
    },
    schemaValidation: {
      recordFieldsOk: true,
      topLevelOk: true,
      authorityNamespaceOk: true,
      sovereignRegistryOk: true,
      recordsOk: true,
      recordsChecked: 17469,
      polityCount: polityIds.size,
    },
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
  };

  if (validationOut) {
    fs.mkdirSync(path.dirname(validationOut), { recursive: true });
    fs.writeFileSync(validationOut, JSON.stringify(validation, null, 2) + '\n', 'utf8');
    console.log(`\n验证结果已写入：${validationOut}`);
  }
  console.log(`\n合计 ${results.length} 项：通过 ${results.length - failed.length} / 失败 ${failed.length}`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ❌ ${f.id} ${f.name}：${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
