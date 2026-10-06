// 历史政权身份（entityId）解析 + 稳定颜色绑定。
//
// 设计文档：DESIGN-P4.1-entity-identity.md
//
// 职责：
//   1. normalizeKey  —— 8 条纯格式归一化规则（只解决字符串写法差异，不做语义合并）
//   2. planEntities  —— 别名表认领 + 按「快照空档」自动切分 → (key, year) → entityId
//   3. assignColors  —— 冻结注册表 → 保色实体直取公式色 → 其余做局部二次探测
//
// 关键不变量：
//   · 同一个 entityId 的所有要素共用同一个 color（AR1）
//   · keys 有交集的两个 entityId 颜色必须不同（AR3）
//   · 自动实体的 run 编号基于「完整年份序列」，不随别名表增删而改变 → 颜色稳定
//   · 保色实体（run 0）永远取 colorForKey(原始拼写)，保证引入本机制后像素级不变

import { colorForKey, UNNAMED_COLOR } from './color.mjs';

/** 没有任何 NAME/SUBJECTO 的要素统一归到这个实体（沿用原来的中性灰） */
export const UNNAMED_ENTITY = 'UNNAMED';

/** 局部色冲突判定的空间粒度（度）。3×3 邻域 = 45° 窗口 */
export const CELL_DEGREES = 15;

/** 二次探测上限（调色板理论 7,200 色，实测最拥挤窗口 517 个实体，64 次足够） */
export const MAX_COLOR_PROBES = 256;

/**
 * 8 条纯格式归一化规则，顺序固定：
 * nfc → trim → lower → ws → dash → quote → period → punct
 *
 * 明确不做的事：语义同义词合并、跨词合并、任何历史判断。
 * 实测本数据集里只有 2 组 key 会因此合并
 * （Chinese Warlords / Chinese warlords、Kwakwaka’wakw / Kwakwaka'wakw）。
 */
export function normalizeKey(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw);
  s = s.normalize('NFC'); // nfc
  s = s.trim(); // trim
  s = s.toLowerCase(); // lower
  s = s.replace(/\s+/g, ' '); // ws：连续空白归一
  s = s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-'); // dash：各种连字符/破折号 → 半角连字符
  s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\uFF07]/g, "'"); // quote：弯撇号 → 直撇号
  s = s.replace(/\u201C|\u201D|\u201E|\u2033|\uFF02/g, '"');
  s = s.replace(/\.{2,}/g, '.'); // period：连续句点归一
  s = s.replace(/\s+([,;:!?])/g, '$1'); // punct：去掉标点前的空格
  return s;
}

/** 空间格子 id（15° 网格） */
export function cellOf(lon, lat) {
  const cx = Math.floor((lon + 180) / CELL_DEGREES);
  const cy = Math.floor((lat + 90) / CELL_DEGREES);
  return `${cx},${cy}`;
}

/** 3×3 邻域格子 id */
export function neighborCells(cell) {
  const [cx, cy] = cell.split(',').map(Number);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) out.push(`${cx + dx},${cy + dy}`);
  }
  return out;
}

/** 年份是否落在任一闭区间内；periods 为空表示全部年份 */
export function inPeriods(year, periods) {
  if (!Array.isArray(periods) || periods.length === 0) return true;
  for (const p of periods) {
    if (!Array.isArray(p) || p.length !== 2) throw new Error(`periods 区间格式非法：${JSON.stringify(p)}`);
    if (year >= p[0] && year <= p[1]) return true;
  }
  return false;
}

/**
 * 校验 aliases.json 的结构（不依赖数据，纯结构校验）。
 */
