// 下载 aourednik/historical-basemaps 的原始 GeoJSON 到 data/raw/
//
// 用法：
//   node scripts/fetch-data.mjs                       # 下载 index.json + 全部 54 个年份
//   node scripts/fetch-data.mjs --years 2010,1492,-5000
//
// 网络说明：raw.githubusercontent.com 在本机不稳定，优先走 cdn.jsdelivr.net。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yearToSourceFile, parseYearsArg } from './lib/snapshots.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const GEOJSON_DIR = path.join(RAW_DIR, 'geojson');

const REF = 'master';
const SOURCES = [
  (p) => `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${REF}/${p}`,
  (p) => `https://raw.githubusercontent.com/aourednik/historical-basemaps/${REF}/${p}`,
];

async function fetchWithFallback(relPath) {
  const errors = [];
  for (const build of SOURCES) {
    const url = build(relPath);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'accept-encoding': 'identity',
            'user-agent': 'historical-world-map/0.1 (+local research)',
          },
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error('响应体为空');
        return { buf, url };
      } catch (err) {
        errors.push(`  ${url} 第 ${attempt} 次：${err.message}`);
      }
    }
  }
  throw new Error(`无法下载 ${relPath}\n${errors.join('\n')}`);
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const yearsArg = parseYearsArg(process.argv.slice(2));

  await fs.mkdir(GEOJSON_DIR, { recursive: true });

  // 1) index.json —— 54 个年份的权威列表
  console.log('[1/2] 下载 index.json ...');
  const indexRes = await fetchWithFallback('index.json');
  const indexPath = path.join(RAW_DIR, 'index.json');
  await fs.writeFile(indexPath, indexRes.buf);
  const index = JSON.parse(indexRes.buf.toString('utf8'));
  const allYears = index.years.map((y) => y.year);
  console.log(`      ✓ ${fmtMB(indexRes.buf.length)}  共 ${allYears.length} 个年份  (${indexRes.url})`);

  // 2) 各年份 GeoJSON
  const years = yearsArg ?? allYears;
  const unknown = years.filter((y) => !allYears.includes(y));
  if (unknown.length > 0) {
    throw new Error(`index.json 中不存在这些年份：${unknown.join(', ')}`);
  }

  console.log(`[2/2] 下载 ${years.length} 个年份的 GeoJSON ...`);
  let totalBytes = 0;
  let reused = 0;
  for (const year of years) {
    const file = yearToSourceFile(year);
    const dest = path.join(GEOJSON_DIR, file);

    // 已存在且非空则跳过，避免重复下载
    try {
      const st = await fs.stat(dest);
      if (st.size > 0) {
        totalBytes += st.size;
        reused++;
        console.log(`      = ${file}  ${fmtMB(st.size)}  (已存在，跳过)`);
        continue;
      }
    } catch {
      /* 不存在，继续下载 */
    }

    const t0 = performance.now();
    const { buf, url } = await fetchWithFallback(`geojson/${file}`);
    await fs.writeFile(dest, buf);
    totalBytes += buf.length;
    const ms = Math.round(performance.now() - t0);
    console.log(`      ↓ ${file}  ${fmtMB(buf.length)}  ${ms} ms  (${new URL(url).host})`);
  }

  console.log('');
  console.log(`完成：${years.length} 个年份（新下载 ${years.length - reused}，跳过 ${reused}）`);
  console.log(`原始数据总量：${fmtMB(totalBytes)}`);
  console.log(`输出目录：${RAW_DIR}`);
}

main().catch((err) => {
  console.error('\n[fetch-data] 失败：');
  console.error(err.message);
  process.exit(1);
});
