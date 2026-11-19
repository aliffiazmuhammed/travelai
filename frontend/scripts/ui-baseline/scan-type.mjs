#!/usr/bin/env node
/**
 * Micro-type scanner.
 *
 * Counts arbitrary 9–11px utilities in src. Phase 0 records the baseline;
 * Phase 6 flips --check to make the count a regression gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "../../src");
const pattern = /text-\[(?:9|10|11)px\]/g;
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (/\.(tsx?|jsx?|css)$/.test(entry)) files.push(path);
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
console.log("Micro-type baseline (text-[9px] | text-[10px] | text-[11px])");
console.log(`Total: ${total} uses across ${counts.length} files\n`);
for (const entry of counts.slice(0, 20)) {
  console.log(`  ${String(entry.count).padStart(3)}  ${entry.file}`);
}
if (counts.length > 20) console.log(`  … ${counts.length - 20} more files`);

if (process.argv.includes("--check") && total > 0) {
  console.error("\nMicro-type found. Use the named type scale or an allow-list.");
  process.exit(1);
}