export function validateAliases(aliases) {
  const problems = [];
  if (!aliases || typeof aliases !== 'object') return ['aliases.json 顶层不是对象'];
  if (aliases.version !== 1) problems.push(`aliases.version 应为 1，实际 ${aliases.version}`);
  const th = aliases.gapSplitThreshold;
  if (!Number.isInteger(th) || th < 1) problems.push(`gapSplitThreshold 应为 ≥1 的整数，实际 ${th}`);

  for (const [id, def] of Object.entries(aliases.entities ?? {})) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(id)) problems.push(`entityId 命名非法：${id}`);
    if (!Array.isArray(def.keys) || def.keys.length === 0) problems.push(`${id}：keys 必须是非空数组`);
    if (def.periods != null) {
      if (!Array.isArray(def.periods) || def.periods.length === 0) problems.push(`${id}：periods 必须是非空数组`);
      else {
        const sorted = [...def.periods].sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < sorted.length; i++) {
          // 允许首尾相接（如 [[1000,1200],[1200,1400]]），只拒绝真正的重叠
          if (sorted[i][0] < sorted[i - 1][1]) problems.push(`${id}：periods 区间重叠 ${JSON.stringify(def.periods)}`);
        }
        for (const p of sorted) {
          if (!Number.isInteger(p[0]) || !Number.isInteger(p[1]) || p[0] > p[1]) {
            problems.push(`${id}：period 非法 ${JSON.stringify(p)}`);
          }
        }
      }
    }
    if (def.color != null && !/^#[0-9a-f]{6}$/.test(def.color)) problems.push(`${id}：color 非法 ${def.color}`);
  }

  for (const [pair, list] of [['succession', aliases.succession]]) {
    if (list == null) continue;
    if (!Array.isArray(list)) { problems.push(`${pair} 必须是数组`); continue; }
    for (const p of list) {
      if (!Array.isArray(p) || p.length !== 2) problems.push(`${pair} 元素必须是 [id1, id2]：${JSON.stringify(p)}`);
      else for (const id of p) if (!aliases.entities?.[id]) problems.push(`${pair} 引用了未定义的 entityId：${id}`);
    }
  }

  if (aliases.overrides != null) {
    const mr = aliases.overrides.mergeRuns;
    if (mr != null && !Array.isArray(mr)) problems.push('overrides.mergeRuns 必须是字符串数组');
  }
  return problems;
}

/**
 * 校验 data/identity/continuity.json 的结构（纯结构校验，不依赖数据）。
 *
 * 语义检查（claim 必须存在、geometryFrom 必须是 claim 的原生年份、目标年当前确实
 * 没有该 key）需要真实数据，分别由 planEntities 与 scripts/verify-data.mjs 负责。
 */
export function validateContinuity(continuity) {
  const problems = [];
  if (!continuity || typeof continuity !== 'object') return ['continuity.json 顶层不是对象'];
  if (continuity.version !== 1) problems.push(`continuity.version 应为 1，实际 ${continuity.version}`);
  const entries = continuity.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    problems.push('continuity.entries 必须是非空数组');
    return problems;
  }
  const seen = new Set();
  entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (!e || typeof e !== 'object') { problems.push(`${at} 不是对象`); return; }
    if (typeof e.key !== 'string' || !e.key.trim()) problems.push(`${at}.key 必须是非空字符串`);
    if (typeof e.claim !== 'string' || e.claim.length === 0 || e.claim !== e.claim.trim()) {
      // 自动实体的 id 形如 `auto:<归一化 key>`（可含空格、非 ASCII），因此这里只做基本形状检查；
      // 「claim 是否真的存在」由 planEntities / verify-data 用真实数据判定。
      problems.push(`${at}.claim 必须是首尾无空白的非空字符串：${JSON.stringify(e.claim)}`);
    }
    if (!Number.isInteger(e.geometryFrom)) problems.push(`${at}.geometryFrom 必须是整数年份，实际 ${e.geometryFrom}`);
    if (!Array.isArray(e.years) || e.years.length === 0) {
      problems.push(`${at}.years 必须是非空数组`);
    } else {
      for (const y of e.years) {
        if (!Number.isInteger(y)) { problems.push(`${at}.years 含非整数年份：${y}`); continue; }
        if (y === e.geometryFrom) problems.push(`${at}.years 含 geometryFrom(${y})：该年本来就有几何，不应声明`);
        const k = `${normalizeKey(e.key)}|${y}`;
        if (seen.has(k)) problems.push(`${at} 重复声明 (key「${e.key}」, year ${y})`);
        seen.add(k);
      }
    }
    if (typeof e.note !== 'string' || !e.note.trim()) problems.push(`${at}.note 必须保留几何来源年份说明（C3）`);
  });
  return problems;
}

