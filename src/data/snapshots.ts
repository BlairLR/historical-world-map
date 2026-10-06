import type { Manifest, Snapshot } from './types';

/** 构建产物目录（跟随 Vite base，默认 /data/） */
export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

let manifestPromise: Promise<Manifest> | null = null;

/** 加载 manifest.json（进程内只请求一次）。manifest 只含元数据，不含几何。 */
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= (async () => {
    const res = await fetch(`${DATA_BASE}manifest.json`);
    if (!res.ok) throw new Error(`加载 data/manifest.json 失败：HTTP ${res.status} ${res.statusText}`);
    const manifest = (await res.json()) as Manifest;
    if (!Array.isArray(manifest.snapshots) || manifest.snapshots.length === 0) {
      throw new Error('manifest.json 中没有可用的快照，请先运行 npm run data:build');
    }
    return manifest;
  })();
  return manifestPromise;
}

/** -5000 → "公元前 5000 年"；1492 → "公元 1492 年" */
export function formatYear(year: number): string {
  return year < 0 ? `公元前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
}

/** 找到 <= year 的最近快照下标（二分）；year 早于全部快照时返回 0。 */
export function findIndexByYear(snapshots: Snapshot[], year: number): number {
  let lo = 0;
  let hi = snapshots.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].year <= year) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** 读取 URL 上的 ?year=xxxx（非法值返回 null） */
export function readYearFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('year');
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** 把当前年份写回 URL（replaceState，不产生历史记录） */
export function writeYearToUrl(year: number): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('year') === String(year)) return;
  url.searchParams.set('year', String(year));
  window.history.replaceState(null, '', url);
}
