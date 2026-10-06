// 确定性配色：同样的主体名在任何年份、任何构建中都得到相同颜色。
// 这样跨年份切换时，同一个政权不会突然变色。

/** FNV-1a 32 位哈希 */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 上游 NAME 为 null 的区域（南极洲、无人区等）使用中性灰 */
export const UNNAMED_COLOR = '#9aa0a6';

/**
 * @param {string|null|undefined} key 主体标识（SUBJECTO 优先，其次 NAME）
 * @returns {string} `#rrggbb`
 */
export function colorForKey(key) {
  if (!key) return UNNAMED_COLOR;
  const h = fnv1a(key);
  const hue = h % 360;
  const s = 0.34 + ((h >>> 9) % 5) * 0.05; // 0.34 .. 0.54
  const l = 0.6 + ((h >>> 17) % 4) * 0.035; // 0.60 .. 0.705
  return hslToHex(hue, s, l);
}
