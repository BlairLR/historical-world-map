// 把 data/raw/ 下的上游 GeoJSON 转成前端可直接消费的精简格式，输出到 public/data/
//
// 用法：
//   node scripts/build-data.mjs                        # 转换 data/raw/geojson 下全部文件（推荐：必须全量）
//   node scripts/build-data.mjs --years 2010,1492,-5000 --allow-subset   # 仅调试用，见 --years 护栏
//
// 处理内容：
//   1. 属性瘦身 —— 只保留 name / abbrev / subject / partOf / precision
//   2. 坐标量化到 5 位小数（≈1.1 m 精度，肉眼不可见）
//   3. 身份解析 —— 注入 entityId（历史政权身份，详见 DESIGN-P4.1-entity-identity.md）
//   4. 颜色绑定 —— 颜色跟着 entityId 走，跨年份稳定；保色实体像素级零回归
//   5. 丢弃量化后退化的环/多边形
//   6. 生成 data/identity/colors.json（冻结颜色注册表）
//   7. 生成 public/data/entities.json（实体索引）与 manifest.json
//   8. 地理实体（配置驱动：data/geo/geographic-entities.json）
//      R-A 存在性补全：某年若没有任何极地要素（要素自身最南纬度 ≤ poleLatitude），
//          就用配置声明的资产几何补一个要素 —— 缺失年份与未来新增年份都自动覆盖。
//      R-B 身份归一：极地要素、或名称精确等于 antarctica 的要素，强制归入 UNNAMED 中性灰，
//          不参与历史政权身份解析与配色演化（南极洲是地理事实，不是历史政权）。
//   9. 政治 feature 连续性补全（data/identity/continuity.json）：某年完全没有某个 key 时，
//      用声明的 geometryFrom 年份的几何补一个要素，身份与颜色仍走当年数据（无前端补丁）。
//  10. 无属性重复几何归并（data/identity/unnamed-attribution.json）：上游个别年份同时给出
//      同一政权的具名几何与 NAME/SUBJECTO 全空的几何（后者渲染成灰色轮廓盖住前者）。
//      配置声明「某年源文件第 N 个要素」归并到同快照已有的同名政权：属性取原生要素、
//      几何保留空属性那份，不新增/删除要素，不改变实体年份集合与颜色。
//
// 两遍扫描：
//   第 1 遍只读属性 + 几何包围盒，建立「归一化 key → 出现年份」「(年, 15° 格子) → key」
//   第 2 遍才量化几何、写文件。
// 第 1 遍**总是扫描全部上游文件**（不受 --years 影响），否则空档切分的 run 编号会在子集构建时漂移。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yearToSourceFile, yearToOutputName, parseYearsArg } from './lib/snapshots.mjs';
import { colorForKey, UNNAMED_COLOR } from './lib/color.mjs';
import {
  UNNAMED_ENTITY,
  normalizeKey,
  cellOf,
  neighborCells,
  validateAliases,
  validateContinuity,
  validateAttribution,
  planEntities,
  assignColors,
  splitRuns,
} from './lib/identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const GEOJSON_DIR = path.join(RAW_DIR, 'geojson');
const IDENTITY_DIR = path.join(ROOT, 'data', 'identity');
const ALIASES_PATH = path.join(IDENTITY_DIR, 'aliases.json');
const CONTINUITY_PATH = path.join(IDENTITY_DIR, 'continuity.json');
const ATTRIBUTION_PATH = path.join(IDENTITY_DIR, 'unnamed-attribution.json');
const REGISTRY_PATH = path.join(IDENTITY_DIR, 'colors.json');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const OUT_YEARS_DIR = path.join(OUT_DIR, 'years');
const GEO_DIR = path.join(ROOT, 'data', 'geo');
const GEO_CONFIG_PATH = path.join(GEO_DIR, 'geographic-entities.json');

const COORD_PRECISION = 5;
const Q = 10 ** COORD_PRECISION;

const round = (n) => Math.round(n * Q) / Q;

/** 量化一个环，并去掉相邻重复点 */
function quantizeRing(ring) {
  const out = [];
  let prevX = null;
  let prevY = null;
  for (const p of ring) {
    const x = round(p[0]);
    const y = round(p[1]);
    if (x === prevX && y === prevY) continue;
    out.push([x === 0 ? 0 : x, y === 0 ? 0 : y]); // 归一化 -0
    prevX = x;
    prevY = y;
  }
  // 环必须闭合且至少 4 个点
  if (out.length < 4) return null;
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out.length >= 4 ? out : null;
}

function countVertices(coords) {
  let n = 0;
  for (const poly of coords) for (const ring of poly) n += ring.length;
  return n;
}

