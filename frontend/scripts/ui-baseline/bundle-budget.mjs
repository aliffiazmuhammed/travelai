/**
 * C-29 static performance budgets.
 *
 * Vite writes `dist/.vite/manifest.json`, so this check measures the bytes the
 * browser actually fetches for a route instead of guessing chunk names. It runs
 * after `vite build` in `npm run verify`; there is no browser here, so LCP and
 * CLS stay a documented manual baseline (see
 * docs/ui-review/baseline/phase-9-baseline.md).
 *
 * Usage: node scripts/ui-baseline/bundle-budget.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const MANIFEST = path.join(DIST, '.vite', 'manifest.json');

const KiB = 1024;

/** Raw-byte ceilings, measured before compression. */
const BUDGETS = {
  initial: 540 * KiB,
  sharedTrip: 700 * KiB,
  explore: 640 * KiB,
  dashboard: 960 * KiB,
  auth: 560 * KiB,
  images: 2300 * KiB,
};

/** Chunks the public share route must never pull into its initial graph. */
const SHARED_FORBIDDEN = [
  'vendor-map',
  'vendor-charts',
  'PdfDocumentViewer',
  'pdfExport',
  'html2canvas',
  'chatCrypto',
  'useTripChatCrypto',
  'CommentsTab',
  'DiscussionDrawer',
  'ItineraryDisplay',
];

const ROUTES = {
  sharedTrip: 'src/pages/SharedTrip.tsx',
  explore: 'src/pages/Explore.tsx',
  dashboard: 'src/pages/Dashboard.tsx',
  auth: 'src/pages/Auth.tsx',
};

function fail(message) {
  console.error(`\nBundle budget check failed: ${message}\n`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {
  fail(
    `${path.relative(process.cwd(), MANIFEST)} is missing. Run the production build first.`
  );
}

function entry(key) {
  const record = manifest[key];
  if (!record) fail(`the build manifest has no entry for ${key}`);
  return record;
}

function chunkBytes(key) {
  const file = entry(key).file;
  try {
    return statSync(path.join(DIST, file)).size;
  } catch {
    fail(`chunk file is missing from dist: ${file}`);
  }
}

/** Every chunk a route needs before it can render, following static imports. */
function staticClosure(key) {
  const seen = new Set();
  const visit = (current) => {
    if (seen.has(current)) return;
    seen.add(current);
    for (const imported of entry(current).imports ?? []) visit(imported);
  };
  visit(key);
  return seen;
}

function routeClosure(key) {
  const chunks = staticClosure('index.html');
  for (const chunk of staticClosure(key)) chunks.add(chunk);
  if (key === 'index.html') return staticClosure(key);
  return chunks;
}

function routeBytes(key) {
  return [...routeClosure(key)].reduce(
    (total, chunk) => total + chunkBytes(chunk),
    0
  );
}

function imageBytes() {
  const assets = path.join(DIST, 'assets');
  return readdirSync(assets)
    .filter((file) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(file))
    .reduce((total, file) => total + statSync(path.join(assets, file)).size, 0);
}

const results = [];
const record = (label, bytes, budget) => {
  results.push({ label, bytes, budget, ok: bytes <= budget });
};

record('initial JS (/)', routeBytes('index.html'), BUDGETS.initial);
for (const [name, key] of Object.entries(ROUTES)) {
  record(`${name} JS`, routeBytes(key), BUDGETS[name]);
}
record('images in dist/assets', imageBytes(), BUDGETS.images);

// The share route is the public, unauthenticated path: its static graph must
// not contain the map, chart, PDF or chat/crypto libraries.
const sharedChunks = routeClosure(ROUTES.sharedTrip);
const forbidden = SHARED_FORBIDDEN.filter((needle) =>
  [...sharedChunks].some((chunk) => chunk.includes(needle))
);

// Leaflet's stylesheet belongs to the map chunk, not the initial document.
const initialCss = entry('index.html').css ?? [];
const leafletInInitialCss = initialCss.filter((file) => {
  try {
    return readFileSync(path.join(DIST, file), 'utf8').includes('.leaflet-pane');
  } catch {
    fail(`stylesheet is missing from dist: ${file}`);
  }
});

const format = (bytes) => `${(bytes / KiB).toFixed(1)} KiB`;
console.log('Bundle budgets (raw bytes, Vite manifest)');
for (const result of results) {
  console.log(
    `  ${result.ok ? 'ok  ' : 'FAIL'} ${result.label}: ${format(result.bytes)} / ${format(result.budget)}`
  );
}

const problems = [];
for (const result of results) {
  if (!result.ok) {
    problems.push(
      `${result.label} is ${format(result.bytes)} (budget ${format(result.budget)})`
    );
  }
}
if (forbidden.length > 0) {
  problems.push(
    `the shared-trip route pulls in ${forbidden.join(', ')} before interaction`
  );
}
if (leafletInInitialCss.length > 0) {
  problems.push(
    `Leaflet CSS is bundled into the initial document (${leafletInInitialCss.join(', ')})`
  );
}

if (problems.length > 0) {
  fail(problems.join('\n  - '));
}

console.log('All bundles are within budget; the shared route stays lightweight.');
