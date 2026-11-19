/**
 * Minimal client-side page metadata (Milestone 8 G3).
 *
 * The SPA has no SSR, so these tags are for the browser tab, share previews in
 * chat apps that execute scripts, and accessibility tools — not for search
 * crawlers. Crawlable public pages get their head tags injected by the backend
 * SPA fallback (`backend/src/services/seo/shareMeta.ts`), which is the only
 * place a non-JS crawler can see them.
 *
 * `applyPageMeta` captures the document defaults on first use and returns a
 * cleanup that restores them, so leaving a page does not leave its title,
 * image or `noindex` behind.
 */

export interface PageMeta {
  title: string;
  description?: string;
  /** Share image, absolute or root-relative. Defaults live in `index.html`. */
  image?: string;
  imageAlt?: string;
  /** Canonical URL; defaults to the current location. */
  canonical?: string;
  /** Open Graph object type; `article` suits a public trip. */
  ogType?: 'website' | 'article' | 'profile';
  /** Canonical-ish public URL, usually `window.location.href`. */
  ogUrl?: string;
  /**
   * Robots directive. Private shells, unlisted share links and NotFound pass
   * `noindex, nofollow`; public pages leave it unset.
   */
  robots?: string;
}

type MetaAttribute = 'name' | 'property';

const META_KEYS: [MetaAttribute, string][] = [
  ['name', 'description'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:type'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:image:alt'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
  ['name', 'twitter:card'],
  ['name', 'robots'],
];

interface MetaBaseline {
  title: string;
  canonical: string | null;
  values: Map<string, string | null>;
}

const metaKey = (attribute: MetaAttribute, name: string) => `${attribute}:${name}`;

function readMeta(attribute: MetaAttribute, name: string): HTMLMetaElement | null {
  return document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${name}"]`
  );
}

function writeMeta(attribute: MetaAttribute, name: string, content: string): void {
  let element = readMeta(attribute, name);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function readCanonical(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
}

function writeCanonical(href: string): void {
  let element = readCanonical();
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

function absoluteUrl(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${window.location.origin}${path}`;
}

let baseline: MetaBaseline | null = null;

function snapshotDefaults(): MetaBaseline {
  const values = new Map<string, string | null>();
  for (const [attribute, name] of META_KEYS) {
    values.set(metaKey(attribute, name), readMeta(attribute, name)?.getAttribute('content') ?? null);
  }
  return {
    title: document.title,
    canonical: readCanonical()?.getAttribute('href') ?? null,
    values,
  };
}

function restoreDefaults(snapshot: MetaBaseline): void {
  document.title = snapshot.title;
  for (const [attribute, name] of META_KEYS) {
    const value = snapshot.values.get(metaKey(attribute, name)) ?? null;
    const element = readMeta(attribute, name);
    if (value === null) {
      element?.remove();
    } else if (element) {
      element.setAttribute('content', value);
    } else {
      writeMeta(attribute, name, value);
    }
  }

  const canonical = readCanonical();
  if (snapshot.canonical === null) {
    canonical?.remove();
  } else if (canonical) {
    canonical.setAttribute('href', snapshot.canonical);
  } else {
    writeCanonical(snapshot.canonical);
  }
}

/** Applies per-page metadata and returns the matching cleanup. */
export function applyPageMeta(meta: PageMeta): () => void {
  if (!baseline) baseline = snapshotDefaults();

  document.title = meta.title;

  if (meta.description) {
    writeMeta('name', 'description', meta.description);
    writeMeta('property', 'og:description', meta.description);
    writeMeta('name', 'twitter:description', meta.description);
  }

  if (meta.image) {
    const image = absoluteUrl(meta.image);
    writeMeta('property', 'og:image', image);
    writeMeta('name', 'twitter:image', image);
    if (meta.imageAlt) writeMeta('property', 'og:image:alt', meta.imageAlt);
    // A large card is what chat clients render for share links.
    writeMeta('name', 'twitter:card', 'summary_large_image');
  }

  if (meta.robots) writeMeta('name', 'robots', meta.robots);

  writeMeta('property', 'og:title', meta.title);
  writeMeta('name', 'twitter:title', meta.title);
  writeMeta('property', 'og:type', meta.ogType ?? 'website');

  const url = meta.ogUrl ?? window.location.href;
  writeMeta('property', 'og:url', url);
  writeCanonical(meta.canonical ?? url);

  return () => {
    if (baseline) restoreDefaults(baseline);
  };
}