/**
 * 校验 data/identity/unnamed-attribution.json 的结构（纯结构校验，不依赖数据）。
 *
 * 用途（D4 同年归并）：个别年份的上游快照同时给出同一个政权的两份几何 —— 一份具名
 * （进身份解析），一份 NAME/SUBJECTO 全空（只能落 UNNAMED 中性灰，且渲染时灰色细轮廓
 * 会盖住有色粗轮廓）。本配置声明「某年源文件的第 N 个要素」归并到同快照已有的同名政权。
 *
 * 语义检查（源要素必须真的无属性、同名政权必须恰好 1 个、目标年确实有该政权）需要真实
 * 数据，分别由 scripts/build-data.mjs 与 scripts/verify-data.mjs（AR12）负责。
 */
export function validateAttribution(attribution) {
  const problems = [];
  if (!attribution || typeof attribution !== 'object') return ['unnamed-attribution.json 顶层不是对象'];
  if (attribution.version !== 1) problems.push(`unnamed-attribution.version 应为 1，实际 ${attribution.version}`);
  const entries = attribution.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    problems.push('unnamed-attribution.entries 必须是非空数组');
    return problems;
  }
  const seenKeyYear = new Set();
  const seenYearIndex = new Set();
  entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (!e || typeof e !== 'object') { problems.push(`${at} 不是对象`); return; }
    if (typeof e.key !== 'string' || !e.key.trim()) problems.push(`${at}.key 必须是非空字符串`);
    if (!Number.isInteger(e.year)) problems.push(`${at}.year 必须是整数年份，实际 ${e.year}`);
    if (!Number.isInteger(e.sourceFeatureIndex) || e.sourceFeatureIndex < 0) {
      problems.push(`${at}.sourceFeatureIndex 必须是非负整数，实际 ${e.sourceFeatureIndex}`);
    }
    if (e.expectVertices !== undefined && (!Number.isInteger(e.expectVertices) || e.expectVertices <= 0)) {
      problems.push(`${at}.expectVertices 若提供必须是正整数，实际 ${e.expectVertices}`);
    }
    if (typeof e.note !== 'string' || !e.note.trim()) problems.push(`${at}.note 必须说明这份重复几何的来源`);
    if (Number.isInteger(e.year)) {
      const kk = `${normalizeKey(e.key)}|${e.year}`;
      if (seenKeyYear.has(kk)) problems.push(`${at} 重复声明 (key「${e.key}」, year ${e.year})`);
      seenKeyYear.add(kk);
      if (Number.isInteger(e.sourceFeatureIndex)) {
        const ki = `${e.year}|${e.sourceFeatureIndex}`;
        if (seenYearIndex.has(ki)) problems.push(`${at} 重复声明 (year ${e.year}, sourceFeatureIndex ${e.sourceFeatureIndex})`);
        seenYearIndex.add(ki);
      }
    }
  });
  return problems;
}

/**
 * 把「出现年份不连续」的 key 按空档切成若干连续段。
 * 切分条件：相邻两次出现之间**缺失的快照个数** ≥ threshold。
 * 1 个缺失 = 数据噪声；≥2 个缺失视为政权断层。
 */
export function splitRuns(sortedYears, indexOfYear, threshold) {
  if (sortedYears.length === 0) return [];
  const runs = [];
  let cur = [sortedYears[0]];
  for (let i = 1; i < sortedYears.length; i++) {
    const missing = indexOfYear.get(sortedYears[i]) - indexOfYear.get(sortedYears[i - 1]) - 1;
    if (missing >= threshold) {
      runs.push(cur);
      cur = [];
    }
    cur.push(sortedYears[i]);
  }
  runs.push(cur);
  return runs;
}

/**
 * 解析 (key, year) → entityId。
 *
 * @param {object} p
 * @param {Map<string, Set<number>>} p.keyYears  归一化 key → 出现过的年份集合
 * @param {Map<string, string>} p.canonical      归一化 key → 代表拼写（用于保住现有颜色）
 * @param {Map<number, number>} p.indexOfYear    快照年份 → 下标
 * @param {object} p.aliases                      aliases.json 内容
 * @param {object} [p.continuity]                 continuity.json 内容（政治 feature 连续性补全，L1/D4）
 * @returns {{entityOfYear: Map<string, Map<number,string>>, entities: Map<string,object>, warnings: string[],
 *            continuity: {applied: object[], skipped: object[]}}}
 */
