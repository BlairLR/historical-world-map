import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import clipping from "polygon-clipping";
import {
  validLabel,
  sanitizeFeature,
  normalizeTopology,
} from "../../scripts/lib/source-normalization.mjs";
const root = new URL("../../", import.meta.url);
const load = (year) =>
  JSON.parse(
    fs.readFileSync(
      new URL(
        `public/data/years/world_${year < 0 ? "bc" + -year : year}.json`,
        root,
      ),
    ),
  );
function inRing([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
const covers = (f, p) =>
  f.geometry.coordinates.some(
    (poly) => inRing(p, poly[0]) && !poly.slice(1).some((r) => inRing(p, r)),
  );
test("invalid source scalar labels never become polity names; upstream input is immutable", () => {
  for (const value of [1, "1", "3", "true", "false", "", null])
    assert.equal(validLabel(value), null);
  assert.equal(validLabel("Han"), "Han");
  const raw = { properties: { NAME: null, SUBJECTO: "1", PARTOF: "true" } };
  const before = JSON.stringify(raw);
  assert.equal(sanitizeFeature(raw).properties.SUBJECTO, null);
  assert.equal(JSON.stringify(raw), before);
  for (const f of load(100).features)
    assert.notEqual(f.properties.entityId, "auto:1");
});
test("background dissolution preserves land union and eliminates internal overlap", () => {
  const feature = (id, x) => ({
    id,
    properties: { entityId: "UNNAMED" },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [x, 0],
            [x + 2, 0],
            [x + 2, 2],
            [x, 2],
            [x, 0],
          ],
        ],
      ],
    },
  });
  const data = [feature(0, 0), feature(1, 1)];
  const n = normalizeTopology(data);
  assert.equal(n.features.length, 1);
  assert.deepEqual(
    clipping.union(...data.map((f) => f.geometry.coordinates)),
    n.features[0].geometry.coordinates,
  );
});
test("Korea overlap is eliminated to the declared five-decimal coordinate precision", () => {
  const window = [
    [
      [
        [124, 33],
        [132, 33],
        [132, 43],
        [124, 43],
        [124, 33],
      ],
    ],
  ];
  for (const year of [-323, -300, 1600]) {
    const fs = load(year).features.filter(
      (f) => clipping.intersection(f.geometry.coordinates, window).length,
    );
    for (let i = 0; i < fs.length; i++)
      for (const b of fs.slice(i + 1)) {
        if (
          fs[i].properties.entityId !== "UNNAMED" &&
          b.properties.entityId !== "UNNAMED"
        )
          continue;
        const overlap = clipping.intersection(
          fs[i].geometry.coordinates,
          b.geometry.coordinates,
          window,
        );
        const area = overlap.reduce(
          (sum, poly) =>
            sum +
            poly.reduce((a, r, i) => {
              let v = 0;
              for (let j = 0; j < r.length - 1; j++)
                v += r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1];
              return a + (i ? -1 : 1) * Math.abs(v / 2);
            }, 0),
          0,
        );
        assert.ok(area < 1e-5, `${year}: ${fs[i].id}/${b.id} overlap ${area}`);
      }
  }
});
test("Taiwan duplicate is resolved in the generated data, not by frontend year rules", () => {
  const f = load(1994).features.filter(
    (f) => f.properties.entityId === "auto:taiwan#2",
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].geometry.coordinates.flat(2).length, 254);
});

test("Joseon coastal evidence keeps one identity without an unassigned fringe", () => {
  for (const p of [[129.34637, 36.84249], [126.54818, 33.36597]]) {
    const features = load(1600).features.filter(f => covers(f, p));
    assert.equal(features.length, 1);
    assert.equal(features[0].properties.entityId, 'auto:korea#1');
  }
});
test("modern geographical sample points remain on land across all post-1938 snapshots", () => {
  const points = [
    [160.2, -9.6],
    [166.9, -15.2],
    [165.7, -21.5],
    [49.5, 80.6],
    [140, 75.3],
    [-173, 66.5],
  ];
  for (const year of [1938, 1945, 1960, 1994, 2000, 2010])
    for (const p of points)
      assert.ok(
        load(year).features.some((f) => covers(f, p)),
        `${year} missing land ${p}`,
      );
  assert.ok(
    load(1960).features.some((f) => covers(f, [147.5, 45])),
    "1960 missing Iturup",
  );
});
test("confirmed Arctic ownership is time-bound and disputed Kurils are not guessed", () => {
  for (const year of [1938, 1945, 1960, 1994, 2000, 2010]) {
    const feature = load(year).features.find((f) => covers(f, [140, 75.3]));
    assert.equal(
      feature.properties.entityId,
      year < 1992 ? "RU-USSR" : "RU-FED",
    );
  }
  assert.equal(
    load(1960).features.find((f) => covers(f, [147.5, 45])).properties.entityId,
    "UNNAMED",
  );
  assert.equal(
    load(1960).features.find((f) => covers(f, [149.8, 45.9])).properties
      .entityId,
    "RU-USSR",
  );
});
