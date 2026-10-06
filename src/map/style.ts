import type { FeatureCollection } from 'geojson';
import type { MapOptions } from 'maplibre-gl';
import { buildGraticule } from './graticule';

/** 从 maplibre-gl 的 MapOptions 反推出样式对象类型（该包未直接导出 StyleSpecification） */
type MapStyle = Exclude<NonNullable<MapOptions['style']>, string>;

export const SOURCE_ID = 'historical';
export const FILL_LAYER_ID = 'historical-fill';
export const OUTLINE_LAYER_ID = 'historical-outline';
export const HOVER_LAYER_ID = 'historical-hover';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * 无底图纯矢量样式：
 *   - ocean 背景色代替海洋瓦片
 *   - graticule 经纬网
 *   - historical 单一 source，三个图层（填充 / 描边 / hover 高亮）
 *
 * 颜色来自构建时注入的 properties.color（SUBJECTO 的确定性哈希），
 * 因此同一年份内相邻政权颜色不同、跨年份同一政权颜色一致。
 * 透明度按 BORDERPRECISION 分档：1=近似边界更透明，3=法定边界更实。
 */
export function buildStyle(): MapStyle {
  return {
    version: 8,
    sources: {
      graticule: { type: 'geojson', data: buildGraticule() },
      [SOURCE_ID]: { type: 'geojson', data: EMPTY },
    },
    layers: [
      {
        id: 'ocean',
        type: 'background',
        paint: { 'background-color': '#dbe6f2' },
      },
      {
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        paint: {
          'line-color': '#a9bed6',
          'line-width': 0.5,
          'line-opacity': 0.75,
        },
      },
      {
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['match', ['get', 'precision'], 1, 0.55, 2, 0.7, 3, 0.85, 0.7],
          'fill-antialias': true,
        },
      },
      {
        id: OUTLINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#4b5563',
          'line-width': 0.4,
          'line-opacity': 0.6,
        },
      },
      {
        id: HOVER_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#0f172a',
          'line-width': 2.2,
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0],
        },
      },
    ],
  };
}
