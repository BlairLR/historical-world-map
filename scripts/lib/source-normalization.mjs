// Source schema and topology normalization. No year/feature-ID exceptions.
import clipping from "polygon-clipping";
export function validLabel(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return !s || /^(?:[+-]?\d+(?:\.\d+)?|true|false|null|undefined)$/i.test(s)
    ? null
    : value;
}
export function sanitizeFeature(feature) {
  const p = { ...feature.properties };
  for (const field of ["NAME", "SUBJECTO", "PARTOF", "ABBREVN"])
    p[field] = validLabel(p[field]);
  return { ...feature, properties: p };
}
const vertices = (f) => f.geometry.coordinates.flat(2).length;
function area(coords) {
  return coords.reduce(
    (sum, poly) =>
      sum +
      poly.reduce((a, ring, i) => {
        let v = 0;
        for (let j = 0; j < ring.length - 1; j++)
          v += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
        return a + (i ? -1 : 1) * Math.abs(v / 2);
      }, 0),
    0,
  );
}
function bounds(f) {
  const p = f.geometry.coordinates.flat(2);
  return [
    Math.min(...p.map((v) => v[0])),
    Math.min(...p.map((v) => v[1])),
    Math.max(...p.map((v) => v[0])),
    Math.max(...p.map((v) => v[1])),
  ];
}
const intersects = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function normalizeTopology(features) {
  const removed = new Set(),
    audit = [];
  // Equivalent single-island representations with the same evidence and identity:
  // prefer the materially more detailed source, only with strong mutual overlap.
  const small = features.filter(
    (f) =>
      f.properties.entityId !== "UNNAMED" &&
      f.geometry.coordinates.length === 1 &&
      area(f.geometry.coordinates) < 25,
  );
  for (let i = 0; i < small.length; i++)
    for (let j = i + 1; j < small.length; j++) {
      const a = small[i],
        b = small[j];
      if (removed.has(a) || removed.has(b)) continue;
      if (
        JSON.stringify(a.properties) !== JSON.stringify(b.properties) ||
        !intersects(bounds(a), bounds(b))
      )
        continue;
      const va = vertices(a),
        vb = vertices(b);
      if (Math.max(va, vb) < 4 * Math.min(va, vb)) continue;
      const common = area(
        clipping.intersection(a.geometry.coordinates, b.geometry.coordinates),
      );
      if (
        common / area(a.geometry.coordinates) > 0.8 &&
        common / area(b.geometry.coordinates) > 0.8
      ) {
        const drop = va < vb ? a : b;
        removed.add(drop);
        audit.push({
          kind: "duplicate-resolution",
          removedId: drop.id,
          retainedId: drop === a ? b.id : a.id,
        });
      }
    }
  // Unnamed land is a geographic background, not overlapping political regions.
  // Dissolve intersecting unnamed features; named politics always takes precedence.
  const background = features.filter(
    (f) => f.properties.entityId === "UNNAMED",
  );
  const politicalInput = features.filter(
    (f) => f.properties.entityId !== "UNNAMED" && !removed.has(f),
  );
  const political = [];
  const merged = new Set();
  for (const seed of politicalInput) {
    if (merged.has(seed)) continue;
    const group = [seed];
    merged.add(seed);
    for (let i = 0; i < group.length; i++)
      for (const f of politicalInput) {
        if (
          merged.has(f) ||
          JSON.stringify(seed.properties) !== JSON.stringify(f.properties)
        )
          continue;
        if (!intersects(bounds(group[i]), bounds(f))) continue;
        if (
          area(
            clipping.intersection(
              group[i].geometry.coordinates,
              f.geometry.coordinates,
            ),
          ) <= 1e-8
        )
          continue;
        group.push(f);
        merged.add(f);
      }
    political.push(
      group.length === 1
        ? seed
        : {
            ...seed,
            geometry: {
              type: "MultiPolygon",
              coordinates: clipping.union(
                ...group.map((f) => f.geometry.coordinates),
              ),
            },
          },
    );
    if (group.length > 1)
      audit.push({
        kind: "same-evidence-dissolve",
        sourceIds: group.map((f) => f.id),
      });
  }
  const bgBounds = new Map(background.map((f) => [f, bounds(f)]));
  const output = [...political];
  const consumed = new Set();
  for (const seed of background) {
    if (consumed.has(seed)) continue;
    let group = [seed];
    consumed.add(seed);
    for (let k = 0; k < group.length; k++)
      for (const f of background) {
        if (
          consumed.has(f) ||
          !intersects(bgBounds.get(group[k]), bgBounds.get(f))
        )
          continue;
        // Touching coastlines need no dissolution; only actual area overlaps.
        if (
          area(
            clipping.intersection(
              group[k].geometry.coordinates,
              f.geometry.coordinates,
            ),
          ) > 1e-8
        ) {
          group.push(f);
          consumed.add(f);
        }
      }
    let coords =
      group.length === 1
        ? seed.geometry.coordinates
        : clipping.union(...group.map((f) => f.geometry.coordinates));
    const bb = bounds({ geometry: { coordinates: coords } });
    const masks = political
      .filter((f) => intersects(bb, bounds(f)))
      .map((f) => f.geometry.coordinates);
    if (masks.length) coords = clipping.difference(coords, ...masks);
    if (coords.length)
      output.push({
        ...seed,
        geometry: { type: "MultiPolygon", coordinates: coords },
      });
    if (group.length > 1)
      audit.push({
        kind: "background-dissolve",
        sourceIds: group.map((f) => f.id),
      });
  }
  output.sort((a, b) => a.id - b.id);
  return { features: output, audit };
}
