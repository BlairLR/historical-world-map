import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { formatYear } from '../data/snapshots';
import { computeVisibleLabels, labelAnchor } from './timelineLabels';

/** 播放速度档位：倍率越大，每个快照停留时间越短 */
const SPEED_PRESETS = [0.5, 1, 2, 4];

type Props = {
  /** 当前快照年份（仅用于显示） */
  year: number;
  /** 当前快照下标（状态真相） */
  index: number;
  /** 全部快照年份，升序；长度即总数 */
  years: number[];
  loading: boolean;
  playing: boolean;
  speed: number;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (index: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onSubmitYear: (year: number) => void;
};

/**
 * 时间轴控制条。
 *
 * 关键点：**刻度按 snapshot index 均匀分布**，不是按真实年份线性分布。
 * 上游年份间隔极不均匀（最大 113000 年、最小 2 年），线性轴会把近现代挤成一团，
 * 所以这里第 i 个刻度的位置恒为 `i / (total - 1)`。
 */
export function TimeBar({
  year,
  index,
  years,
  loading,
  playing,
  speed,
  onPrev,
  onNext,
  onSeek,
  onTogglePlay,
  onSpeedChange,
  onSubmitYear,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(String(year));
  const [focused, setFocused] = useState(false);
  const [requested, setRequested] = useState<number | null>(null);
  const [labelsWidth, setLabelsWidth] = useState(0);

  const total = years.length;
  const maxIndex = Math.max(total - 1, 0);
  const posOf = (i: number) => (total > 1 ? (i / (total - 1)) * 100 : 50);
  const pct = posOf(index);

  /**
   * 标签可见性：首个、末个、当前选中的始终显示，其余按横向占位区间避让。
   * 规则见 ./timelineLabels.ts —— 用像素区间判重叠，而不是 index 步长。
   */
  const showLabel = computeVisibleLabels(total, index, labelsWidth);

  // 用布局副作用测量可用宽度：在浏览器绘制前完成，避免先渲染 54 个标签再抽稀的闪烁
  useLayoutEffect(() => {
    const el = labelsRef.current;
    if (!el) return;
    const measure = () => setLabelsWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 输入框在未聚焦时跟随当前年份
  useEffect(() => {
    if (!focused) setDraft(String(year));
  }, [year, focused]);

  // 吸附提示只短暂显示
  useEffect(() => {
    if (requested == null) return;
    const timer = window.setTimeout(() => setRequested(null), 2600);
    return () => window.clearTimeout(timer);
  }, [requested]);

  /** 由指针横坐标反推最近的快照下标（index 空间，线性等距） */
  const indexFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || total <= 1) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const clamped = Math.min(1, Math.max(0, ratio));
    return Math.round(clamped * (total - 1));
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onSeek(indexFromClientX(e.clientX));
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onSeek(indexFromClientX(e.clientX));
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = draft.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) {
      setDraft(String(year));
      return;
    }
    const wanted = Math.trunc(n);
    setRequested(wanted);
    onSubmitYear(wanted);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const snapped = requested != null && requested !== year;

  return (
    <div className="timebar">
      {/* ── 第一行：传输控制 / 速度 / 年份输入 / 当前年份 ── */}
      <div className="timebar-row">
        <button
          type="button"
          className="ctl-btn icon-btn"
          onClick={onPrev}
          disabled={index <= 0}
          title="上一个快照（←）"
          aria-label="上一个快照"
        >
          ‹
        </button>

        <button
          type="button"
          className="ctl-btn play-btn"
          onClick={onTogglePlay}
          disabled={total <= 1}
          title={playing ? '暂停播放' : '开始播放'}
        >
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>

        <button
          type="button"
          className="ctl-btn icon-btn"
          onClick={onNext}
          disabled={index >= maxIndex}
          title="下一个快照（→）"
          aria-label="下一个快照"
        >
          ›
        </button>

        <div className="speed-group" role="group" aria-label="播放速度">
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={`speed-btn${s === speed ? ' is-active' : ''}`}
              onClick={() => onSpeedChange(s)}
              aria-pressed={s === speed}
              title={`每个快照停留 ${Math.round(1000 / s)} 毫秒`}
            >
              {s}×
            </button>
          ))}
        </div>

        <form className="year-form" onSubmit={handleSubmit}>
          <label className="year-form-label" htmlFor="year-input">
            年份
          </label>
          <input
            id="year-input"
            className="year-input"
            type="number"
            step={1}
            inputMode="numeric"
            value={draft}
            placeholder="如 1492 / -5000"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            title="输入年份后吸附到不晚于该年的最近快照；负数表示公元前"
          />
          <button type="submit" className="ctl-btn go-btn">
            跳转
          </button>
          <span className={`snap-hint${snapped ? '' : ' is-hidden'}`}>
            已吸附到 {formatYear(year)}
          </span>
        </form>

        <div className="spacer" />

        <div className="year-block">
          <span className="year-label">{formatYear(year)}</span>
          <span className="year-sub">
            快照 {index + 1} / {total}
            {loading ? ' · 加载中…' : ''}
          </span>
        </div>
      </div>

      {/* ── 第二行：可拖动时间轴（index 空间等距） ── */}
      <div className="timeline">
        <div
          ref={trackRef}
          className="tl-track"
          role="slider"
          tabIndex={0}
          aria-label="历史时间轴，拖动切换快照"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={index}
          aria-valuetext={formatYear(year)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="tl-rail" />
          <div className="tl-fill" style={{ width: `${pct}%` }} />

          {years.map((y, i) => (
            <span
              key={y}
              className={`tl-tick${i === index ? ' is-active' : i < index ? ' is-past' : ''}`}
              style={{ left: `${posOf(i)}%` }}
            />
          ))}

          <div className="tl-thumb" style={{ left: `${pct}%` }} />
        </div>

        <div className="tl-labels" ref={labelsRef}>
          {years.map((y, i) => {
            if (!showLabel[i]) return null;
            // 与 computeVisibleLabels 内部判定占位区间用的是同一个函数，两边不会算岔
            const anchor = labelAnchor(i, total, labelsWidth);
            const transform =
              anchor === 'left' ? 'translateX(0)' : anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
            return (
              <span
                key={y}
                className={`tl-tick-label${i === index ? ' is-active' : ''}`}
                style={{ left: `${posOf(i)}%`, transform }}
              >
                {formatYear(y)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
