import crypto from 'node:crypto';
import Mustache from 'mustache';
import { parseFragment } from 'parse5';
import { AppError } from '../../../utils/AppError.js';

/**
 * Safe authoring contract for uploaded proposal templates (Agency Workspace A6).
 *
 * A template is a body fragment, not a document: it may contain layout markup,
 * static `<style>` CSS and Mustache interpolation/sections. Unknown tokens are
 * rejected rather than rendered blank. Scripts, embedded documents, forms,
 * event handlers, remote URLs and dynamic CSS are rejected before bytes are
 * stored, so the PDF worker only ever renders a reviewed, self-contained file.
 */

export const AGENCY_TEMPLATE_SCHEMA_VERSION = 1;
export const AGENCY_TEMPLATE_MAX_BYTES = 512 * 1024;

type FieldKind = 'scalar' | 'object' | 'list' | 'string-list';
interface TemplateField {
  kind: FieldKind;
  fields?: Record<string, TemplateField>;
  /** Values only an internal desk copy may reference. */
  internalOnly?: boolean;
}

const scalar: TemplateField = { kind: 'scalar' };
const internalScalar: TemplateField = { kind: 'scalar', internalOnly: true };
const object = (fields: Record<string, TemplateField>): TemplateField => ({
  kind: 'object',
  fields,
});
const list = (fields: Record<string, TemplateField>): TemplateField => ({
  kind: 'list',
  fields,
});
const stringList: TemplateField = { kind: 'string-list' };

/**
 * The complete token vocabulary. The renderer's view builder must expose
 * exactly these values; anything else is an unknown token and fails upload.
 */
const TEMPLATE_CONTRACT: TemplateField = object({
  agency: object({
    name: scalar,
    address: scalar,
    phone: scalar,
    email: scalar,
    website: scalar,
    instagram: scalar,
    gstin: scalar,
    primaryColor: scalar,
    accentColor: scalar,
  }),
  trip: object({
    title: scalar,
    destination: scalar,
    startDate: scalar,
    endDate: scalar,
    durationDays: scalar,
    nights: scalar,
    groupType: scalar,
    season: scalar,
  }),
  client: object({
    name: scalar,
    email: scalar,
    phone: scalar,
    adults: scalar,
    children: scalar,
    rooms: scalar,
  }),
  quote: object({
    number: scalar,
    version: scalar,
    status: scalar,
    statusLabel: scalar,
    date: scalar,
    validUntil: scalar,
    currency: scalar,
    total: scalar,
    totalFormatted: scalar,
    perPerson: scalar,
    perPersonFormatted: scalar,
    inclusions: stringList,
    exclusions: stringList,
    terms: stringList,
  }),
  days: list({
    day: scalar,
    pageNumber: scalar,
    date: scalar,
    title: scalar,
    summary: scalar,
    permitRequired: scalar,
    imageDataUrl: scalar,
    activities: list({
      time: scalar,
      title: scalar,
      description: scalar,
      location: scalar,
      costFormatted: internalScalar,
    }),
    stays: list({
      name: scalar,
      location: scalar,
      vibe: scalar,
      description: scalar,
      pricePerNightFormatted: internalScalar,
    }),
    food: stringList,
    transport: stringList,
    tips: stringList,
  }),
  recommendations: stringList,
  thingsToCarry: stringList,
  cancellationPolicy: stringList,
  contact: object({
    phone: scalar,
    email: scalar,
    website: scalar,
    instagram: scalar,
  }),
  assets: object({
    logoDataUrl: scalar,
    mascotDataUrl: scalar,
    coverImageDataUrl: scalar,
    headingFontFamily: scalar,
    bodyFontFamily: scalar,
  }),
  generatedAt: scalar,
  watermark: scalar,
  statusLabel: scalar,
  internal: scalar,
});

const ALLOWED_TAGS = new Set([
  'section',
  'div',
  'header',
  'footer',
  'main',
  'article',
  'aside',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'small',
  'sub',
  'sup',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'blockquote',
  'img',
  'style',
]);

const ALLOWED_ATTRS = new Set([
  'class',
  'style',
  'src',
  'alt',
  'width',
  'height',
  'colspan',
  'rowspan',
  'role',
  'title',
  'aria-label',
  'aria-hidden',
]);

