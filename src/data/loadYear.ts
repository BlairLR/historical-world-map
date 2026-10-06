import { DATA_BASE } from './snapshots';
import type { RelationSidecar, Snapshot, YearData } from './types';

/**
 * loadYear() 是全应用唯一的数据入口。
 * 调用方只依赖这个签名，将来换成二进制格式 / Worker 解码 / PMTiles 时调用方零改动。
 *
 * 按需加载：任意时刻浏览器内存中最多保留 MAX_CACHED_YEARS 个年份。
 */

const MAX_CACHED_YEARS = 6;

/** 简单 LRU：Map 的插入顺序即最近使用顺序，命中后重新插入到队尾 */
const cache = new Map<number, YearData>();
const inflight = new Map<number, Promise<YearData>>();

export function cachedYearCount(): number {
  return cache.size;
}

export function clearYearCache(): void {
  cache.clear();
}

export function loadYear(snapshot: Snapshot): Promise<YearData> {
  const key = snapshot.year;

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit);
  }

  // 同一年的并发请求只发一次
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<YearData> => {
    const res = await fetch(`${DATA_BASE}${snapshot.file}`);
    if (!res.ok) {
      throw new Error(`加载 ${snapshot.year} 年数据失败：HTTP ${res.status} ${res.statusText}（${snapshot.file}）`);
    }
    const parsed = (await res.json()) as YearData;
    if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      throw new Error(`${snapshot.file} 不是合法的 FeatureCollection`);
    }

    cache.set(key, parsed);
    while (cache.size > MAX_CACHED_YEARS) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return parsed;
  })();

  inflight.set(key, task);
  return task.finally(() => {
    inflight.delete(key);
  });
}

/**
 * 关系层旁挂加载：public/data/relations/<year>.json（文件名就是年份本身，含负数年份）。
 *
 * 与 loadYear() **完全同构**（同样的 LRU 上限、同样的并发去重），但两套缓存互相独立：
 * 关系层既不会写进 GeoJSON，也不会影响 loadYear() 的行为与缓存语义。
 * 该年没有 sidecar（404）时返回 null —— 静默降级，地图照常显示。
 */
const MAX_CACHED_RELATIONS = MAX_CACHED_YEARS;

const relationCache = new Map<number, RelationSidecar | null>();
const relationInflight = new Map<number, Promise<RelationSidecar | null>>();

export function cachedRelationCount(): number {
  return relationCache.size;
}

export function clearRelationCache(): void {
  relationCache.clear();
}

export function loadRelations(snapshot: Snapshot): Promise<RelationSidecar | null> {
  const key = snapshot.year;

  if (relationCache.has(key)) {
    const hit = relationCache.get(key) ?? null;
    relationCache.delete(key);
    relationCache.set(key, hit);
    return Promise.resolve(hit);
  }

  const pending = relationInflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<RelationSidecar | null> => {
    const res = await fetch(`${DATA_BASE}relations/${key}.json`);
    // 该年没有关系层产物 → 不算错误，只是没有关系信息可展示
    if (res.status === 404) {
      relationCache.set(key, null);
      return null;
    }
    if (!res.ok) {
      throw new Error(`加载 ${key} 年关系数据失败：HTTP ${res.status} ${res.statusText}（relations/${key}.json）`);
    }
    const parsed = (await res.json()) as RelationSidecar;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.features !== 'object' || parsed.features === null) {
      throw new Error(`relations/${key}.json 不是合法的关系层 sidecar（顶层必须是 { year, features }）`);
    }

    relationCache.set(key, parsed);
    while (relationCache.size > MAX_CACHED_RELATIONS) {
      const oldest = relationCache.keys().next().value;
      if (oldest === undefined) break;
      relationCache.delete(oldest);
    }
    return parsed;
  })();

  relationInflight.set(key, task);
  return task.finally(() => {
    relationInflight.delete(key);
  });
}