export function planEntities({ keyYears, canonical, indexOfYear, aliases, continuity = null }) {
  const threshold = aliases.gapSplitThreshold ?? 2;
  const warnings = [];
  const entityOfYear = new Map(); // normKey -> Map<year, entityId>
  const entities = new Map(); // entityId -> meta

  const ensure = (id, init) => {
    if (!entities.has(id)) entities.set(id, { ...init, id, normKeys: new Set(), years: [] });
    return entities.get(id);
  };
  const claim = (nk, year, id) => {
    let m = entityOfYear.get(nk);
    if (!m) { m = new Map(); entityOfYear.set(nk, m); }
    const prev = m.get(year);
    if (prev && prev !== id) {
      throw new Error(`身份冲突：key「${nk}」在 ${year} 年同时被 ${prev} 与 ${id} 认领`);
    }
    m.set(year, id);
  };

  // ---- 1. 别名表认领 ----
  for (const [id, def] of Object.entries(aliases.entities ?? {})) {
    const ent = ensure(id, {
      kind: 'manual',
      label: def.label ?? null,
      labelEn: def.labelEn ?? null,
      hashInput: id,
      periods: def.periods ?? null,
      explicitColor: def.color ?? null,
    });
    for (const rawKey of def.keys) {
      const nk = normalizeKey(rawKey);
      const years = keyYears.get(nk);
      if (!years) {
        warnings.push(`${id}：aliases 声明的 key「${rawKey}」在数据中不存在（已忽略）`);
        continue;
      }
      let hit = 0;
      for (const year of years) {
        if (!inPeriods(year, def.periods)) continue;
        claim(nk, year, id);
        ent.normKeys.add(nk);
        hit++;
      }
      if (hit === 0) warnings.push(`${id}：key「${rawKey}」的年份全部落在 periods 之外（已忽略）`);
    }
  }

  // ---- 2. 自动切分（基于完整年份序列 → run 编号不随别名表增删而变） ----
  const mergeRuns = new Set((aliases.overrides?.mergeRuns ?? []).map((k) => normalizeKey(k)));
  for (const [nk, yearSet] of keyYears) {
    const sorted = [...yearSet].sort((a, b) => a - b);
    const runs = mergeRuns.has(nk) ? [sorted] : splitRuns(sorted, indexOfYear, threshold);
    runs.forEach((run, k) => {
      const raw = canonical.get(nk) ?? nk;
      const id = k === 0 ? `auto:${nk}` : `auto:${nk}#${k}`;
      const ent = ensure(id, {
        kind: 'auto',
        label: null,
        labelEn: null,
        // run 0 用原始拼写 → 与改动前的颜色完全一致；run ≥1 才引入后缀
        hashInput: k === 0 ? raw : `${raw}#${k}`,
        legacy: k === 0,
        periods: null,
        explicitColor: null,
      });
      ent.normKeys.add(nk);
      for (const year of run) {
        if (!entityOfYear.get(nk)?.has(year)) claim(nk, year, id);
      }
    });
  }

  // ---- 2.5 连续性补全（data/identity/continuity.json，L1/D4） ----
  // 上游在同一个身份 run 的邻年画过该疆域，个别快照却完全没有绘制。
  // 这里只把「目标年份」认领给 geometryFrom 年实际认领该 key 的既有实体（必须在自动切分
  // 之后，才能确定 run 编号）：不新增实体、不新增颜色、不改 run 编号；
  // 几何由 scripts/build-data.mjs 复用 geometryFrom 年的要素注入。
  const continuityApplied = [];
  const continuitySkipped = [];
  for (const entry of continuity?.entries ?? []) {
    const nk = normalizeKey(entry.key);
    const target = entities.get(entry.claim);
    if (!target) throw new Error(`continuity：claim「${entry.claim}」不存在（key「${entry.key}」）`);
    const nativeYears = [];
    for (const [year, id] of entityOfYear.get(nk) ?? []) if (id === entry.claim) nativeYears.push(year);
    nativeYears.sort((a, b) => a - b);
    if (nativeYears.length === 0) {
      throw new Error(`continuity：claim「${entry.claim}」在原生数据中从未认领 key「${entry.key}」，几何无来源`);
    }
    if (!nativeYears.includes(entry.geometryFrom)) {
      throw new Error(
        `continuity：key「${entry.key}」的 geometryFrom ${entry.geometryFrom} 不是 claim「${entry.claim}」的原生年份` +
          `（原生年份：${nativeYears.join(', ')}）`,
      );
    }
    target.normKeys.add(nk);
    for (const year of entry.years) {
      const existing = entityOfYear.get(nk)?.get(year);
      if (existing) {
        // 只有「该年确实完全缺失该 key」才需要补全；已有归属时绝不改写
        continuitySkipped.push({ key: entry.key, year, claim: entry.claim, existing });
        continue;
      }
      claim(nk, year, entry.claim);
      continuityApplied.push({ key: entry.key, year, claim: entry.claim, geometryFrom: entry.geometryFrom });
    }
  }

  // ---- 3. 回填每个实体实际覆盖的年份，并丢弃零要素实体 ----
  for (const [nk, m] of entityOfYear) {
    for (const [year, id] of m) entities.get(id).years.push(year);
  }
  for (const [id, ent] of [...entities]) {
    if (ent.years.length === 0) { entities.delete(id); continue; }
    ent.years.sort((a, b) => a - b);
  }
  // 手工实体若与自动实体的年份区间无交集，normKeys 可能为空，补一次
  for (const [nk, m] of entityOfYear) {
    for (const [, id] of m) entities.get(id)?.normKeys.add(nk);
  }

  return { entityOfYear, entities, warnings, continuity: { applied: continuityApplied, skipped: continuitySkipped } };
}

