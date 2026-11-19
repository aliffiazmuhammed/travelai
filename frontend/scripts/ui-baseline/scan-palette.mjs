#!/usr/bin/env node
/**
 * Raw Tailwind palette scanner.
 *
 * Counts default palette utilities outside the token layer. Phase 0 records
 * the baseline; C-12 flips --check once the semantic tokens own these values.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "../../src");
const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const pattern = new RegExp(
  `(?:^|[\\s"'\`:!])(?:(?:hover|focus|focus-visible|focus-within|active|disabled|group-hover|group-focus|peer-hover|peer-focus|dark|sm|md|lg|xl|2xl):)*(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|divide|outline|decoration|accent|caret)-(?:${palette})-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\\/[0-9.]+)?(?=[\\s"'\`]|$)`,
  "g"
);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(path);
  }
}

walk(sourceRoot);

const counts = [];
let total = 0;
for (const file of files) {
  const matches = readFileSync(file, "utf8").match(pattern);
  if (!matches) continue;
  total += matches.length;
  counts.push({
    file: file.slice(sourceRoot.length + 1).replaceAll("\\", "/"),
    count: matches.length,
  });
}

counts.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
console.log("Raw Tailwind palette baseline");
console.log(`Total: ${total} uses across ${counts.length} files\n`);
for (const entry of counts.slice(0, 20)) {
  console.log(`  ${String(entry.count).padStart(3)}  ${entry.file}`);
}
if (counts.length > 20) console.log(`  … ${counts.length - 20} more files`);

if (process.argv.includes("--check") && total > 0) {
  console.error("\nRaw palette utilities found outside the token layer.");
  process.exit(1);
}
