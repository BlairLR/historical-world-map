import type { Feature, FeatureCollection, LineString } from 'geojson';

/**
 * 生成经纬网。不依赖任何在线底图 —— 这个地图是完全离线的。
 * 用于确认投影方向正确（纬度递增向上、经度递增向右）。
 */
export function buildGraticule(step = 30): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];

  // 经线：-180 → 180
  for (let lon = -180; lon <= 180; lon += step) {
    const coordinates: [number, number][] = [];
    for (let lat = -80; lat <= 84; lat += 4) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }

  // 纬线：-60 → 60（含赤道）
  for (let lat = -60; lat <= 60; lat += step) {
    const coordinates: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 4) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }

  return { type: 'FeatureCollection', features };
}
