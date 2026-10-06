// 年份 ↔ 文件名 映射与参数解析
// 上游命名规则：负年份 → world_bc<abs>.geojson；正年份 → world_<year>.geojson

export function yearToSourceFile(year) {
  return year < 0 ? `world_bc${Math.abs(year)}.geojson` : `world_${year}.geojson`;
}

export function yearToOutputName(year) {
  return year < 0 ? `world_bc${Math.abs(year)}.json` : `world_${year}.json`;
}

/**
 * 解析 --years 参数。
 * 支持 `--years 2010,1492,-5000` / `--years 2010 1492 -5000` / `--years=2010,1492`
 * 未提供时返回 null（表示「全部」）。
 */
export function parseYearsArg(argv) {
  let raw = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--years') {
      raw = argv[i + 1] ?? '';
      break;
    }
    if (a.startsWith('--years=')) {
      raw = a.slice('--years='.length);
      break;
    }
  }
  if (raw == null) return null;
  const years = raw
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((s) => Number(s));
  if (years.some((y) => !Number.isInteger(y))) {
    throw new Error(`--years 参数包含非整数：${raw}`);
  }
  return [...new Set(years)];
}

/** 人类可读标签，例如 -5000 → "公元前 5000 年" */
export function formatYear(year) {
  return year < 0 ? `公元前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
}
