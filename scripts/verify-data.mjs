// 校验 public/data/ 下的构建产物是否自洽、是否满足前端假设，以及是否满足 P4.1 身份/配色验收规则。
//
// 用法：node scripts/verify-data.mjs
//
// 基础检查：
//   1. manifest.json 可解析，snapshots 按年份升序、无重复
//   2. 每个快照文件存在、可解析、是 FeatureCollection
//   3. features / vertices 计数与 manifest 一致
//   4. 几何全部为 MultiPolygon，环闭合且 ≥4 点
//   5. 坐标小数位 ≤ coordPrecision，且落在合法经纬度范围内
//   6. 每个 feature 都带 color，precision 为 null 或 0..3
//
// 身份与配色验收规则（DESIGN-P4.1-entity-identity.md §7）：
//   AR1  同一个 entityId 在所有快照里颜色唯一
//   AR2  aliases.json 声明的更替对颜色不同
//   AR3  keys 有交集的两个 entityId 颜色不同
//   AR4  45° 窗口内撞色统计（**信息性指标**，不判失败——保色实体沿用改动前的颜色，
//        其历史撞色是有意保留的，见设计文档 §9.1）
//   AR7  产物颜色与 data/identity/colors.json 冻结注册表完全一致
//   AR8  每个 feature 都有非空 entityId
//   AR9  public/data/entities.json 与实际要素覆盖的实体集合、年份完全对应
//   AR10 地理实体（南极洲）：每个快照都必须有极地要素，且地理实体要素恒为 UNNAMED 中性灰
//        （配置见 data/geo/geographic-entities.json；地理实体不是历史政权）
//   AR11 连续性补全（data/identity/continuity.json，L1/D4）：声明的每个 (key, year) 必须在
//        该年产物里有要素，且必须归属声明的 claim（几何取自 geometryFrom 年，身份沿用源侧 run）
//   AR12 无属性重复几何归并（data/identity/unnamed-attribution.json，D4 同年归并）：声明的
//        源要素必须真的没有 NAME/SUBJECTO、同快照同名政权必须恰好 1 个；归并后该年该 key 的
//        全部要素必须同属一个政权实体（非 UNNAMED），且归并那份几何的顶点数与声明的源要素一致
//        （几何没有被量化丢掉或换错）

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cellOf,
  neighborCells,
  normalizeKey,
  validateContinuity,
  validateAttribution,
  UNNAMED_ENTITY,
} from './lib/identity.mjs';
import { yearToSourceFile } from './lib/snapshots.mjs';
import { UNNAMED_COLOR } from './lib/color.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const REGISTRY_PATH = path.join(ROOT, 'data', 'identity', 'colors.json');
const ALIASES_PATH = path.join(ROOT, 'data', 'identity', 'aliases.json');
const CONTINUITY_PATH = path.join(ROOT, 'data', 'identity', 'continuity.json');
const ATTRIBUTION_PATH = path.join(ROOT, 'data', 'identity', 'unnamed-attribution.json');
const GEO_CONFIG_PATH = path.join(ROOT, 'data', 'geo', 'geographic-entities.json');

const problems = [];
const fail = (msg) => problems.push(msg);

