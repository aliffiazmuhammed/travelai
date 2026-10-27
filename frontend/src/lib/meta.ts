/**
 * Minimal client-side page metadata (Milestone 8 G3).
 *
 * The SPA has no SSR, so these tags are for the browser tab, share previews in
 * chat apps that do execute scripts, and accessibility tools — not for search
 * crawlers. Crawlable public pages stay deferred by design (`roadmap G3`).
 *
 * `applyPageMeta` captures the document defaults on first use and returns a
 * cleanup that restores them, so leaving the gallery does not leave its title
 * on the landing page.
 */

export interface PageMeta {
  title: string;
  description?: string;
  /** Open Graph object type; `article` suits a public trip. */
  ogType?: 'website' | 'article' | 'profile';
  /** Canonical-ish public URL, usually `window.location.href`. */
  ogUrl?: string;
}

type MetaAttribute = 'name' | 'property';

const META_KEYS: [MetaAttribute, string][] = [
  ['name', 'description'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:type'],
  ['property', 'og:url'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
];

interface MetaBaseline {
  title: string;
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

let baseline: MetaBaseline | null = null;

function snapshotDefaults(): MetaBaseline {
  const values = new Map<string, string | null>();
  for (const [attribute, name] of META_KEYS) {
    values.set(metaKey(attribute, name), readMeta(attribute, name)?.getAttribute('content') ?? null);
  }
  return { title: document.title, values };
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

  writeMeta('property', 'og:title', meta.title);
  writeMeta('name', 'twitter:title', meta.title);
  writeMeta('property', 'og:type', meta.ogType ?? 'website');
  writeMeta('property', 'og:url', meta.ogUrl ?? window.location.href);

  return () => {
    if (baseline) restoreDefaults(baseline);
  };
}