/** 几何包围盒（不量化，仅用于定位 15° 格子） */
function geometryBBox(geom) {
  const polys = geom?.type === 'MultiPolygon' ? geom.coordinates : geom?.type === 'Polygon' ? [geom.coordinates] : null;
  if (!polys) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const p of ring) {
        const x = p[0];
        const y = p[1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

async function readJsonIfExists(p) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * 内容相同就不写盘（D6）：没有任何实质变化的重复构建不再刷新 mtime，
 * 这样「保护文件是否被动过」的比对里只剩真正变化的文件。
 */
async function writeIfChanged(absPath, text) {
  try {
    if ((await fs.readFile(absPath, 'utf8')) === text) return false;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await fs.writeFile(absPath, text, 'utf8');
  return true;
}

function main() {
  return (async () => {
    const yearsArg = parseYearsArg(process.argv.slice(2));

    // --years 护栏（D7）：子集构建会让 manifest.snapshots / entities.json 静默变成子集，
    // 而 verify-data 只做「allYears ⊇ 快照年份」的单向断言，抓不住这种损坏。
    if (yearsArg && !process.argv.slice(2).includes('--allow-subset')) {
      throw new Error(
        '--years 只用于调试：它会写出不完整的 manifest.snapshots / entities.json（verify-data 抓不住）。\n' +
          '      确实需要子集构建请显式加 --allow-subset，构建后必须再跑一次完整构建：node scripts/build-data.mjs',
      );
    }

    await fs.mkdir(OUT_YEARS_DIR, { recursive: true });
    await fs.mkdir(IDENTITY_DIR, { recursive: true });

    // 权威年份序列来自 index.json
    const index = JSON.parse(await fs.readFile(path.join(RAW_DIR, 'index.json'), 'utf8'));
    const allYears = index.years.map((y) => y.year);
    const indexOfYear = new Map(allYears.map((y, i) => [y, i]));

    // 决定要「写出」哪些年份
    let years;
    if (yearsArg) {
      const unknown = yearsArg.filter((y) => !allYears.includes(y));
      if (unknown.length > 0) throw new Error(`index.json 中不存在这些年份：${unknown.join(', ')}`);
      years = allYears.filter((y) => yearsArg.includes(y)); // 保持时间顺序
    } else {
      const files = new Set(await fs.readdir(GEOJSON_DIR));
      years = allYears.filter((y) => files.has(yearToSourceFile(y)));
      if (years.length === 0) throw new Error(`data/raw/geojson 下没有可用的 GeoJSON，请先运行 npm run data:fetch`);
    }

    // 第 1 遍永远覆盖上游全部可用文件（与 --years 无关，否则 run 编号会漂移）
    const available = new Set(await fs.readdir(GEOJSON_DIR));
    const presentYears = allYears.filter((y) => available.has(yearToSourceFile(y)));

    console.log(`写出 ${years.length} 个年份（坐标量化到 ${COORD_PRECISION} 位小数）`);
    console.log(`第 1 遍扫描 ${presentYears.length} 个上游文件以解析历史政权身份...\n`);

    // ---------- 第 1 遍：属性 + 格子 ----------
    const keyYears = new Map(); // 归一化 key -> Set<year>
    const spellings = new Map(); // 归一化 key -> Map<原始拼写, {count, firstYear}>
    const yearCellKeys = new Map(); // year -> Map<cell, Set<归一化 key>>
    let scannedFeatures = 0;
    let noKeyFeatures = 0;

    for (const year of presentYears) {
      const raw = JSON.parse(await fs.readFile(path.join(GEOJSON_DIR, yearToSourceFile(year)), 'utf8'));
      const cellMap = new Map();
      for (const f of raw.features) {
        scannedFeatures++;
        const p = f.properties ?? {};
        const rawKey = p.SUBJECTO || p.NAME || null;
        if (!rawKey || !String(rawKey).trim()) {
          noKeyFeatures++;
          continue;
        }
        const key = String(rawKey);
        const nk = normalizeKey(key);
        if (!nk) {
          noKeyFeatures++;
          continue;
        }
        let ys = keyYears.get(nk);
        if (!ys) {
          ys = new Set();
          keyYears.set(nk, ys);
        }
        ys.add(year);
        let sp = spellings.get(nk);
        if (!sp) {
          sp = new Map();
          spellings.set(nk, sp);
        }
        const cur = sp.get(key);
        if (cur) cur.count++;
        else sp.set(key, { count: 1, firstYear: year });

        const bb = geometryBBox(f.geometry);
        if (bb) {
          const cell = cellOf((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2);
          let cs = cellMap.get(cell);
          if (!cs) {
            cs = new Set();
            cellMap.set(cell, cs);
          }
          cs.add(nk);
        }
      }
      yearCellKeys.set(year, cellMap);
    }

    // 每个归一化 key 选一个「代表拼写」——出现次数最多；并列取最早出现；再并列取字典序。
    // 保色实体用它喂哈希，所以只要该 key 只有一种写法，颜色就与改动前完全一致。
    const canonical = new Map();
    for (const [nk, sp] of spellings) {
      const best = [...sp.entries()].sort(
        (a, b) => b[1].count - a[1].count || a[1].firstYear - b[1].firstYear || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
      )[0];
      canonical.set(nk, best[0]);
    }

    // ---------- 身份解析 ----------
    const aliases = (await readJsonIfExists(ALIASES_PATH)) ?? { version: 1, gapSplitThreshold: 2, entities: {} };
    const aliasProblems = validateAliases(aliases);
    if (aliasProblems.length > 0) {
      console.error('aliases.json 校验失败：');
      for (const p of aliasProblems) console.error(`  - ${p}`);
      throw new Error(`data/identity/aliases.json 有 ${aliasProblems.length} 个结构问题`);
    }

    // ---------- 政治 feature 连续性补全（L1/D4：data/identity/continuity.json） ----------
    // 只声明「哪些年份由哪个既有实体认领 + 几何来自哪一年」，不新增身份/颜色。
    const continuity = await readJsonIfExists(CONTINUITY_PATH);
    if (continuity) {
      const continuityProblems = validateContinuity(continuity);
      if (continuityProblems.length > 0) {
        console.error('continuity.json 校验失败：');
        for (const p of continuityProblems) console.error(`  - ${p}`);
        throw new Error(`data/identity/continuity.json 有 ${continuityProblems.length} 个结构问题`);
      }
    }

    // ---------- 无属性重复几何归并（D4 同年归并：data/identity/unnamed-attribution.json） ----------
    // 上游个别年份同时给出同一政权的两份几何：一份具名、一份 NAME/SUBJECTO 全空。
    // 空属性那份只能落 UNNAMED 中性灰，且排在有色要素之后 → 灰色细轮廓盖住有色粗轮廓。
    // 这里声明「某年源文件的第 N 个要素」归并到同快照已有的同名政权：属性取原生要素，
    // 几何保留空属性那份（更细）。不新增/删除要素，不改变实体年份集合与颜色。
    const attribution = await readJsonIfExists(ATTRIBUTION_PATH);
    if (attribution) {
      const attributionProblems = validateAttribution(attribution);
      if (attributionProblems.length > 0) {
        console.error('unnamed-attribution.json 校验失败：');
        for (const p of attributionProblems) console.error(`  - ${p}`);
        throw new Error(`data/identity/unnamed-attribution.json 有 ${attributionProblems.length} 个结构问题`);
      }
      for (const entry of attribution.entries) {
        if (!indexOfYear.has(entry.year)) {
          throw new Error(`unnamed-attribution：配置声明了不存在的快照年份 ${entry.year}（key「${entry.key}」）`);
        }
      }
    }
    const attributionByYear = new Map(); // year -> entry[]
    for (const entry of attribution?.entries ?? []) {
      let list = attributionByYear.get(entry.year);
      if (!list) {
        list = [];
        attributionByYear.set(entry.year, list);
      }
      list.push(entry);
    }

    const {
      entityOfYear,
      entities,
      warnings,
      continuity: continuityPlan,
    } = planEntities({
      keyYears,
      canonical,
      indexOfYear,
      aliases,
      continuity,
    });
    for (const w of warnings) console.warn(`  [警告] ${w}`);
    if (continuityPlan.skipped.length > 0) {
      // 声明里说「该年完全没有这个 key」，但该年已经有归属 —— 配置过期，或上游已经修好
      for (const s of continuityPlan.skipped) {
        console.error(`  [错误] continuity：key「${s.key}」在 ${s.year} 年已有归属 ${s.existing}，声明与数据不符`);
      }
      throw new Error(
        `data/identity/continuity.json 有 ${continuityPlan.skipped.length} 个条目与当前数据不符（已有几何的年份不应声明，请修正配置）`,
      );
    }
    if (continuityPlan.applied.length > 0) {
      const continuityKeys = new Set(continuityPlan.applied.map((a) => a.key));
      console.log(
        `连续性补全：${continuityKeys.size} 个 key · ${continuityPlan.applied.length} 个目标年份` +
          `（几何取各自 geometryFrom 年，身份沿用源侧 run）\n`,
      );
    }

    // 被「空档」切成多个自动实体的 key 数（即阈值切分真正生效的范围）
    const mergeRunKeys = new Set((aliases.overrides?.mergeRuns ?? []).map((k) => normalizeKey(k)));
    let splitKeys = 0;
    for (const [nk, ys] of keyYears) {
      if (mergeRunKeys.has(nk)) continue;
      const runs = splitRuns([...ys].sort((a, b) => a - b), indexOfYear, aliases.gapSplitThreshold ?? 2);
      if (runs.length > 1) splitKeys++;
    }
    console.log(
      `第 1 遍完成：扫描 ${scannedFeatures} 个要素（其中 ${noKeyFeatures} 个没有可用 key）· ` +
        `${keyYears.size} 个归一化 key · ${splitKeys} 个 key 因空档被切分\n`,
    );

    // 实体 → 它占据过的 (year, cell)
    const entityPlaces = new Map();
    for (const [year, cellMap] of yearCellKeys) {
      for (const [cell, keys] of cellMap) {
        for (const nk of keys) {
          const id = entityOfYear.get(nk)?.get(year);
          if (!id) continue;
          let s = entityPlaces.get(id);
          if (!s) {
            s = new Set();
            entityPlaces.set(id, s);
          }
          s.add(`${year}|${cell}`);
        }
      }
    }

    const neighborCache = new Map();
    function neighborEntities(id) {
      let cached = neighborCache.get(id);
      if (cached) return cached;
      const out = new Set();
      for (const place of entityPlaces.get(id) ?? []) {
        const i = place.indexOf('|');
        const year = Number(place.slice(0, i));
        const cell = place.slice(i + 1);
        const cellMap = yearCellKeys.get(year);
        if (!cellMap) continue;
        for (const nc of neighborCells(cell)) {
          const keys = cellMap.get(nc);
          if (!keys) continue;
          for (const nk of keys) {
            const nid = entityOfYear.get(nk)?.get(year);
            if (nid && nid !== id) out.add(nid);
          }
        }
      }
      neighborCache.set(id, out);
      return out;
    }

    const registryFile = (await readJsonIfExists(REGISTRY_PATH)) ?? { version: 1, colors: {} };
    const registry = registryFile.colors ?? {};
    const frozenCount = Object.keys(registry).length;

    // 连续性补全的 claim 必须已经在冻结注册表里 —— 否则补全会引入新颜色（L1 承诺「只增不改、新增 0 条」）
    for (const entry of continuity?.entries ?? []) {
      if (!Object.prototype.hasOwnProperty.call(registry, entry.claim)) {
        throw new Error(
          `continuity：claim「${entry.claim}」不在冻结颜色注册表 data/identity/colors.json 中；` +
            `补全只能在已冻结颜色的既有实体之间进行（否则会新增颜色）`,
        );
      }
    }

    // key 交集（AR3）与更替对（AR2）也必须异色。这两类通常**不在同一年共现**，
    // 光靠 45° 局部窗口抓不到，必须在探测时显式避开。
    const keyEntities = new Map();
    for (const [nk, m] of entityOfYear) keyEntities.set(nk, new Set(m.values()));
    const successionPartners = new Map();
    for (const [a, b] of aliases.succession ?? []) {
      if (!successionPartners.has(a)) successionPartners.set(a, new Set());
      if (!successionPartners.has(b)) successionPartners.set(b, new Set());
      successionPartners.get(a).add(b);
      successionPartners.get(b).add(a);
    }

    const { colors, probed, unresolved } = assignColors({
      entities,
      registry,
      forbiddenFor: (id, assigned) => {
        const set = new Set();
        for (const nid of neighborEntities(id)) {
          const c = assigned.get(nid);
          if (c) set.add(c);
        }
        for (const nk of entities.get(id)?.normKeys ?? []) {
          for (const nid of keyEntities.get(nk) ?? []) {
            if (nid === id) continue;
            const c = assigned.get(nid);
            if (c) set.add(c);
          }
        }
        for (const nid of successionPartners.get(id) ?? []) {
          const c = assigned.get(nid);
          if (c) set.add(c);
        }
        return set;
      },
    });

    console.log(
      `身份：${entities.size} 个历史政权实体（手工 ${[...entities.values()].filter((e) => e.kind === 'manual').length}）` +
        ` · 归一化 key ${keyYears.size} 个 · 空档切分 key ${splitKeys} 个`,
    );
    console.log(
      `颜色：注册表已有 ${frozenCount} 条 · 二次探测 ${probed.length} 个实体` +
        (unresolved.length > 0 ? ` · 探测失败 ${unresolved.length} 个（回退基底色）` : '') +
        '\n',
    );

    // ---------- 地理实体配置（D1 配置驱动：data/geo/geographic-entities.json） ----------
    const geoConfigFile = (await readJsonIfExists(GEO_CONFIG_PATH)) ?? { version: 1, entities: [] };
    const geoConfig = {
      poleLatitude: geoConfigFile.poleLatitude ?? -89.9,
      nameMatch: new Set((geoConfigFile.nameMatch ?? []).map((s) => String(s).trim().toLowerCase())),
      entities: geoConfigFile.entities ?? [],
    };
    const geoAssets = new Map(); // 地理实体 id -> 资产 FeatureCollection
    for (const geo of geoConfig.entities) {
      // 地理实体不是历史政权：身份与颜色都由配置写死为中性值，这里做启动期硬校验
      if (geo.entityId !== UNNAMED_ENTITY) {
        throw new Error(`地理实体 ${geo.id} 的 entityId 必须是 ${UNNAMED_ENTITY}（实际 ${geo.entityId}）`);
      }
      if (geo.color !== UNNAMED_COLOR) {
        throw new Error(`地理实体 ${geo.id} 的颜色必须是中性灰 ${UNNAMED_COLOR}（实际 ${geo.color}）`);
      }
      if (geo.enforcePresence && !geo.asset) {
        throw new Error(`地理实体 ${geo.id} 声明了 enforcePresence，但没有声明 asset`);
      }
      if (geo.asset) {
        const assetPath = path.join(GEO_DIR, geo.asset);
        const asset = await readJsonIfExists(assetPath);
        if (!asset || asset.type !== 'FeatureCollection' || !Array.isArray(asset.features) || asset.features.length === 0) {
          throw new Error(`地理实体 ${geo.id} 的资产无效：${assetPath}`);
        }
        geoAssets.set(geo.id, asset);
      }
    }
    if (geoConfig.entities.length > 0) {
      console.log(`地理实体：登记 ${geoConfig.entities.length} 个 · 极地判据 最南纬度 ≤ ${geoConfig.poleLatitude}\n`);
    }

    // ---------- 连续性补全：解析每个条目的几何来源要素（L1/D4） ----------
    // 来源年份的 raw 要素按 normalizeKey(SUBJECTO || NAME) 定位，必须恰好 1 个（否则配置无法唯一对应）。
    const continuityByYear = new Map(); // year -> {key, claim, geometryFrom, source}[]
    const continuitySourceYears = new Set();
    for (const entry of continuity?.entries ?? []) {
      const nk = normalizeKey(entry.key);
      const srcPath = path.join(GEOJSON_DIR, yearToSourceFile(entry.geometryFrom));
      const doc = JSON.parse(await fs.readFile(srcPath, 'utf8'));
      const matches = doc.features.filter(
        (f) => normalizeKey(f.properties?.SUBJECTO || f.properties?.NAME || '') === nk,
      );
      if (matches.length !== 1) {
        throw new Error(
          `continuity：${entry.geometryFrom} 年的 key「${entry.key}」在 ${yearToSourceFile(entry.geometryFrom)} 中匹配到 ${matches.length} 个要素（要求恰好 1 个）`,
        );
      }
      continuitySourceYears.add(entry.geometryFrom);
      for (const year of entry.years) {
        let list = continuityByYear.get(year);
        if (!list) {
          list = [];
          continuityByYear.set(year, list);
        }
        list.push({ key: entry.key, claim: entry.claim, geometryFrom: entry.geometryFrom, source: matches[0] });
      }
    }
    if (continuityByYear.size > 0) {
      const totalItems = [...continuityByYear.values()].reduce((n, l) => n + l.length, 0);
      console.log(
        `连续性补全几何：${continuity?.entries?.length ?? 0} 个条目取自 ${continuitySourceYears.size} 个来源年份` +
          ` → ${totalItems} 个注入项，覆盖 ${continuityByYear.size} 个快照\n`,
      );
    }

    // ---------- 第 2 遍：量化 + 写出 ----------
    const snapshots = [];
    const usedEntityYears = new Map(); // id -> Set<year>
    const usedEntityRawKeys = new Map();
    let totalBytes = 0;
    let totalFeatures = 0;
    let totalVertices = 0;
    let totalDropped = 0;
    let totalUnnamedKey = 0;
    let totalGeographic = 0;
    let totalInjected = 0;
    let totalContinuityInjected = 0;
    let totalAttributed = 0;
    const injectedYears = [];
    const polarWarnings = [];

    for (const year of years) {
      const srcPath = path.join(GEOJSON_DIR, yearToSourceFile(year));
      const raw = JSON.parse(await fs.readFile(srcPath, 'utf8'));

      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      const features = [];
      const colorsInFile = new Map(); // color -> count
      let dropped = 0;
      let vertices = 0;
      let unnamed = 0;

      let polarFeatures = 0;
      let geographicFeatures = 0;

      /**
       * 把上游要素（或地理实体资产几何）转成产物 feature。
       * 重构自原先的内联循环，行为完全一致；新增的只有：
       *   - 统计要素自身最南纬度 minLat，供 R-A / AR10 判定「极地要素」
       *   - R-B：地理实体（南极洲）强制归入 UNNAMED 中性灰，不参与政权身份解析
       *   - overrideProps：D4 同年归并用（无属性重复几何取同快照原生政权的属性）
       */
      function convertFeature(f, overrideProps = null) {
        const p = overrideProps ?? f.properties ?? {};
        const name = p.NAME ?? null;
        const subject = p.SUBJECTO ?? null;
        const rawKey = subject || name || null;

        // 几何：上游世界文件绝大多数是 MultiPolygon，只有 world_1878 含 2 个 Polygon。
        // 这里把 Polygon 无损包装成「单元素 MultiPolygon」，避免静默丢掉这两个真实要素
        // （Mapuche / Pampas cultures）。坐标语义不变，只是容器类型统一。
        const geomType = f.geometry?.type;
        const rawPolys =
          geomType === 'MultiPolygon'
            ? f.geometry.coordinates
            : geomType === 'Polygon'
              ? [f.geometry.coordinates]
              : null;
        if (!rawPolys) {
          dropped++;
          return;
        }
        const polys = [];
        for (const poly of rawPolys) {
          const rings = [];
          for (const ring of poly) {
            const q = quantizeRing(ring);
            if (q) rings.push(q);
          }
          if (rings.length > 0) polys.push(rings);
        }
        if (polys.length === 0) {
          dropped++;
          return;
        }

        let minLat = Infinity;
        for (const poly of polys) {
          for (const ring of poly) {
            for (const [x, y] of ring) {
              if (x < bbox[0]) bbox[0] = x;
              if (y < bbox[1]) bbox[1] = y;
              if (x > bbox[2]) bbox[2] = x;
              if (y > bbox[3]) bbox[3] = y;
              if (y < minLat) minLat = y;
            }
          }
        }
        vertices += countVertices(polys);
        if (!name) unnamed++;

        // ---- R-A / R-B：地理实体判定（极地判据 ∨ 名称精确匹配） ----
        const isPolar = minLat <= geoConfig.poleLatitude;
        if (isPolar) polarFeatures++;
        const isGeographic =
          isPolar ||
          [name, subject, p.PARTOF ?? null, p.ABBREVN ?? null].some(
            (t) => typeof t === 'string' && geoConfig.nameMatch.has(t.trim().toLowerCase()),
          );
        if (isGeographic) geographicFeatures++;

        // ---- 身份与颜色 ----
        let entityId = UNNAMED_ENTITY;
        let color = UNNAMED_COLOR;
        if (isGeographic) {
          // 地理实体不是历史政权：保持 UNNAMED 中性灰，不登记实体/颜色演化，也不计入「身份缺失」
        } else if (rawKey && String(rawKey).trim()) {
          const nk = normalizeKey(String(rawKey));
          const id = entityOfYear.get(nk)?.get(year);
          if (id) {
            entityId = id;
            color = colors.get(id) ?? colorForKey(canonical.get(nk) ?? nk);
            let uy = usedEntityYears.get(id);
            if (!uy) {
              uy = new Set();
              usedEntityYears.set(id, uy);
            }
            uy.add(year);
            let uk = usedEntityRawKeys.get(id);
            if (!uk) {
              uk = new Set();
              usedEntityRawKeys.set(id, uk);
            }
            uk.add(nk);
          } else {
            totalUnnamedKey++;
          }
        } else {
          totalUnnamedKey++;
        }

        features.push({
          type: 'Feature',
          id: features.length,
          properties: {
            entityId,
            name,
            abbrev: p.ABBREVN ?? null,
            subject,
            partOf: p.PARTOF ?? null,
            precision: p.BORDERPRECISION ?? null,
            color,
          },
          geometry: { type: 'MultiPolygon', coordinates: polys },
        });
        colorsInFile.set(color, (colorsInFile.get(color) ?? 0) + 1);
      }

      // ---- 无属性重复几何归并（D4 同年归并：data/identity/unnamed-attribution.json） ----
      // 把「空属性那份几何」接到同一快照里已有的同名政权上：属性取原生要素、几何保留这份。
      // 全部检查都用**同年**证据（源文件本身 + 同年身份解析结果），不做跨年几何匹配。
      const attributionOverride = new Map(); // 源要素序号 -> 归并后的属性对象
      for (const entry of attributionByYear.get(year) ?? []) {
        const target = raw.features[entry.sourceFeatureIndex];
        if (!target) {
          throw new Error(
            `unnamed-attribution：${year} 年的源文件没有第 ${entry.sourceFeatureIndex} 个要素（key「${entry.key}」）`,
          );
        }
        const tp = target.properties ?? {};
        if (tp.NAME || tp.SUBJECTO) {
          throw new Error(
            `unnamed-attribution：${year} 年源要素 ${entry.sourceFeatureIndex} 有 NAME/SUBJECTO` +
              `（「${tp.SUBJECTO || tp.NAME}」），不是无属性重复几何（key「${entry.key}」）`,
          );
        }
        const targetPolys =
          target.geometry?.type === 'MultiPolygon'
            ? target.geometry.coordinates
            : target.geometry?.type === 'Polygon'
              ? [target.geometry.coordinates]
              : [];
        const targetVertices = countVertices(targetPolys);
        if (entry.expectVertices !== undefined && targetVertices !== entry.expectVertices) {
          throw new Error(
            `unnamed-attribution：${year} 年源要素 ${entry.sourceFeatureIndex} 有 ${targetVertices} 个顶点，` +
              `配置期望 ${entry.expectVertices}`,
          );
        }
        const nk = normalizeKey(entry.key);
        const siblings = [];
        raw.features.forEach((f, i) => {
          if (i === entry.sourceFeatureIndex) return;
          const sp = f.properties ?? {};
          if (normalizeKey(sp.SUBJECTO || sp.NAME || '') === nk) siblings.push(sp);
        });
        if (siblings.length !== 1) {
          throw new Error(
            `unnamed-attribution：${year} 年的 key「${entry.key}」在源文件里匹配到 ${siblings.length} 个原生要素（要求恰好 1 个）`,
          );
        }
        const sib = siblings[0];
        if (!sib.NAME) {
          throw new Error(`unnamed-attribution：${year} 年 key「${entry.key}」的原生要素没有 NAME，无法作为归并后的属性来源`);
        }
        if (!entityOfYear.get(nk)?.get(year)) {
          throw new Error(
            `unnamed-attribution：${year} 年的 key「${entry.key}」在身份解析里没有对应实体（同年没有政权归属，不能归并）`,
          );
        }
        attributionOverride.set(entry.sourceFeatureIndex, {
          NAME: sib.NAME,
          SUBJECTO: sib.SUBJECTO ?? null,
          ABBREVN: sib.ABBREVN ?? null,
          PARTOF: sib.PARTOF ?? null,
          BORDERPRECISION: sib.BORDERPRECISION ?? null,
        });
      }
      totalAttributed += attributionOverride.size;

      for (let i = 0; i < raw.features.length; i++) {
        convertFeature(raw.features[i], attributionOverride.get(i) ?? null);
      }

      // ---- R-A：存在性补全（配置驱动；缺失年份与未来新增年份都走这条路径） ----
      let injectedHere = 0;
      if (polarFeatures === 0) {
        for (const geo of geoConfig.entities) {
          if (!geo.enforcePresence) continue;
          const asset = geoAssets.get(geo.id);
          if (!asset) throw new Error(`地理实体 ${geo.id} 声明了 enforcePresence，但资产未加载（data/geo/${geo.asset}）`);
          const before = features.length;
          convertFeature(asset.features[0]);
          if (features.length !== before + 1) {
            throw new Error(`地理实体 ${geo.id} 的资产几何量化后退化，未写出要素（${year} · ${geo.asset}）`);
          }
          injectedHere++;
        }
        if (injectedHere > 0) {
          totalInjected += injectedHere;
          injectedYears.push(year);
        }
      }

      // ---- 连续性补全注入（L1/D4：该年完全没有这个 key，几何取 geometryFrom 年） ----
      // 与原生要素走完全同一条通道（同一个 convertFeature）：属性、身份、颜色都由当前年
      // 的数据 + 身份解析结果决定，因此不需要任何前端补丁。
      let continuityInjectedHere = 0;
      for (const item of continuityByYear.get(year) ?? []) {
        const before = features.length;
        convertFeature(item.source);
        if (features.length !== before + 1) {
          throw new Error(
            `continuity：key「${item.key}」的几何量化后退化，未写出要素（${year} · geometryFrom ${item.geometryFrom}）`,
          );
        }
        continuityInjectedHere++;
        totalContinuityInjected++;
      }

      // ---- D3：极地要素数量告警（每年预期恰好 1 个） ----
      if (polarFeatures > 1) {
        polarWarnings.push(`${year}(${polarFeatures})`);
        console.warn(`  [警告] ${year} 年出现 ${polarFeatures} 个极地要素（预期 1 个）——检查是否有政权实体覆盖南极点`);
      }
      totalGeographic += geographicFeatures;

      const fc = {
        type: 'FeatureCollection',
        name: `world_${year}`,
        features,
      };

      const outName = yearToOutputName(year);
      const outPath = path.join(OUT_YEARS_DIR, outName);
      const json = JSON.stringify(fc);
      // D6：内容相同就不写盘（重复构建不再刷新 mtime，保护文件比对里只剩真正变化的文件）
      await writeIfChanged(outPath, json, 'utf8');

      const bytes = Buffer.byteLength(json);
      const srcBytes = (await fs.stat(srcPath)).size;
      totalBytes += bytes;
      totalFeatures += features.length;
      totalVertices += vertices;
      totalDropped += dropped;

      snapshots.push({
        year,
        file: `years/${outName}`,
        features: features.length,
        vertices,
        unnamed,
        bytes,
        bbox,
        entities: colorsInFile.size,
      });

      const saved = (1 - bytes / srcBytes) * 100;
      console.log(
        `  ${String(year).padStart(7)}  ` +
          `${String(features.length).padStart(5)} features  ` +
          `${String(vertices).padStart(7)} 顶点  ` +
          `${String(colorsInFile.size).padStart(5)} 实体  ` +
          `${(srcBytes / 1048576).toFixed(2)} → ${(bytes / 1048576).toFixed(2)} MB  ` +
          `(-${saved.toFixed(1)}%)` +
          (dropped > 0 ? `  丢弃退化几何 ${dropped}` : '') +
          (injectedHere > 0 ? `  ⚑ R-A 补全地理实体 ${injectedHere}` : '') +
          (continuityInjectedHere > 0 ? `  ⚑ L1 连续性补全 ${continuityInjectedHere}` : '') +
          (attributionOverride.size > 0 ? `  ⚑ D4 归并重复几何 ${attributionOverride.size}` : ''),
      );
    }

    // ---------- 冻结颜色注册表（只增不改，合并已有内容） ----------
    const nextRegistry = { ...registry };
    let newColors = 0;
    for (const id of usedEntityYears.keys()) {
      if (!nextRegistry[id]) {
        nextRegistry[id] = colors.get(id);
        newColors++;
      }
    }
    const registryIds = Object.keys(nextRegistry).sort();
    const registryBody = registryIds.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(nextRegistry[id])}`).join(',\n');
    await writeIfChanged(
      REGISTRY_PATH,
      `{\n  "version": 1,\n  "_note": "冻结颜色注册表：entityId → 颜色。只增不改，任何已有条目都不得被构建过程覆盖；这样同一个历史政权在任何年份、任何一次重建中都不会换色。删除某条 = 该实体下次构建时重新分配颜色。",\n  "colors": {\n${registryBody}\n  }\n}\n`,
      'utf8',
    );

    // ---------- 实体索引 ----------
    const entityList = [...usedEntityYears.keys()]
      .map((id) => {
        const e = entities.get(id);
        return {
          id,
          kind: e?.kind ?? 'auto',
          label: e?.label ?? null,
          labelEn: e?.labelEn ?? null,
          color: nextRegistry[id] ?? colors.get(id),
          keys: [...(usedEntityRawKeys.get(id) ?? [])].map((nk) => canonical.get(nk) ?? nk).sort(),
          periods: e?.periods ?? null,
          years: [...usedEntityYears.get(id)].sort((a, b) => a - b),
        };
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const entitiesJson = JSON.stringify({ count: entityList.length, entities: entityList });
    await fs.writeFile(path.join(OUT_DIR, 'entities.json'), entitiesJson, 'utf8');

    // ---------- manifest ----------
    const distinctColors = new Set(entityList.map((e) => e.color));
    const colorBucket = new Map();
    for (const e of entityList) colorBucket.set(e.color, (colorBucket.get(e.color) ?? 0) + 1);
    let collidingEntities = 0;
    for (const n of colorBucket.values()) if (n > 1) collidingEntities += n;

    const manifest = {
      generatedAt: new Date().toISOString(),
      source: 'aourednik/historical-basemaps@master',
      license: 'GPL-3.0',
      coordPrecision: COORD_PRECISION,
      allYears,
      entityCount: entityList.length,
      entitiesFile: 'entities.json',
      // P4.2-1：登记关系层 sidecar 目录（旁挂数据，不进入 GeoJSON）
      relationsDir: 'relations',
      identity: {
        aliasFile: 'data/identity/aliases.json',
        gapSplitThreshold: aliases.gapSplitThreshold ?? 2,
        manualEntities: entityList.filter((e) => e.kind === 'manual').length,
        splitKeys,
        distinctColors: distinctColors.size,
      },
      snapshots,
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), manifestJson, 'utf8');

    console.log('');
    console.log(`快照数：${snapshots.length} / 上游共 ${allYears.length} 个年份`);
    console.log(`合计：${totalFeatures} features / ${totalVertices} 顶点 / ${(totalBytes / 1048576).toFixed(2)} MB`);
    if (totalDropped > 0) console.log(`丢弃退化几何总计：${totalDropped}`);
    console.log(
      `实体：${entityList.length} 个（手工 ${manifest.identity.manualEntities}）· 不同颜色 ${distinctColors.size} 个 · 全局撞色实体 ${collidingEntities} 个`,
    );
    console.log(`颜色注册表：新增 ${newColors} 条，总计 ${registryIds.length} 条 → data/identity/colors.json`);
    console.log(
      `地理实体：登记 ${geoConfig.entities.length} 个 · 归一要素 ${totalGeographic} 个（归入 ${UNNAMED_ENTITY} ${UNNAMED_COLOR}）` +
        ` · R-A 补全年份 ${totalInjected} 个${injectedYears.length > 0 ? `（${injectedYears.join(', ')}）` : ''}`,
    );
    if (polarWarnings.length > 0) console.log(`极地要素数量告警：${polarWarnings.join(' / ')}`);
    if (totalContinuityInjected > 0) {
      console.log(
        `连续性补全：注入 ${totalContinuityInjected} 个要素（${continuityByYear.size} 个快照 · ` +
          `${continuity?.entries?.length ?? 0} 个条目 · 来源年份 ${[...continuitySourceYears].sort((a, b) => a - b).join(', ')}）` +
          ` → data/identity/continuity.json`,
      );
    }
    console.log(`无数值 key / 身份缺失的要素：${totalUnnamedKey}（归入 ${UNNAMED_ENTITY}）`);
    if (totalAttributed > 0) {
      console.log(
        `无属性重复几何归并：${totalAttributed} 个要素接回同快照原生政权（${attributionByYear.size} 个年份 · ` +
          `${attribution?.entries?.length ?? 0} 个条目） → data/identity/unnamed-attribution.json`,
      );
    }
    console.log(`输出目录：${OUT_DIR}`);

    if (probed.length > 0) {
      console.log(`\n二次探测生效的实体（前 20）：`);
      for (const p of probed.slice(0, 20)) console.log(`  ${p.id}  salt=${p.salt}  ${p.from} → ${p.to}`);
      if (probed.length > 20) console.log(`  ...其余 ${probed.length - 20} 个`);
    }
  })();
}

main().catch((err) => {
  console.error('\n[build-data] 失败：');
  console.error(err.stack || err.message);
  process.exit(1);
});
