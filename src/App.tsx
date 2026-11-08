import { useCallback, useEffect, useState } from 'react';
import { MapView } from './components/MapView';
import { TimeBar } from './components/TimeBar';
import { findIndexByYear, formatYear, loadManifest, readYearFromUrl, writeYearToUrl } from './data/snapshots';
import { loadRelations, loadYear } from './data/loadYear';
import type { Manifest, RelationSidecar, Snapshot, YearData } from './data/types';

/**
 * 1× 速度下每个快照停留的毫秒数。
 * 播放节奏由它和倍率决定，**与真实年份跨度无关** —— 上游年份间隔极不均匀
 * （最大 113000 年、最小 2 年），按年份跨度播放会让远古一闪而过、近现代卡死。
 */
const BASE_DWELL_MS = 900;

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  /** yearIndex 是状态真相；year 只用于显示与 URL */
  const [yearIndex, setYearIndex] = useState<number | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<{ year: number; data: YearData } | null>(null);
  /** 关系层（旁挂 sidecar）：与年份数据并行加载，加载失败不影响地图 */
  const [loadedRelations, setLoadedRelations] = useState<{ year: number; data: RelationSidecar | null } | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  /** 播放倍率：0.5 / 1 / 2 / 4，只影响每个快照的停留时长 */
  const [speed, setSpeed] = useState(1);

  // 1) 载入 manifest，并按 ?year= 决定初始快照
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((m) => {
        if (!alive) return;
        const urlYear = readYearFromUrl();
        setManifest(m);
        setYearIndex(urlYear == null ? m.snapshots.length - 1 : findIndexByYear(m.snapshots, urlYear));
        setBooting(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setBooting(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const snapshot: Snapshot | null =
    manifest && yearIndex != null ? (manifest.snapshots[yearIndex] ?? null) : null;

  // 2) 按需加载当前年份数据 + 旁挂加载关系层（两条独立请求，互不阻塞）
  useEffect(() => {
    if (!snapshot) return;
    let alive = true;
    setLoading(true);
    loadYear(snapshot)
      .then((d) => {
        if (!alive) return;
        setLoadedSnapshot({ year: snapshot.year, data: d });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // 关系层只是旁挂信息：失败或缺失都不影响地图，只记一条警告
    loadRelations(snapshot)
      .then((r) => {
        if (alive) setLoadedRelations({ year: snapshot.year, data: r });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        console.warn('[relations] 加载失败，已降级为无关系信息：', err);
        setLoadedRelations({ year: snapshot.year, data: null });
      });
    return () => {
      alive = false;
    };
  }, [snapshot]);

  // 3) URL 状态同步
  useEffect(() => {
    if (snapshot) writeYearToUrl(snapshot.year);
  }, [snapshot]);

  const step = useCallback(
    (delta: number) => {
      setYearIndex((current) => {
        if (current == null || !manifest) return current;
        const next = current + delta;
        if (next < 0 || next > manifest.snapshots.length - 1) return current;
        return next;
      });
    },
    [manifest],
  );

  /** 拖动时间轴：落到指定 index（边界在这里钳制，TimeBar 只负责报出目标） */
  const seek = useCallback(
    (target: number) => {
      if (!manifest) return;
      const clamped = Math.min(Math.max(target, 0), manifest.snapshots.length - 1);
      setYearIndex((current) => (current === clamped ? current : clamped));
    },
    [manifest],
  );

  /** 年份输入：复用既有的 findIndexByYear() 吸附到不晚于该年的最近快照 */
  const submitYear = useCallback(
    (target: number) => {
      if (!manifest) return;
      setYearIndex(findIndexByYear(manifest.snapshots, target));
    },
    [manifest],
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // 已经停在最后一个快照时按下播放 → 从头开始
    if (manifest && yearIndex != null && yearIndex >= manifest.snapshots.length - 1) {
      setYearIndex(0);
    }
    setPlaying(true);
  }, [playing, yearIndex, manifest]);

  // 4) 播放：每隔「停留毫秒数」前进一个快照，与真实年份跨度无关
  useEffect(() => {
    if (!playing || !manifest) return;
    const dwell = BASE_DWELL_MS / speed;
    const timer = window.setInterval(() => {
      setYearIndex((current) => {
        if (current == null) return current;
        const next = current + 1;
        return next > manifest.snapshots.length - 1 ? current : next;
      });
    }, dwell);
    return () => window.clearInterval(timer);
  }, [playing, speed, manifest]);

  // 播放到最后一个快照后自动暂停
  useEffect(() => {
    if (!playing || !manifest) return;
    if (yearIndex != null && yearIndex >= manifest.snapshots.length - 1) setPlaying(false);
  }, [playing, yearIndex, manifest]);

  // 5) 键盘：← / → 切换快照
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  return (
    <div className="app">
      <div className="map-wrap">
        <MapView data={loadedSnapshot?.data ?? null} relations={loadedRelations?.year === loadedSnapshot?.year ? loadedRelations?.data ?? null : null} />

        {booting && <div className="overlay">正在加载数据索引…</div>}

        {loading && snapshot && (
          <div className="badge">正在加载 {formatYear(snapshot.year)} …</div>
        )}

        {error && (
          <div className="banner error">
            <strong>出错了：</strong> {error}
            <div className="banner-hint">
              若提示 manifest 不存在，请先运行 <code>npm run data:fetch</code> 与 <code>npm run data:build</code>。
            </div>
          </div>
        )}
      </div>

      {snapshot && (
        <TimeBar
          year={snapshot.year}
          index={yearIndex ?? 0}
          years={manifest ? manifest.snapshots.map((s) => s.year) : []}
          loading={loading}
          playing={playing}
          speed={speed}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onSeek={seek}
          onTogglePlay={togglePlay}
          onSpeedChange={setSpeed}
          onSubmitYear={submitYear}
        />
      )}
    </div>
  );
}
