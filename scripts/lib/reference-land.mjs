import clipping from "polygon-clipping";
import { createHash } from "node:crypto";
const polys = (f) =>
  f.geometry?.type === "MultiPolygon"
    ? f.geometry.coordinates
    : f.geometry?.type === "Polygon"
      ? [f.geometry.coordinates]
      : [];
const bbox = (p) => {
  const pts = p.flat();
  return [
    Math.min(...pts.map((v) => v[0])),
    Math.min(...pts.map((v) => v[1])),
    Math.max(...pts.map((v) => v[0])),
    Math.max(...pts.map((v) => v[1])),
  ];
};
const inside = (a, b) =>
  a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlaps = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const round = (p) =>
  p.map((r) => r.map((v) => v.map((n) => Math.round(n * 1e5) / 1e5)));
export function prepareReferenceLand(documents, catalog) {
  return catalog.regions.map((region) => {
    const source = documents.get(region.sourceYear);
    if (!source)
      throw Error(`Missing geographic reference ${region.sourceYear}`);
    const components = [];
    const precisions = new Set();
    for (const f of source.features) {
      const p = f.properties ?? {};
      if ("sourceName" in region && p.NAME !== region.sourceName) continue;
      if (
        "sourceSubject" in region &&
        (p.SUBJECTO ?? null) !== region.sourceSubject
      )
        continue;
      for (const poly of polys(f)) {
        if (inside(bbox(poly), region.bounds)) {
          components.push(round(poly));
          precisions.add(p.BORDERPRECISION);
        }
      }
    }
    if (!components.length)
      throw Error(`Empty geographic reference: ${region.id}`);
    const sourceDigest = createHash("sha256")
      .update(JSON.stringify(components))
      .digest("hex");
    if (region.geometrySha256 && sourceDigest !== region.geometrySha256)
      throw Error(
        `Geographic reference changed; re-audit ${region.id} before rebuilding`,
      );
    return {
      ...region,
      coordinates: clipping.union(...components),
      sourceDigest,
      precision: precisions.size === 1 ? ([...precisions][0] ?? 1) : 1,
    };
  });
}
export function addMissingLand(document, year, references) {
  const audit = [],
    features = [...document.features];
  for (const ref of references) {
    if (year < ref.from || (ref.to !== undefined && year > ref.to)) continue;
    const owner =
      ref.ownership.find((p) => year >= p.from && year <= p.to)?.subject ??
      null;
    if (ref.existingUnnamedControl) {
      const native = features.find(
        (f) => (f.properties?.SUBJECTO || f.properties?.NAME) === owner,
      );
      if (!native && ref.controlRequiresNative) continue;
      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        if (feature.properties?.NAME || feature.properties?.SUBJECTO) continue;
        const coordinates = polys(feature).map(round);
        if (
          !coordinates.length ||
          !coordinates.every((poly) => inside(bbox(poly), ref.bounds))
        )
          continue;
        if (clipping.xor(coordinates, ref.coordinates).length) continue;
        features[i] = { ...feature, properties: { ...native.properties } };
        audit.push({
          kind: "coastline-control",
          region: ref.id,
          year,
          sourceYear: ref.sourceYear,
          subject: owner,
        });
      }
      continue;
    }
    if (ref.normalizeSourceOwnership && ref.sourceName) {
      for (let i = 0; i < features.length; i++) {
        if (features[i].properties?.NAME !== ref.sourceName) continue;
        const feature = features[i];
        features[i] = {
          ...feature,
          properties: {
            ...feature.properties,
            NAME: owner ? ref.name : null,
            SUBJECTO: owner,
            PARTOF: null,
            ABBREVN: null,
            GEOGRAPHIC_NAME: ref.name,
          },
        };
        audit.push({
          kind: "ownership-normalization",
          region: ref.id,
          year,
          previousSubject: feature.properties.SUBJECTO,
          subject: owner,
        });
      }
    }
    const coverage = features.flatMap((f) =>
      polys(f)
        .filter((p) => overlaps(bbox(p), ref.bounds))
        .map(round),
    );
    const remaining = coverage.length
      ? clipping.difference(ref.coordinates, coverage)
      : ref.coordinates;
    if (!remaining.length) continue;
    features.push({
      type: "Feature",
      properties: {
        NAME: owner ? ref.name : null,
        SUBJECTO: owner,
        PARTOF: null,
        ABBREVN: null,
        BORDERPRECISION: ref.precision,
        GEOGRAPHIC_NAME: ref.name,
      },
      geometry: { type: "MultiPolygon", coordinates: remaining },
    });
    audit.push({
      region: ref.id,
      year,
      sourceYear: ref.sourceYear,
      sourceDigest: ref.sourceDigest,
      subject: owner,
      polygons: remaining.length,
    });
  }
  return { document: { ...document, features }, audit };
}
