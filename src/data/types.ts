import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';

/**
 * 构建产物中每个 feature 的属性。
 * 由 scripts/build-data.mjs 生成，键名经过瘦身：
 *   NAME→name  ABBREVN→abbrev  SUBJECTO→subject  PARTOF→partOf  BORDERPRECISION→precision
 */
export type HistProperties = {
  /**
   * 历史政权身份（Historical Polity），由 data/identity/aliases.json + 空档切分解析而来。
   * 形如 "CN-QING"（手工维护）或 "auto:roman empire#1"（自动切分出的第 2 段）。
   * 没有 NAME/SUBJECTO 的要素统一归入 "UNNAMED"。
   */
  entityId: string;
  name: string | null;
  abbrev: string | null;
  subject: string | null;
  partOf: string | null;
  /** 1 = 近似边界，2 = 中等，3 = 国际法定；上游部分年份为 null，world_1783 有 4 个 0 */
  precision: number | null;
  /** 构建时注入的确定性颜色 #rrggbb，绑定 entityId，跨年份稳定 */
  color: string;
};

export type HistFeature = Feature<MultiPolygon, HistProperties> & { id: number };

export type YearData = FeatureCollection<MultiPolygon, HistProperties>;

export type Snapshot = {
  year: number;
  /** 相对 public/data/ 的路径，例如 "years/world_2010.json" */
  file: string;
  features: number;
  vertices: number;
  /** NAME 为 null 的 feature 数（南极洲、无人区等） */
  unnamed: number;
  bytes: number;
  bbox: [number, number, number, number];
  /** 该年份出现的不同 entityId 数量 */
  entities: number;
};

export type Manifest = {
  generatedAt: string;
  source: string;
  license: string;
  coordPrecision: number;
  /** 上游 index.json 中的全部 54 个年份（无论是否已构建） */
  allYears: number[];
  /** 已构建快照中出现的实体总数 */
  entityCount: number;
  /** 实体索引文件名，相对 public/data/，例如 "entities.json" */
  entitiesFile: string;
  /**
   * 关系层 sidecar 目录名，相对 public/data/，例如 "relations"。
   * 可选：旧版 manifest 无此键；旁挂数据，不进入 GeoJSON properties。
   */
  relationsDir?: string;
  identity: {
    aliasFile: string;
    gapSplitThreshold: number;
    manualEntities: number;
    splitKeys: number;
    distinctColors: number;
  };
  /** 已构建的快照，按年份升序 —— 这就是前端的年份序列真相 */
  snapshots: Snapshot[];
};

/**
 * public/data/relations/<year>.json 中的一条关系记录（严格五字段）。
 * 由 scripts/lib/relations-build.mjs 生成，**旁挂**于年份文件之外：
 * 不写进 GeoJSON properties，也不参与 entityId / color 的解析。
 */
export type RelationRecord = {
  entityId: string;
  /** 法理主权主体：既有 polity entityId 或 null */
  sovereignId: string | null;
  /** 实际控制 / 占领 / 军管 / 行政管理主体：auth:<SLUG> 或 null */
  authorityId: string | null;
  /** 11 项冻结枚举之一 */
  relationship: string;
  resolutionStatus: 'resolved' | 'unresolved';
};

/**
 * public/data/relations/<year>.json —— 顶层严格 { year, features }。
 * `features` 是**按 feature id 键控的对象**（不是数组），与同年 GeoJSON 的 feature id 一一对应。
 * 文件名就是年份本身（含负数年份，例如 "-5000.json"）。
 */
export type RelationSidecar = {
  year: number;
  features: Record<string, RelationRecord>;
};

/** public/data/entities.json */
export type EntityDoc = {
  count: number;
  entities: {
    id: string;
    kind: 'manual' | 'auto';
    label: string | null;
    labelEn: string | null;
    color: string;
    /** 该实体覆盖的上游 key（归一化后的代表拼写） */
    keys: string[];
    /** 手工实体的真实纪年闭区间；自动实体为 null */
    periods: [number, number][] | null;
    /** 该实体实际出现的快照年份 */
    years: number[];
  }[];
};
