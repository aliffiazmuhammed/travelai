#!/usr/bin/env node
/**
 * Contrast gate for the declared theme tokens.
 *
 * Reads the HSL triples from src/index.css, resolves each realm/mode the same
 * way the browser does, and checks the text pairs the UI actually depends on.
 * No dependencies, no browser: this runs in CI and locally.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, "../../src/index.css");
// Strip comments so a comment above a rule is not read as part of its selector.
const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Walk every declaration block and merge the custom properties of the exact
 * selector. Selector lists are split on commas so `.dark` does not match the
 * `.dark` suffix of `[data-theme="agency"].dark`.
 */
function declarationsFor(selector) {
  const declarations = {};
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!selectors.includes(selector)) continue;
    for (const token of block[2].matchAll(
      /--([\w-]+)\s*:\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/g
    )) {
      declarations[token[1]] = token.slice(2, 5).map(Number);
    }
  }
  return declarations;
}

function tokensFor(realm, dark) {
  const layers = [":root"];
  if (dark) layers.push(".dark");
  if (realm !== "traveller") layers.push(`[data-theme="${realm}"]`);
  if (realm !== "traveller" && dark) {
    layers.push(`[data-theme="${realm}"].dark`);
  }
  return Object.assign({}, ...layers.map(declarationsFor));
}

function hslToRgb([h, s, l]) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return (
      lightness -
      chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    );
  };
  return [channel(0), channel(8), channel(4)];
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((value) =>
    value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort(
    (x, y) => y - x
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = [
  { name: "traveller light", realm: "traveller", dark: false },
  { name: "traveller dark", realm: "traveller", dark: true },
  { name: "agency light", realm: "agency", dark: false },
  { name: "agency dark", realm: "agency", dark: true },
  { name: "admin dark", realm: "admin", dark: true },
];

const checks = [
  { fg: "foreground", bg: "background", min: 4.5 },
  { fg: "foreground", bg: "card", min: 4.5 },
  { fg: "muted-foreground", bg: "background", min: 4.5 },
  { fg: "accent-ink", bg: "background", min: 4.5 },
  { fg: "accent-ink", bg: "card", min: 4.5 },
  { fg: "accent-foreground", bg: "accent", min: 4.5 },
  { fg: "primary-foreground", bg: "primary", min: 4.5 },
  { fg: "agency-accent-ink", bg: "agency-canvas", min: 4.5 },
  { fg: "agency-accent-ink", bg: "agency-panel", min: 4.5 },
  { fg: "agency-accent-foreground", bg: "agency-accent", min: 4.5 },
  { fg: "admin-accent-ink", bg: "background", min: 4.5 },
  { fg: "admin-accent-ink", bg: "card", min: 4.5 },
  { fg: "admin-accent-foreground", bg: "admin-accent", min: 4.5 },
  // Status text sits on 10% tints of its own hue; the untinted page is the
  // closest solid proxy the token layer exposes.
  { fg: "success-ink", bg: "background", min: 4.5 },
  { fg: "success-ink", bg: "card", min: 4.5 },
  { fg: "warning-ink", bg: "background", min: 4.5 },
  { fg: "warning-ink", bg: "card", min: 4.5 },
  { fg: "info-ink", bg: "background", min: 4.5 },
  { fg: "info-ink", bg: "card", min: 4.5 },
  { fg: "destructive-ink", bg: "background", min: 4.5 },
  { fg: "destructive-ink", bg: "card", min: 4.5 },
  { fg: "surface-brand-ink", bg: "surface-brand", min: 4.5 },
];

let failed = 0;
let missing = 0;

console.log("waytowalk contrast check\n");
for (const theme of themes) {
  const tokens = tokensFor(theme.realm, theme.dark);
  console.log(theme.name);
  for (const check of checks) {
    const foreground = tokens[check.fg];
    const background = tokens[check.bg];
    // Not every theme owns every pair (e.g. traveller has no admin accent).
    if (!foreground || !background) {
      if (
        (check.fg.startsWith("agency-") && theme.realm !== "agency") ||
        (check.fg.startsWith("admin-") && theme.realm !== "admin")
      ) {
        continue;
      }
      console.log(`  MISSING ${check.fg} on ${check.bg}`);
      missing += 1;
      continue;
    }
    const ratio = contrast(hslToRgb(foreground), hslToRgb(background));
    const ok = ratio >= check.min;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"} ${check.fg} on ${check.bg}: ${ratio.toFixed(2)}:1 (min ${check.min}:1)`
    );
  }
  console.log("");
}

if (missing > 0) {
  console.error(`Missing token pairs: ${missing}`);
}
if (failed > 0) {
  console.error(`Contrast failures: ${failed}`);
}
if (failed > 0 || missing > 0) process.exit(1);
console.log("All declared text pairs pass.");