/**
 * 颜色绑定。
 *
 * 优先级（与设计文档 §6 一致）：
 *   1. 冻结注册表里有 → 直接用（永不改变）
 *   2. aliases.json 显式指定 color → 用它
 *   3. 保色实体（auto run 0）→ colorForKey(原始拼写)，保证像素级零回归，不参与探测
 *   4. 其余（手工实体、auto run ≥1）→ 在 45° 窗口内做二次探测，避开已定邻居的颜色
 *
 * @param {object} p
 * @param {Map<string,object>} p.entities
 * @param {Record<string,string>} p.registry
 * @param {(id:string, assigned:Map<string,string>) => Set<string>} p.forbiddenFor
 * @returns {{colors: Map<string,string>, probed: Array<{id:string,salt:number,from:string,to:string}>, unresolved: string[]}}
 */
export function assignColors({ entities, registry, forbiddenFor }) {
  const colors = new Map();
  const probed = [];
  const unresolved = [];

  const order = [...entities.values()].sort(
    (a, b) => a.years[0] - b.years[0] || a.id.localeCompare(b.id),
  );

  // 第 1 轮：先定下所有「不探测」的颜色，这样探测时邻居颜色一定可查
  const pending = [];
  for (const e of order) {
    const frozen = registry[e.id];
    if (frozen) { colors.set(e.id, frozen); continue; }
    if (e.explicitColor) { colors.set(e.id, e.explicitColor); continue; }
    if (e.legacy) { colors.set(e.id, colorForKey(e.hashInput)); continue; }
    pending.push(e);
  }

  // 第 2 轮：对需要探测的实体做局部二次探测
  for (const e of pending) {
    const forbidden = forbiddenFor(e.id, colors);
    const base = colorForKey(e.hashInput);
    let chosen = null;
    for (let salt = 0; salt < MAX_COLOR_PROBES; salt++) {
      const cand = salt === 0 ? base : colorForKey(`${e.hashInput}#${salt}`);
      if (!forbidden.has(cand)) { chosen = cand; if (salt > 0) probed.push({ id: e.id, salt, from: base, to: cand }); break; }
    }
    if (!chosen) { chosen = base; unresolved.push(e.id); }
    colors.set(e.id, chosen);
  }

  return { colors, probed, unresolved };
}

/** 未命名要素的固定颜色（沿用旧行为） */
export const UNNAMED_ENTITY_COLOR = UNNAMED_COLOR;
