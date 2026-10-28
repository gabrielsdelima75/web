// Generates public/landing/globe-dots.json — the land dots of the welcome
// page's globe, each tagged with its country. Run once whenever the grid or
// the source map changes:
//
//   node scripts/generate-globe-dots.mjs
//
// Keeps point-in-polygon work and the 50m world map off the client, which
// only has to project a few thousand points.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { geoBounds, geoCentroid, geoContains } from "d3-geo";
import { feature } from "topojson-client";
import countries from "i18n-iso-countries";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const OUT_PATH = resolve(__dirname, "../public/landing/globe-dots.json");

// Degrees between dots, along and across latitude rows, so the dots sit evenly
// over the sphere instead of bunching towards the poles.
const STEP = 1.75;
const SOUTH = -56;
const NORTH = 82;

const world = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"),
);

const shapes = feature(world, world.objects.countries)
  .features.filter((shape) => shape.id !== "010")
  .map((shape) => ({
    shape,
    code: shape.id ? (countries.numericToAlpha2(shape.id) ?? null) : null,
    bounds: geoBounds(shape),
  }));

// France's shape carries French Guiana, which Cloudflare reports as GF.
function codeAt(code, lon) {
  return code === "FR" && lon < -20 ? "GF" : code;
}

function shapeAt(lon, lat) {
  for (const entry of shapes) {
    const [[west, south], [east, north]] = entry.bounds;
    if (lat < south || lat > north) continue;
    if (west <= east ? lon < west || lon > east : lon < west && lon > east) {
      continue;
    }
    if (geoContains(entry.shape, [lon, lat])) return entry;
  }
  return null;
}

const dots = [];
for (let lat = SOUTH; lat <= NORTH; lat += STEP) {
  const n = Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP);
  for (let i = 0; i < n; i++) {
    const lon = -180 + (i * 360) / n;
    const entry = shapeAt(lon, lat);
    if (entry) dots.push({ lon, lat, code: codeAt(entry.code, lon) });
  }
}

// A country too small to catch a grid point still gets one dot, or a panel
// there would light nothing.
const dotted = new Set(dots.map((dot) => dot.code));
for (const { shape, code } of shapes) {
  if (!code || dotted.has(code)) continue;
  const [lon, lat] = geoCentroid(shape);
  dots.push({ lon, lat, code });
  dotted.add(code);
}

// Where the globe turns to for a country: the mean of its dots, so a mainland
// outweighs its islands.
const sums = {};
for (const { lon, lat, code } of dots) {
  if (!code) continue;
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const sum = (sums[code] ??= [0, 0, 0]);
  sum[0] += Math.cos(p) * Math.cos(l);
  sum[1] += Math.cos(p) * Math.sin(l);
  sum[2] += Math.sin(p);
}

const round = (value) => Math.round(value * 100) / 100;
const codes = Object.keys(sums).sort();
const centres = Object.fromEntries(
  codes.map((code) => {
    const [x, y, z] = sums[code];
    return [
      code,
      [
        round((Math.atan2(y, x) * 180) / Math.PI),
        round((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
      ],
    ];
  }),
);

writeFileSync(
  OUT_PATH,
  JSON.stringify({
    codes,
    // Flat [lon, lat, code index] triples; -1 is land with no country code.
    dots: dots.flatMap(({ lon, lat, code }) => [
      round(lon),
      round(lat),
      code ? codes.indexOf(code) : -1,
    ]),
    centres,
  }) + "\n",
);

console.log(`Wrote ${dots.length} dots for ${codes.length} countries`);
