import { useEffect, useRef } from 'react';
// maplibre-gl v6 的 ESM 构建没有 default export，必须用具名导入
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle, FILL_LAYER_ID, SOURCE_ID } from '../map/style';
import { authorityLabel } from './authorityLabels';
import type { RelationRecord, RelationSidecar, YearData } from '../data/types';

const PRECISION_LABEL: Record<number, string> = {
  1: '近似边界',
  2: '中等精度',
  3: '国际法定边界',
};

/** 关系层 11 项冻结枚举的展示名（仅提示框文案，不参与颜色 / 身份 / 地图逻辑） */
const RELATIONSHIP_LABEL: Record<string, string> = {
  'sovereign-territory': '主权领土',
  colony: '殖民地',
  protectorate: '保护国',
  occupied: '占领',
  dependency: '属地',
  mandate: '委任统治',
  trusteeship: '托管',
  autonomous: '自治',
  condominium: '共管',
  administered: '行政管理',
  unknown: '未知',
};

/**
 * P4.3-0：relationship 的视觉辅助图标（纯文案前缀，单一 BMP 码位）。
 * 只覆盖指定的 5 类；未列入的枚举保持原样渲染，不新增颜色 / 描边 / 纹理。
 * 约束：仅提示框文字，不参与颜色 / identity / setData 流程。
 */
const RELATIONSHIP_ICON: Record<string, string> = {
  occupied: '⚔',
  colony: '⚑',
  mandate: '⚖',
  trusteeship: '⚓',
  administered: '⚙',
};

function positionTooltip(el: HTMLElement, container: HTMLElement, x: number, y: number): void {
  const pad = 14;
  const rect = el.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > container.clientWidth - 8) left = x - pad - rect.width;
  if (top + rect.height > container.clientHeight - 8) top = y - pad - rect.height;
  el.style.transform = `translate(${Math.max(8, Math.round(left))}px, ${Math.max(8, Math.round(top))}px)`;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * P4.3-1：relationship 的取值片段 = 固定宽度图标槽位 + 中文标签 + 弱化的枚举名尾注。
 * 纯提示框文案：不参与颜色 / identity，也不影响 setData 流程。
 */
function relationshipValue(relation: RelationRecord): HTMLElement {
  const label = RELATIONSHIP_LABEL[relation.relationship];
  const icon = RELATIONSHIP_ICON[relation.relationship];
  const frag = document.createElement('span');
  if (icon) {
    const slot = document.createElement('span');
    slot.className = 'tip-icon';
    slot.textContent = icon;
    frag.appendChild(slot);
  }
  frag.appendChild(document.createTextNode(label ?? relation.relationship));
  if (label) {
    const enumTag = document.createElement('span');
    enumTag.className = 'tip-enum';
    enumTag.textContent = relation.relationship;
    frag.appendChild(enumTag);
  }
  return frag;
}

function renderTooltip(el: HTMLElement, props: Record<string, unknown>, relation: RelationRecord | null): void {
  const name = text(props.name);
  const subject = text(props.subject);
  const abbrev = text(props.abbrev);
  const precision = typeof props.precision === 'number' ? props.precision : null;
  const color = typeof props.color === 'string' ? props.color : '#9aa0a6';

  el.replaceChildren();

  const head = document.createElement('div');
  head.className = 'tip-head';
  const swatch = document.createElement('span');
  swatch.className = 'tip-swatch';
  swatch.style.background = color;
  const title = document.createElement('span');
  title.className = name ? 'tip-name' : 'tip-name is-muted';
  title.textContent = name ?? '未命名区域';
  head.append(swatch, title);
  el.appendChild(head);

  const rows: [string, string | HTMLElement][] = [];
  if (subject && subject !== name) rows.push(['政权', subject]);
  if (abbrev && abbrev !== name && abbrev !== subject) rows.push(['简称', abbrev]);
  if (precision != null && PRECISION_LABEL[precision]) rows.push(['边界', PRECISION_LABEL[precision]]);

  // 关系层（旁挂 sidecar）：仅对已裁定（resolved）的 feature 追加两行；
  // unresolved 与无记录时提示框完全保持原样（V1：颜色/身份不受关系层影响）
  if (relation && relation.resolutionStatus === 'resolved') {
    rows.push(['关系', relationshipValue(relation)]);
    rows.push(['治理主体', relation.authorityId ? authorityLabel(relation.authorityId) : '—']);
  }

  for (const [key, value] of rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    const k = document.createElement('span');
    k.className = 'tip-key';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'tip-value';
    if (typeof value === 'string') v.textContent = value;
    else v.appendChild(value);
    row.append(k, v);
    el.appendChild(row);
  }
}

type Props = { data: YearData | null; relations: RelationSidecar | null };

/**
 * 地图组件。整个生命周期内只创建一次 MapLibre Map、只创建一个 historical source。
 * 年份切换 = source.setData()，绝不 remove / re-add 图层。
 * relations 只是提示框用的旁挂查找表，永不进入 GeoJSON / setData。
 */
export function MapView({ data, relations }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<YearData | null>(null);
  const hoveredIdRef = useRef<number | null>(null);
  const relationsRef = useRef<RelationSidecar | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: buildStyle(),
      center: [0, 22],
      zoom: 1.35,
      minZoom: 0,
      maxZoom: 10,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const applyPending = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source || !pendingRef.current) return;
      source.setData(pendingRef.current);
      pendingRef.current = null;
    };

    const clearHover = () => {
      if (hoveredIdRef.current != null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredIdRef.current }, { hover: false });
        hoveredIdRef.current = null;
      }
    };

    map.on('load', () => {
      readyRef.current = true;
      applyPending();

      map.on('mousemove', FILL_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        const tip = tooltipRef.current;
        if (!feature || !tip) return;

        const id = typeof feature.id === 'number' ? feature.id : null;
        if (id !== hoveredIdRef.current) {
          clearHover();
          if (id != null) {
            map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
            hoveredIdRef.current = id;
          }
        }

        const relation = id != null ? (relationsRef.current?.features?.[String(id)] ?? null) : null;
        renderTooltip(tip, (feature.properties ?? {}) as Record<string, unknown>, relation);
        tip.hidden = false;
        positionTooltip(tip, container, e.point.x, e.point.y);
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', FILL_LAYER_ID, () => {
        clearHover();
        if (tooltipRef.current) tooltipRef.current.hidden = true;
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      readyRef.current = false;
      pendingRef.current = null;
      hoveredIdRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // 关系层旁挂数据变化 → 只更新查找表引用，绝不进入 setData、绝不改动 GeoJSON
  useEffect(() => {
    relationsRef.current = relations;
  }, [relations]);

  // 年份数据变化 → setData（唯一的更新路径）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!readyRef.current) {
      pendingRef.current = data;
      return;
    }
    if (!data) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    // setData 之后旧的 feature-state 会失效，先整体清掉
    map.removeFeatureState({ source: SOURCE_ID });
    hoveredIdRef.current = null;
    if (tooltipRef.current) tooltipRef.current.hidden = true;
    source.setData(data);
  }, [data]);

  return (
    <>
      <div ref={containerRef} className="map" />
      <div ref={tooltipRef} className="tooltip" hidden />
    </>
  );
}
