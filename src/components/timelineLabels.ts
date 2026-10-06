/**
 * 时间轴年份标签抽稀规则（纯函数，不碰 DOM，便于单独验证）。
 *
 * 背景：上游有 54 个快照，全部显示年份文字会互相重叠。
 * 规则：当前选中的标签优先级最高，首个 / 末个次之，这三者尽量始终显示；
 *       其余标签按可用宽度择优显示。
 *
 * 实现方式：先算出每个标签的横向占位区间（与 CSS 的锚定方式一致），
 * 再按优先级放置强制标签、最后从左到右贪心补齐不冲突的标签。
 * **保证任意两个可见标签的占位区间互不相交**，因此不会重叠。
 *
 * 唯一的例外：当当前标签正好压在首/末标签上（例如当前是倒数第 2 个快照），
 * 空间上无法同时放下，此时让优先级更低的那个（首/末）让位，
 * 而不是让两个文字叠在一起 —— 用户此刻看的就是当前那个年份。
 */

/**
 * 单个年份标签占用的横向宽度（px，含标签之间的空隙）。
 * 最宽的标签是「公元前 123000 年」，11px 字号下约 90px，取 96 留一点余量。
 */
export const LABEL_MIN_PX = 96;

/** 当前标签优先级最高，首 / 末次之（越大越不会被挤掉） */
const PRIORITY_END = 2;
const PRIORITY_CURRENT = 3;

/** 标签的贴边方式：`left` 左端对齐刻度、`right` 右端对齐刻度、`center` 居中 */
export type LabelAnchor = 'left' | 'right' | 'center';

/**
 * 决定第 i 个标签如何锚定。
 *
 * 首 / 末贴边是显然的；**靠近边界的其它标签也一律贴边**，
 * 否则居中放置会让文字有一半跑到时间轴外面去。
 */
export function labelAnchor(
  i: number,
  total: number,
  width: number,
  minPx: number = LABEL_MIN_PX,
): LabelAnchor {
  if (total <= 1 || width <= 0) return 'center';
  const p = (i / (total - 1)) * width;
  if (i === 0 || p < minPx / 2) return 'left';
  if (i === total - 1 || p > width - minPx / 2) return 'right';
  return 'center';
}

/**
 * 计算每个标签是否可见。
 *
 * @param total  快照总数
 * @param index  当前选中下标
 * @param width  标签行的可用宽度（px）；`<= 0` 表示未知（首帧 / 服务端渲染），此时全部可见
 * @param minPx  单个标签占用的横向宽度
 * @returns      长度等于 total 的布尔数组
 */
export function computeVisibleLabels(
  total: number,
  index: number,
  width: number,
  minPx: number = LABEL_MIN_PX,
): boolean[] {
  const visible = new Array<boolean>(Math.max(total, 0)).fill(false);
  if (total <= 0) return visible;
  if (total === 1) {
    visible[0] = true;
    return visible;
  }
  // 宽度未知时不做任何隐藏，宁可挤一点也不要误藏
  if (width <= 0) return visible.fill(true);

  const posOf = (i: number): number => (i / (total - 1)) * width;

  /**
   * 标签的实际横向占位，与 `labelAnchor` 决定的 CSS transform 一一对应：
   * `translateX(0)` → 从刻度向右；`translateX(-100%)` → 到刻度为止；`translateX(-50%)` → 居中。
   */
  const extentOf = (i: number): [number, number] => {
    const p = posOf(i);
    switch (labelAnchor(i, total, width, minPx)) {
      case 'left':
        return [p, p + minPx];
      case 'right':
        return [p - minPx, p];
      default:
        return [p - minPx / 2, p + minPx / 2];
    }
  };

  const overlaps = (a: [number, number], b: [number, number]): boolean => a[0] < b[1] && b[0] < a[1];

  // 强制标签及其优先级（同一个下标取最高优先级，例如当前正好是末世就用当前的身份）
  const priority = new Map<number, number>();
  const raise = (i: number, p: number) => {
    priority.set(i, Math.max(priority.get(i) ?? 0, p));
  };
  raise(0, PRIORITY_END);
  raise(total - 1, PRIORITY_END);
  raise(index, PRIORITY_CURRENT);

  // 优先级高的先落位；被同级或更高优先级挡住时自己让位，否则挤掉占位的低优先级标签
  const order = [...priority.keys()].sort(
    (a, b) => (priority.get(b)! - priority.get(a)!) || a - b,
  );
  const accepted: number[] = [];
  for (const f of order) {
    const box = extentOf(f);
    let blocked = false;
    for (let k = accepted.length - 1; k >= 0; k--) {
      const j = accepted[k];
      if (!overlaps(box, extentOf(j))) continue;
      if ((priority.get(j) ?? 0) >= priority.get(f)!) {
        blocked = true;
        break;
      }
      accepted.splice(k, 1);
    }
    if (!blocked) accepted.push(f);
  }

  // 其余标签从左到右贪心补齐
  for (let i = 0; i < total; i++) {
    if (priority.has(i)) continue;
    const box = extentOf(i);
    if (!accepted.some((j) => overlaps(box, extentOf(j)))) accepted.push(i);
  }

  for (const i of accepted) visible[i] = true;
  return visible;
}