const IMAGE_SRC_TOKENS = new Set([
  'logoDataUrl',
  'mascotDataUrl',
  'coverImageDataUrl',
  'imageDataUrl',
]);

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;
const SIMPLE_TOKEN = /^\{\{\s*([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\s*\}\}$/;
const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;

const CSS_FORBIDDEN = [
  { pattern: /@import\b/i, label: '@import' },
  { pattern: /url\s*\(/i, label: 'url()' },
  { pattern: /expression\s*\(/i, label: 'expression()' },
  { pattern: /behavior\s*:/i, label: 'behavior' },
  { pattern: /-moz-binding\s*:/i, label: '-moz-binding' },
  { pattern: /javascript\s*:/i, label: 'javascript:' },
  { pattern: /vbscript\s*:/i, label: 'vbscript:' },
  { pattern: /data\s*:\s*text\/html/i, label: 'data:text/html' },
];

export interface ValidatedAgencyTemplateSource {
  source: string;
  bytes: number;
  checksum: string;
  pageCount: number;
  tokens: string[];
  sections: string[];
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}

function fail(message: string): never {
  throw new AppError(message, 400);
}

function decodeSource(input: Buffer | string): string {
  const byteLength =
    typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : input.byteLength;
  if (byteLength > AGENCY_TEMPLATE_MAX_BYTES) {
    fail(
      `Templates must be smaller than ${Math.floor(
        AGENCY_TEMPLATE_MAX_BYTES / 1024
      )} KB.`
    );
  }
  if (byteLength === 0) fail('Choose a template file to upload.');

  let source: string;
  if (typeof input === 'string') {
    source = input;
  } else {
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      fail('Templates must be UTF-8 HTML files.');
    }
  }

  if (!source.trim()) fail('Choose a template file to upload.');
  if (source.includes('\u0000')) fail('Templates must be UTF-8 HTML files.');
  return source;
}

function cssProblem(css: string): string | null {
  if (/\{\{|\}\}/.test(css)) {
    return 'Dynamic values are not allowed in CSS; use the injected brand variables.';
  }
  // CSS escapes can hide otherwise blocked constructs (for example u\72l()).
  if (css.includes('\\')) {
    return 'CSS escapes are not allowed in templates.';
  }
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of CSS_FORBIDDEN) {
    if (rule.pattern.test(normalized)) {
      return `CSS may not use ${rule.label}.`;
    }
  }
  return null;
}

function looksLikeToken(value: string): boolean {
  return value.includes('{{') || value.includes('}}');
}

function validateStyleAttribute(value: string): void {
  if (looksLikeToken(value)) {
    fail('Dynamic values are not allowed in style attributes.');
  }
  const problem = cssProblem(value);
  if (problem) fail(problem);
}

function validateImageSource(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) fail('Every image needs a source token.');
  if (DATA_IMAGE.test(trimmed)) return;
  // `{{.}}` is valid inside `{{#imageDataUrl}}`; the token walker checks it.
  if (/^\{\{\s*\.\s*\}\}$/.test(trimmed)) return;

  const token = SIMPLE_TOKEN.exec(trimmed);
  if (!token) {
    fail('Image sources must be template image tokens or embedded data images.');
  }
  const leaf = token[1].split('.').pop() ?? '';
  if (!IMAGE_SRC_TOKENS.has(leaf)) {
    fail(`{{${token[1]}}} is not an image token.`);
  }
}

function validateAttribute(name: string, value: string, tag: string): void {
  if (name.startsWith('on')) {
    fail(`Event handler attributes are not allowed (${name}).`);
  }
  if (!ALLOWED_ATTRS.has(name) && !/^aria-[a-z-]+$/.test(name)) {
    fail(`The ${name} attribute is not allowed.`);
  }

  if (name === 'src') {
    if (tag !== 'img') fail('The src attribute is only allowed on images.');
    validateImageSource(value);
    return;
  }
  if (name === 'style') {
    validateStyleAttribute(value);
    return;
  }
  if (name === 'class' || name === 'role' || name.startsWith('aria-')) {
    if (looksLikeToken(value)) {
      fail(`Dynamic values are not allowed in ${name} attributes.`);
    }
    return;
  }
  if (name === 'width' || name === 'height') {
    if (
      looksLikeToken(value) ||
      !/^\d{1,4}(?:\.\d{1,2})?(?:px|mm|cm|%)?$/.test(value.trim())
    ) {
      fail(`${name} must be a static size such as 120mm or 50%.`);
    }
    return;
  }
  if (name === 'colspan' || name === 'rowspan') {
    if (!/^\d{1,3}$/.test(value.trim())) {
      fail(`${name} must be a number.`);
    }
    return;
  }
  // alt/title may interpolate escaped text; the token walker validates names.
}

function validateMarkup(source: string): void {
  // parseFragment silently drops <html>/<head>/<body>, so reject a complete
  // document before parsing rather than accepting it as a harmless fragment.
  if (/<\s*(?:!doctype|html|head|body)\b/i.test(source)) {
    fail('Upload a body fragment, not a complete HTML document.');
  }

  let fragment: any;
  try {
    fragment = parseFragment(source);
  } catch {
    fail('The template HTML could not be parsed.');
  }

  const walk = (node: HtmlNode): void => {
    if (node.nodeName === '#text' || node.nodeName === '#comment') return;

    const tag = String(node.tagName ?? '').toLowerCase();
    if (!tag) return;
    if (!ALLOWED_TAGS.has(tag)) {
      fail(`The <${tag}> element is not allowed in templates.`);
    }

    for (const attr of node.attrs ?? []) {
      validateAttribute(attr.name.toLowerCase(), attr.value, tag);
    }

    if (tag === 'style') {
      const css = (node.childNodes ?? [])
        .filter((child) => child.nodeName === '#text')
        .map((child) => child.value ?? '')
        .join('\n');
      const problem = cssProblem(css);
      if (problem) fail(problem);
      return;
    }

    for (const child of node.childNodes ?? []) {
      walk(child);
    }
  };

  for (const child of fragment.childNodes ?? []) {
    walk(child);
  }
}

function fieldAt(path: string): TemplateField | null {
  if (!path) return TEMPLATE_CONTRACT;
  let current: TemplateField | undefined = TEMPLATE_CONTRACT;
  for (const part of path.split('.')) {
    current = current?.fields?.[part];
    if (!current) return null;
  }
  return current;
}

interface ResolvedToken {
  path: string;
  field: TemplateField;
}

function resolveToken(stack: string[], name: string): ResolvedToken | null {
  if (name === '.') {
    const currentPath = stack[stack.length - 1];
    const field = currentPath ? fieldAt(currentPath) : null;
    if (field && (field.kind === 'scalar' || field.kind === 'string-list')) {
      return { path: currentPath, field };
    }
    return null;
  }
  if (!TOKEN_NAME.test(name)) return null;

  // Mustache resolves a name against the current context and then walks up
  // through parent contexts. Mirror that so nested sections can use both
  // `{{title}}` and `{{trip.title}}`. Stack entries are full field paths.
  for (let index = stack.length; index >= 0; index -= 1) {
    const path = index === 0 ? name : `${stack[index - 1]}.${name}`;
    const field = fieldAt(path);
    if (field) return { path, field };
  }
  return null;
}

function validateTokens(
  source: string,
  audience: 'client' | 'internal'
): {
  tokens: Set<string>;
  sections: Set<string>;
  hasDays: boolean;
} {
  let parsed: any[];
  try {
    parsed = Mustache.parse(source) as any[];
  } catch {
    fail('The template syntax is invalid. Check every {{#section}} has a matching close.');
  }

  const tokens = new Set<string>();
  const sections = new Set<string>();
  let hasDays = false;

  const walk = (nodes: any[], stack: string[]): void => {
    for (const token of nodes) {
      const type = String(token[0]);
      const name = String(token[1] ?? '');
      if (type === 'text' || type === '!') continue;
      if (type === '&') {
        fail('Unescaped {{{tokens}}} are not allowed; use {{tokens}}.');
      }
      if (type === '>') fail('Template partials are not allowed.');
      if (type === '=') fail('Custom Mustache delimiters are not allowed.');
      if (type === '/') fail('The template has an unexpected closing section.');

      if (type === 'name') {
        const resolved = resolveToken(stack, name);
        if (!resolved) fail(`Unknown template token {{${name}}}.`);
        if (resolved.field.internalOnly && audience !== 'internal') {
          fail(`{{${resolved.path}}} is only available in internal templates.`);
        }
        const isListValue = name === '.' && resolved.field.kind === 'string-list';
        if (resolved.field.kind !== 'scalar' && !isListValue) {
          fail(`{{${name}}} must be used as a section, not a value.`);
        }
        tokens.add(resolved.path);
        continue;
      }

      if (type === '#' || type === '^') {
        const resolved = resolveToken(stack, name);
        if (!resolved) fail(`Unknown template section {{${type}${name}}}.`);
        if (resolved.field.internalOnly && audience !== 'internal') {
          fail(`{{${resolved.path}}} is only available in internal templates.`);
        }
        sections.add(resolved.path);
        if (type === '#' && resolved.path === 'days') hasDays = true;
        const nextStack = type === '#' ? [...stack, resolved.path] : stack;
        walk(Array.isArray(token[4]) ? token[4] : [], nextStack);
        continue;
      }

      fail(`The template token type "${type}" is not allowed.`);
    }
  };

  walk(parsed, []);
  return { tokens, sections, hasDays };
}

export function countTemplatePages(html: string): number {
  const fragment: any = parseFragment(html);
  let count = 0;
  const walk = (node: HtmlNode): void => {
    const classes = (node.attrs ?? []).find((attr) => attr.name === 'class')?.value;
    if (classes && classes.split(/\s+/).includes('page')) count += 1;
    for (const child of node.childNodes ?? []) walk(child);
  };
  for (const child of fragment.childNodes ?? []) walk(child);
  return count;
}

export function templateSourceChecksum(source: string): string {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

/** Renders an already-validated fragment. Never pass unvalidated uploads. */
export function renderAgencyTemplateFragment(
  source: string,
  view: Record<string, unknown>
): string {
  return Mustache.render(source, view);
}

const VALIDATION_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A realistic fixture used to prove the template renders at least one page. */
export function buildTemplateValidationView(): Record<string, unknown> {
  const days = [1, 2].map((day) => ({
    day,
    pageNumber: day,
    date: `05 Nov 2026`,
    title: day === 1 ? 'Arrive in Kaza' : 'Slow day in Kaza',
    summary: 'A measured day with time to acclimatise and look around.',
    permitRequired: day === 2,
    imageDataUrl: VALIDATION_IMAGE,
    activities: [
      {
        time: '08:30',
        title: 'Morning walk',
        description: 'A gentle walk through the bazaar and old town.',
        location: 'Kaza',
        costFormatted: 'INR 450.00',
      },
    ],
    stays: [
      {
        name: 'Hotel Kaza',
        location: 'Kaza',
        vibe: 'Quiet and warm',
        description: 'A small family-run property.',
        pricePerNightFormatted: 'INR 3,200.00',
      },
    ],
    food: ['Sol Cafe', 'Taste of Spiti'],
    transport: ['Private Innova'],
    tips: ['Carry cash; ATMs are unreliable above Kaza.'],
  }));

  return {
    agency: {
      name: 'Himalaya Trails',
      address: '12 Camp Road, Pune',
      phone: '+91 99999 00000',
      email: 'hello@himalaya.test',
      website: 'https://himalaya.test',
      instagram: '@himalayatrails',
      gstin: '27AAPFU0939F1ZV',
      primaryColor: '#0F766E',
      accentColor: '#F59E0B',
    },
    trip: {
      title: 'Spiti Valley Slow Road',
      destination: 'Spiti Valley',
      startDate: '05 Nov 2026',
      endDate: '06 Nov 2026',
      durationDays: 2,
      nights: 1,
      groupType: 'Family',
      season: 'Autumn',
    },
    client: {
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+91 88888 11111',
      adults: 2,
      children: 1,
      rooms: 1,
    },
    quote: {
      number: 'Q-2026-0042',
      version: 2,
      status: 'sent',
      statusLabel: 'Q-2026-0042 · SENT',
      date: '01 Oct 2026',
      validUntil: '31 Dec 2026',
      currency: 'INR',
      total: 1268.89,
      totalFormatted: 'INR 1,268.89',
      perPerson: 422.96,
      perPersonFormatted: 'INR 422.96',
      inclusions: ['Airport transfers', 'All stays'],
      exclusions: ['Lunch on day 2'],
      terms: ['50% deposit confirms the booking.'],
    },
    days,
    recommendations: ['Key Monastery at dawn', 'Chandratal under the stars'],
    thingsToCarry: ['Down jacket', 'Reusable bottle'],
    cancellationPolicy: ['50% deposit confirms the booking.'],
    contact: {
      phone: '+91 99999 00000',
      email: 'hello@himalaya.test',
      website: 'https://himalaya.test',
      instagram: '@himalayatrails',
    },
    assets: {
      logoDataUrl: VALIDATION_IMAGE,
      mascotDataUrl: VALIDATION_IMAGE,
      coverImageDataUrl: VALIDATION_IMAGE,
      headingFontFamily: 'Fraunces',
      bodyFontFamily: 'Inter',
    },
    generatedAt: '22 Oct 2026, 10:00',
    watermark: 'DRAFT',
    statusLabel: 'Q-2026-0042 · SENT',
    internal: false,
  };
}

export function validateAgencyTemplateSource(
  input: Buffer | string,
  options: { audience?: 'client' | 'internal' } = {}
): ValidatedAgencyTemplateSource {
  const source = decodeSource(input);
  validateMarkup(source);
  const { tokens, sections, hasDays } = validateTokens(
    source,
    options.audience ?? 'client'
  );
  if (!hasDays) {
    fail('Templates must include a {{#days}} section for the itinerary.');
  }

  const rendered = renderAgencyTemplateFragment(source, buildTemplateValidationView());
  const pageCount = countTemplatePages(rendered);
  if (pageCount === 0) {
    fail(
      'Templates must render at least one page. Add <section class="page"> around each page.'
    );
  }

  return {
    source,
    bytes: Buffer.byteLength(source, 'utf8'),
    checksum: templateSourceChecksum(source),
    pageCount,
    tokens: [...tokens].sort(),
    sections: [...sections].sort(),
  };
}

// Version sources are unique per upload; caching them would retain every
// agency's HTML in memory for the life of the process.
Mustache.templateCache = undefined;