/** 小数位数（用最短往返字符串判断，和 JSON 里的写法一致） */
function decimals(n) {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** 数一个（源文件或产物的）几何有多少个顶点：MultiPolygon / Polygon 都接受，其它返回 null */
function countGeometryVertices(geometry) {
  const polys =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : null;
  if (!Array.isArray(polys)) return null;
  let n = 0;
  for (const poly of polys) {
    if (!Array.isArray(poly)) continue;
    for (const ring of poly) if (Array.isArray(ring)) n += ring.length;
  }
  return n;
}

async function readJson(p, label) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (err) {
    console.error(`无法读取 ${label}（${p}）：${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`无法读取 ${manifestPath}：${err.message}`);
    process.exit(1);
  }

  const { coordPrecision, snapshots, allYears } = manifest;
  if (!Array.isArray(snapshots) || snapshots.length === 0) fail('manifest.snapshots 为空');

  const registryFile = await readJson(REGISTRY_PATH, 'data/identity/colors.json');
  const registry = registryFile.colors ?? {};
  const aliases = await readJson(ALIASES_PATH, 'data/identity/aliases.json');
  const entitiesDoc = await readJson(path.join(OUT_DIR, 'entities.json'), 'public/data/entities.json');
  const entities = entitiesDoc.entities ?? [];

  // AR11 的连续性补全声明（L1/D4）
  const continuityFile = await readJson(CONTINUITY_PATH, 'data/identity/continuity.json');
  const continuityEntries = continuityFile.entries ?? [];
  const continuityProblems = validateContinuity(continuityFile);
  for (const p of continuityProblems) fail(`AR11 配置：${p}`);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const yearSet = new Set(snapshots?.map((s) => s.year) ?? []);
  const continuityTargets = new Map(); // year -> Map<nk, claim>
  for (const e of continuityEntries) {
    const nk = normalizeKey(e.key);
    const claim = entityById.get(e.claim);
    if (!claim) {
      fail(`AR11 配置：key「${e.key}」的 claim「${e.claim}」不在 entities.json 中`);
      continue;
    }
    if (!(claim.years ?? []).includes(e.geometryFrom)) {
      fail(`AR11 配置：claim「${e.claim}」的年份里没有 geometryFrom ${e.geometryFrom}（key「${e.key}」）`);
    }
    for (const y of e.years) {
      if (!yearSet.has(y)) fail(`AR11 配置：key「${e.key}」声明了不存在的快照年份 ${y}`);
      let m = continuityTargets.get(y);
      if (!m) {
        m = new Map();
        continuityTargets.set(y, m);
      }
      if (m.has(nk)) fail(`AR11 配置：${y} 年的 key「${e.key}」被重复声明`);
      m.set(nk, e.claim);
    }
  }

  // AR12 的无属性重复几何归并声明（D4 同年归并）
  const attributionFile = await readJson(ATTRIBUTION_PATH, 'data/identity/unnamed-attribution.json');
  const attributionEntries = attributionFile.entries ?? [];
  for (const p of validateAttribution(attributionFile)) fail(`AR12 配置：${p}`);
  const attributionByYear = new Map(); // year -> entry[]
  const attributionRawVertices = new Map(); // `${year}|${index}` -> 源要素顶点数
  for (const e of attributionEntries) {
    if (!yearSet.has(e.year)) fail(`AR12 配置：key「${e.key}」声明了不存在的快照年份 ${e.year}`);
    let list = attributionByYear.get(e.year);
    if (!list) {
      list = [];
      attributionByYear.set(e.year, list);
    }
    list.push(e);
    // 源文件守卫：目标要素必须真的没有 NAME/SUBJECTO，同快照同名政权必须恰好 1 个
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'raw', 'geojson', yearToSourceFile(e.year)), 'utf8'));
    } catch (err) {
      fail(`AR12 配置：无法读取 ${e.year} 年的上游源文件 — ${err.message}`);
      continue;
    }
    const target = raw.features?.[e.sourceFeatureIndex];
    if (!target) {
      fail(`AR12 配置：${e.year} 年的上游源文件没有第 ${e.sourceFeatureIndex} 个要素（key「${e.key}」）`);
      continue;
    }
    const tp = target.properties ?? {};
    if (tp.NAME || tp.SUBJECTO) {
      fail(
        `AR12 配置：${e.year} 年源要素 ${e.sourceFeatureIndex} 有 NAME/SUBJECTO（「${tp.SUBJECTO || tp.NAME}」），不是无属性重复几何`,
      );
    }
    const nv = countGeometryVertices(target.geometry);
    attributionRawVertices.set(`${e.year}|${e.sourceFeatureIndex}`, nv);
    if (e.expectVertices !== undefined && nv !== e.expectVertices) {
      fail(`AR12 配置：${e.year} 年源要素 ${e.sourceFeatureIndex} 有 ${nv} 个顶点，配置期望 ${e.expectVertices}`);
    }
    const nk = normalizeKey(e.key);
    const siblings = raw.features.filter(
      (f, i) =>
        i !== e.sourceFeatureIndex &&
        normalizeKey((f.properties ?? {}).SUBJECTO || (f.properties ?? {}).NAME || '') === nk,
    );
    if (siblings.length !== 1) {
      fail(`AR12 配置：${e.year} 年的 key「${e.key}」在源文件里匹配到 ${siblings.length} 个原生要素（要求恰好 1 个）`);
    } else if (!siblings[0].properties?.NAME) {
      fail(`AR12 配置：${e.year} 年 key「${e.key}」的原生要素没有 NAME，无法作为归并后的属性来源`);
    }
  }

  // AR10 的地理实体配置（极地判据 + 名称判据，与 scripts/build-data.mjs 同源）
  const geoConfig = await readJson(GEO_CONFIG_PATH, 'data/geo/geographic-entities.json');
  const geoPoleLatitude = geoConfig.poleLatitude ?? -89.9;
  const geoNameMatch = new Set((geoConfig.nameMatch ?? []).map((s) => String(s).trim().toLowerCase()));
  const isGeographicNamed = (p) =>
    [p.name, p.subject, p.partOf, p.abbrev].some((t) => typeof t === 'string' && geoNameMatch.has(t.trim().toLowerCase()));

  console.log(`manifest：${snapshots.length} 个快照，上游共 ${allYears?.length ?? '?'} 个年份`);
  console.log(`坐标精度：${coordPrecision} 位小数`);
  console.log(`实体索引：${entitiesDoc.count ?? '?'} 条 · 颜色注册表：${Object.keys(registry).length} 条\n`);
  console.log('   year  features  vertices  unnamed  entities     MB    bbox');
  console.log('  ' + '-'.repeat(84));

  let sumFeatures = 0;
  let sumVertices = 0;
  let sumBytes = 0;
  let prevYear = -Infinity;
  let geoYears = 0; // AR10：含极地要素的快照数
  let polarTotal = 0; // AR10：极地要素总数
  const continuityHit = new Set(); // AR11：`${year}|${nk}` 已由声明的 claim 画出
  const attributionEntityIds = new Map(); // AR12：`${year}|${nk}` -> Set<entityId>
  const attributionVertices = new Map(); // AR12：`${year}|${nk}` -> Set<顶点数>

  // AR1：entityId → 颜色（全局唯一）
  const entityColor = new Map();
  const entityYears = new Map(); // entityId -> Set<year>
  const entityFeatureCount = new Map();
  // AR4：45° 窗口撞色统计
  let windowCollisionPairs = 0;
  let maxWindowEntities = 0;
  let maxWindowAt = null;
  let maxWindowColors = 0;

  for (const snap of snapshots) {
    const { year, file, features: expFeatures, vertices: expVertices, unnamed, bytes: expBytes, bbox } = snap;

    if (year <= prevYear) fail(`快照年份未严格升序：${prevYear} → ${year}`);
    prevYear = year;

    const full = path.join(OUT_DIR, file);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      fail(`缺少文件：${file}`);
      continue;
    }
    if (stat.size !== expBytes) fail(`${file}：实际 ${stat.size} 字节，manifest 记录 ${expBytes}`);

    let fc;
    try {
      fc = JSON.parse(await fs.readFile(full, 'utf8'));
    } catch (err) {
      fail(`${file}：JSON 解析失败 — ${err.message}`);
      continue;
    }

    if (fc.type !== 'FeatureCollection') fail(`${file}：顶层 type 应为 FeatureCollection，实际 ${fc.type}`);
    if (!Array.isArray(fc.features)) fail(`${file}：features 不是数组`);
    if (fc.features.length !== expFeatures) fail(`${file}：features 实际 ${fc.features.length}，manifest ${expFeatures}`);

    let vertices = 0;
    let unnamedCount = 0;
    let polarFeatures = 0;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    const cellMap = new Map(); // cell -> Set<entityId>

    for (const f of fc.features) {
      const p = f.properties ?? {};
      if (!p.color || !/^#[0-9a-f]{6}$/.test(p.color)) fail(`${file}：feature ${f.id} 的 color 非法（${p.color}）`);
      // 上游 world_1783 有 4 个要素的 BORDERPRECISION 为 0（未标注），因此允许 0..3
      if (p.precision !== null && (!Number.isInteger(p.precision) || p.precision < 0 || p.precision > 3)) {
        fail(`${file}：feature ${f.id} 的 precision 非法（${p.precision}）`);
      }
      if (!p.name) unnamedCount++;

      // AR11：连续性补全的 (key, year) 必须由声明的 claim 画出
      {
        const targets = continuityTargets.get(year);
        if (targets) {
          const nk = normalizeKey(p.subject || p.name || '');
          const want = targets.get(nk);
          if (want !== undefined && p.entityId === want) continuityHit.add(`${year}|${nk}`);
        }
      }

      // AR8
      if (typeof p.entityId !== 'string' || p.entityId.length === 0) {
        fail(`${file}：feature ${f.id} 的 entityId 为空（${JSON.stringify(p.entityId)}）`);
      } else {
        // AR1
        const prev = entityColor.get(p.entityId);
        if (prev === undefined) entityColor.set(p.entityId, p.color);
        else if (prev !== p.color) fail(`AR1 失败：entityId「${p.entityId}」出现两种颜色 ${prev} / ${p.color}（${file}）`);
        let ys = entityYears.get(p.entityId);
        if (!ys) {
          ys = new Set();
          entityYears.set(p.entityId, ys);
        }
        ys.add(year);
        entityFeatureCount.set(p.entityId, (entityFeatureCount.get(p.entityId) ?? 0) + 1);
      }

      const g = f.geometry;
      if (g?.type !== 'MultiPolygon') {
        fail(`${file}：feature ${f.id} 的几何类型为 ${g?.type}`);
        continue;
      }
      if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) {
        fail(`${file}：feature ${f.id} 的 coordinates 为空`);
        continue;
      }

      const fb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of g.coordinates) {
        if (!Array.isArray(poly) || poly.length === 0) {
          fail(`${file}：feature ${f.id} 有空多边形`);
          continue;
        }
        for (const ring of poly) {
          if (!Array.isArray(ring) || ring.length < 4) {
            fail(`${file}：feature ${f.id} 的环点数 ${ring?.length} < 4`);
            continue;
          }
          const a = ring[0];
          const z = ring[ring.length - 1];
          if (a[0] !== z[0] || a[1] !== z[1]) fail(`${file}：feature ${f.id} 的环未闭合`);
          vertices += ring.length;
          for (const [x, y] of ring) {
            if (decimals(x) > coordPrecision || decimals(y) > coordPrecision) {
              fail(`${file}：坐标精度超限 [${x}, ${y}]`);
            }
            if (x < -180 || x > 180 || y < -90 || y > 90) fail(`${file}：坐标越界 [${x}, ${y}]`);
            if (x < b[0]) b[0] = x;
            if (y < b[1]) b[1] = y;
            if (x > b[2]) b[2] = x;
            if (y > b[3]) b[3] = y;
            if (x < fb[0]) fb[0] = x;
            if (y < fb[1]) fb[1] = y;
            if (x > fb[2]) fb[2] = x;
            if (y > fb[3]) fb[3] = y;
          }
        }
      }

      if (fb[0] !== Infinity && typeof p.entityId === 'string' && p.entityId) {
        const cell = cellOf((fb[0] + fb[2]) / 2, (fb[1] + fb[3]) / 2);
        let cs = cellMap.get(cell);
        if (!cs) {
          cs = new Set();
          cellMap.set(cell, cs);
        }
        cs.add(p.entityId);
      }

      // ---- AR10：地理实体（南极洲）----
      if (fb[0] !== Infinity) {
        const isPolar = fb[1] <= geoPoleLatitude;
        const isNamed = isGeographicNamed(p);
        if (isPolar) {
          polarFeatures++;
          polarTotal++;
        }
        if ((isPolar || isNamed) && (p.entityId !== UNNAMED_ENTITY || p.color !== UNNAMED_COLOR)) {
          fail(
            `AR10 失败：${file} 的地理实体要素（feature ${f.id}，最南纬度 ${fb[1]}）应为 ${UNNAMED_ENTITY} / ${UNNAMED_COLOR}，` +
              `实际 ${p.entityId} / ${p.color}`,
          );
        }
      }

      // ---- AR12：无属性重复几何归并（D4 同年归并） ----
      // 该年该 key 的要素必须全部落在同一个政权实体上（不等于 UNNAMED），
      // 并且其中必须有顶点数等于声明值的那份几何（几何没有被量化丢掉或换错）。
      {
        const list = attributionByYear.get(year);
        if (list && p.name) {
          const nk = normalizeKey(p.subject || p.name || '');
          for (const e of list) {
            if (normalizeKey(e.key) !== nk) continue;
            const key = `${year}|${nk}`;
            let ids = attributionEntityIds.get(key);
            if (!ids) {
              ids = new Set();
              attributionEntityIds.set(key, ids);
            }
            ids.add(p.entityId);
            const nv = countGeometryVertices(g);
            if (nv !== null) {
              let vs = attributionVertices.get(key);
              if (!vs) {
                vs = new Set();
                attributionVertices.set(key, vs);
              }
              vs.add(nv);
            }
          }
        }
      }
    }

    // ---- AR4：本年份每个格子的 45° 窗口内，同色实体对数 ----
    for (const cell of cellMap.keys()) {
      const win = new Set();
      for (const nc of neighborCells(cell)) {
        const s = cellMap.get(nc);
        if (s) for (const id of s) win.add(id);
      }
      if (win.size > maxWindowEntities) {
        maxWindowEntities = win.size;
        maxWindowAt = { year, cell };
        const byColor = new Map();
        for (const id of win) {
          const c = entityColor.get(id) ?? '?';
          byColor.set(c, (byColor.get(c) ?? 0) + 1);
        }
        maxWindowColors = byColor.size;
      }
      const byColor = new Map();
      for (const id of win) {
        const c = entityColor.get(id) ?? '?';
        byColor.set(c, (byColor.get(c) ?? 0) + 1);
      }
      for (const n of byColor.values()) if (n > 1) windowCollisionPairs += (n * (n - 1)) / 2;
    }

    if (vertices !== expVertices) fail(`${file}：vertices 实际 ${vertices}，manifest ${expVertices}`);
    if (unnamedCount !== unnamed) fail(`${file}：unnamed 实际 ${unnamedCount}，manifest ${unnamed}`);
    if (Array.isArray(bbox) && bbox.length === 4 && b[0] !== Infinity) {
      for (let i = 0; i < 4; i++) {
        if (Math.abs(b[i] - bbox[i]) > 1e-4) fail(`${file}：bbox[${i}] 实际 ${b[i]}，manifest ${bbox[i]}`);
      }
    }

    // AR10：地理实体必须在场（缺失年份由构建流程 R-A 自动补全，这里做硬门）
    if (polarFeatures === 0) fail(`AR10 失败：${file} 没有任何极地要素（最南纬度 > ${geoPoleLatitude}）`);
    else geoYears++;

    sumFeatures += expFeatures;
    sumVertices += vertices;
    sumBytes += stat.size;

    console.log(
      `  ${String(year).padStart(6)}  ${String(expFeatures).padStart(8)}  ${String(vertices).padStart(8)}  ` +
        `${String(unnamed).padStart(7)}  ${String(cellMap.size ? new Set([...cellMap.values()].flatMap((s) => [...s])).size : 0).padStart(8)}  ` +
        `${(stat.size / 1048576).toFixed(2).padStart(6)}  [${b.map((v) => v.toFixed(1)).join(', ')}]`,
    );
  }

  // ---- AR11：连续性补全在场 + 归属（L1/D4） ----
  let continuityChecked = 0;
  for (const [year, targets] of continuityTargets) {
    for (const [nk, claim] of targets) {
      continuityChecked++;
      if (!continuityHit.has(`${year}|${nk}`)) {
        fail(`AR11 失败：${year} 年的 key「${nk}」应由连续性补全归属「${claim}」，但产物中没有该实体名下的要素`);
      }
    }
  }

  // ---- AR12：无属性重复几何归并在场 + 归属（D4 同年归并） ----
  let attributionChecked = 0;
  for (const [year, list] of attributionByYear) {
    for (const e of list) {
      attributionChecked++;
      const nk = normalizeKey(e.key);
      const key = `${year}|${nk}`;
      const ids = attributionEntityIds.get(key);
      if (!ids || ids.size === 0) {
        fail(`AR12 失败：${year} 年的 key「${e.key}」在产物里没有任何具名要素（源要素 ${e.sourceFeatureIndex} 未归并）`);
        continue;
      }
      if (ids.size > 1) {
        fail(`AR12 失败：${year} 年的 key「${e.key}」出现 ${ids.size} 种政权实体 [${[...ids].join(', ')}]（归并后必须唯一）`);
      }
      if (ids.has(UNNAMED_ENTITY)) {
        fail(
          `AR12 失败：${year} 年的无属性重复几何（源要素 ${e.sourceFeatureIndex}）仍归在 ${UNNAMED_ENTITY}（未接回 key「${e.key}」）`,
        );
      }
      if (e.expectVertices !== undefined) {
        const vs = attributionVertices.get(key) ?? new Set();
        if (!vs.has(e.expectVertices)) {
          fail(
            `AR12 失败：${year} 年的 key「${e.key}」缺少 ${e.expectVertices} 顶点的归并几何（产物中有 ${[...vs].join(' / ') || '无'}）`,
          );
        }
      }
      const srcNv = attributionRawVertices.get(`${year}|${e.sourceFeatureIndex}`);
      if (srcNv !== undefined && e.expectVertices !== undefined && srcNv !== e.expectVertices) {
        fail(`AR12 失败：${year} 年源要素 ${e.sourceFeatureIndex} 顶点数 ${srcNv} ≠ 声明 ${e.expectVertices}`);
      }
    }
  }

  // 一致性：manifest.allYears 应包含所有快照年份
  if (Array.isArray(allYears)) {
    for (const s of snapshots) {
      if (!allYears.includes(s.year)) fail(`manifest.allYears 缺少年份 ${s.year}`);
    }
  }

  // ---- AR2：更替对必须异色 ----
  for (const [a, b] of aliases.succession ?? []) {
    const ca = entityColor.get(a);
    const cb = entityColor.get(b);
    if (!ca || !cb) {
      fail(`AR2 警告：更替对 ${a} / ${b} 中有一方在产物中不存在（${ca ?? '缺失'} / ${cb ?? '缺失'}）`);
      continue;
    }
    if (ca === cb) fail(`AR2 失败：更替对 ${a} 与 ${b} 同色 ${ca}`);
  }

  // ---- AR3：keys 有交集的实体必须异色 ----
  const keyOwners = new Map();
  for (const e of entities) {
    for (const k of e.keys ?? []) {
      let owners = keyOwners.get(k);
      if (!owners) {
        owners = [];
        keyOwners.set(k, owners);
      }
      owners.push(e);
    }
  }
  let sharedKeyGroups = 0;
  for (const [k, owners] of keyOwners) {
    if (owners.length < 2) continue;
    sharedKeyGroups++;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        if (owners[i].color === owners[j].color) {
          fail(`AR3 失败：key「${k}」的 ${owners[i].id} 与 ${owners[j].id} 同色 ${owners[i].color}`);
        }
      }
    }
  }

  // ---- AR7：产物颜色 == 冻结注册表 ----
  // UNNAMED 是「没有任何 NAME/SUBJECTO」的要素集合的合成实体（沿用旧的中性灰），
  // 不是历史政权，因此不进注册表、也不进 entities.json；单独校验它恒为 UNNAMED_COLOR。
  let registryMismatch = 0;
  for (const [id, color] of entityColor) {
    if (id === UNNAMED_ENTITY) {
      if (color !== UNNAMED_COLOR) fail(`AR8 失败：${UNNAMED_ENTITY} 的颜色应为 ${UNNAMED_COLOR}，实际 ${color}`);
      continue;
    }
    const reg = registry[id];
    if (reg === undefined) {
      fail(`AR7 失败：entityId「${id}」不在 data/identity/colors.json 注册表中`);
      registryMismatch++;
    } else if (reg !== color) {
      fail(`AR7 失败：entityId「${id}」产物颜色 ${color} ≠ 注册表 ${reg}`);
      registryMismatch++;
    }
  }

  // ---- AR9：entities.json 与实际一致 ----
  if (entitiesDoc.count !== entities.length) fail(`entities.json count=${entitiesDoc.count} 与数组长度 ${entities.length} 不一致`);
  if (manifest.entityCount !== entities.length) fail(`manifest.entityCount=${manifest.entityCount} 与 entities.json 长度 ${entities.length} 不一致`);
  const docIds = new Set(entities.map((e) => e.id));
  for (const id of entityColor.keys()) {
    if (id === UNNAMED_ENTITY) continue;
    if (!docIds.has(id)) fail(`AR9 失败：产物里的 entityId「${id}」不在 entities.json 中`);
  }
  for (const e of entities) {
    if (!entityColor.has(e.id)) {
      fail(`AR9 失败：entities.json 里的「${e.id}」在产物中没有任何要素`);
      continue;
    }
    if (e.color !== entityColor.get(e.id)) fail(`AR9 失败：「${e.id}」entities.json 颜色 ${e.color} ≠ 产物 ${entityColor.get(e.id)}`);
    const actual = [...entityYears.get(e.id)].sort((a, b) => a - b);
    const declared = [...(e.years ?? [])].sort((a, b) => a - b);
    if (actual.length !== declared.length || actual.some((v, i) => v !== declared[i])) {
      fail(`AR9 失败：「${e.id}」entities.json 年份 [${declared}] ≠ 产物 [${actual}]`);
    }
  }

  // ---- 汇总 ----
  const colorBuckets = new Map();
  for (const [id, c] of entityColor) colorBuckets.set(c, (colorBuckets.get(c) ?? 0) + 1);
  let colliding = 0;
  for (const n of colorBuckets.values()) if (n > 1) colliding += n;

  console.log('');
  console.log('身份与配色：');
  console.log(`  实体总数            ${entityColor.size}（entities.json ${entities.length}）`);
  console.log(`  不同颜色            ${colorBuckets.size}`);
  console.log(`  全局撞色实体        ${colliding} 个（沿用改动前颜色，AR4 有意保留）`);
  console.log(`  keys 有交集的组     ${sharedKeyGroups} 组（组内已强制异色，AR3）`);
  console.log(`  注册表命中          ${entityColor.size - registryMismatch} / ${entityColor.size}（AR7）`);
  console.log(`  AR4 45° 窗口       最拥挤窗口 ${maxWindowEntities} 个实体（${maxWindowAt ? `${maxWindowAt.year} 年格 ${maxWindowAt.cell}` : '—'}）· 该窗口不同颜色 ${maxWindowColors}`);
  console.log(`  AR4 窗口内同色对数 ${windowCollisionPairs}（按格子累计，含跨格重复计数，信息性指标）`);
  console.log(
    `  AR10 地理实体      南极洲几何 ${geoYears} / ${snapshots.length} 个快照 · 极地要素合计 ${polarTotal}（全部 ${UNNAMED_ENTITY} ${UNNAMED_COLOR}）`,
  );
  console.log(
    `  AR11 连续性补全    ${continuityChecked} 个 (key, year) 在场并归属声明实体 · 配置 ${continuityEntries.length} 个条目 · 命中 ${continuityHit.size}`,
  );
  console.log(
    `  AR12 重复几何归并  ${attributionChecked} 个 (key, year) 接回同快照原生政权 · 配置 ${attributionEntries.length} 个条目`,
  );

  console.log('');
  if (problems.length > 0) {
    console.error(`✗ 校验失败，共 ${problems.length} 个问题：`);
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  ... 其余 ${problems.length - 40} 条省略`);
    process.exit(1);
  }

  console.log(`✓ 全部通过：${snapshots.length} 个快照 / ${sumFeatures} features / ${sumVertices} 顶点 / ${(sumBytes / 1048576).toFixed(2)} MB / ${entityColor.size} 个历史政权实体`);
}

main().catch((err) => {
  console.error('\n[verify-data] 失败：');
  console.error(err.stack || err.message);
  process.exit(1);
});
