import { findPublicSharedTrip } from '../collab/publicTrip.js';
import { getAgencyProposalMeta } from '../agency/proposals.js';

/**
 * Server-injected head tags for the SPA shell (C-20).
 *
 * WhatsApp, Slack and iMessage fetch a URL and read the HTML without running
 * JavaScript, so the client-side `applyPageMeta` helper is invisible to them.
 * The static fallback in `index.ts` passes the built `index.html` through
 * `applyMetaToHtml` before sending it, which is the only place these crawlers
 * can see a real title, description and share image.
 *
 * Nothing here is authorization: shared trips and proposals are resolved by
 * their public capability (share id / 256-bit token), exactly like their JSON
 * endpoints, and the resulting page stays `noindex`.
 */

export const DEFAULT_OG_IMAGE = '/brand/og-default.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const SITE_TITLE = 'waytowalk — Real journeys. Your way.';
const SITE_DESCRIPTION =
  'Discover real trips and travel agencies, adapt the route with your group, and keep the plan, map, weather and budget together.';

export interface PageMetaTags {
  title: string;
  description: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  canonical: string;
  robots: string;
  type?: 'website' | 'article' | 'profile';
}

/** Route prefixes whose pages are crawlable. Everything else is noindex. */
const INDEXABLE_PREFIXES = [
  '/',
  '/auth',
  '/terms',
  '/privacy',
  '/guidelines',
  '/explore',
  '/agencies',
  '/travelers',
];

function isIndexable(pathname: string): boolean {
  return INDEXABLE_PREFIXES.some(
    (base) => pathname === base || (base !== '/' && pathname.startsWith(`${base}/`))
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertBeforeHeadClose(html: string, tag: string): string {
  return html.replace(/<\/head>/i, `  ${tag}\n  </head>`);
}

function upsertMeta(
  html: string,
  attribute: 'name' | 'property',
  key: string,
  content: string
): string {
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}="${escapeRegExp(key)}"[^>]*>`,
    'i'
  );
  const tag = `<meta ${attribute}="${key}" content="${escapeHtmlAttribute(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadClose(html, tag);
}

function upsertCanonical(html: string, href: string): string {
  const pattern = /<link\s+[^>]*rel="canonical"[^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtmlAttribute(href)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadClose(html, tag);
}

/**
 * Replaces (or inserts) the head tags that matter to crawlers. The template is
 * the built `index.html`, so every other tag — fonts, theme bootstrap, CSP-safe
 * scripts — is left untouched.
 */
export function applyMetaToHtml(template: string, meta: PageMetaTags): string {
  const image = meta.image;

  let html = template.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtmlAttribute(meta.title)}</title>`
  );

  html = upsertMeta(html, 'name', 'description', meta.description);
  html = upsertMeta(html, 'name', 'robots', meta.robots);
  html = upsertMeta(html, 'property', 'og:title', meta.title);
  html = upsertMeta(html, 'property', 'og:description', meta.description);
  html = upsertMeta(html, 'property', 'og:type', meta.type ?? 'website');
  html = upsertMeta(html, 'property', 'og:url', meta.canonical);
  html = upsertMeta(html, 'property', 'og:site_name', 'waytowalk');
  html = upsertMeta(html, 'name', 'twitter:title', meta.title);
  html = upsertMeta(html, 'name', 'twitter:description', meta.description);
  html = upsertMeta(html, 'name', 'twitter:card', 'summary_large_image');

  if (image) {
    html = upsertMeta(html, 'property', 'og:image', image);
    html = upsertMeta(html, 'name', 'twitter:image', image);
    if (meta.imageWidth && meta.imageHeight) {
      html = upsertMeta(html, 'property', 'og:image:width', String(meta.imageWidth));
      html = upsertMeta(html, 'property', 'og:image:height', String(meta.imageHeight));
    }
  }

  return upsertCanonical(html, meta.canonical);
}

function defaultImage(origin: string): string {
  return `${origin}${DEFAULT_OG_IMAGE}`;
}

function baseMeta(pathname: string, origin: string): PageMetaTags {
  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    image: defaultImage(origin),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    canonical: `${origin}${pathname}`,
    robots: isIndexable(pathname) ? 'index, follow' : 'noindex, nofollow',
    type: 'website',
  };
}

function notFoundMeta(origin: string, pathname: string): PageMetaTags {
  return {
    title: 'Page not found · waytowalk',
    description:
      'The page you followed does not exist. Head back to waytowalk or start planning a trip.',
    image: defaultImage(origin),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    canonical: `${origin}${pathname}`,
    robots: 'noindex, nofollow',
    type: 'website',
  };
}

/** First usable day photo on a trip, as a public share-scoped media id. */
function firstCoverId(details: any): string | null {
  const days = Array.isArray(details?.day_by_day_itinerary)
    ? details.day_by_day_itinerary
    : [];
  for (const day of days) {
    const id = String(day?.image?.id ?? '').trim();
    if (/^[a-f0-9]{24}$/i.test(id)) return id;
  }
  return null;
}

export async function sharedTripMeta(
  shareId: string,
  origin: string,
  pathname: string
): Promise<PageMetaTags> {
  try {
    const trip = await findPublicSharedTrip(shareId);
    if (!trip) return notFoundMeta(origin, pathname);

    const details = trip.tripDetails ?? {};
    const title = String(trip.title || details.trip_title || 'Shared itinerary');
    const days = Array.isArray(details.day_by_day_itinerary)
      ? details.day_by_day_itinerary.length
      : Number(details.duration_days) || 0;
    const cover = firstCoverId(details);

    return {
      title: `${title} · Shared itinerary · waytowalk`,
      description:
        days > 0
          ? `A ${days}-day itinerary shared on waytowalk. Read-only: budgets and chat stay private.`
          : 'An itinerary shared on waytowalk. Read-only: budgets and chat stay private.',
      image: cover
        ? `${origin}/api/itinerary/shared/${encodeURIComponent(shareId)}/media/${cover}/content`
        : defaultImage(origin),
      canonical: `${origin}${pathname}`,
      robots: 'noindex, nofollow',
      type: 'article',
    };
  } catch {
    return notFoundMeta(origin, pathname);
  }
}

export async function proposalShareMeta(
  token: string,
  origin: string,
  pathname: string
): Promise<PageMetaTags> {
  try {
    const proposal = await getAgencyProposalMeta(token);
    if (!proposal) return notFoundMeta(origin, pathname);

    return {
      title: `${proposal.title} · Travel proposal · waytowalk`,
      description: proposal.description,
      image: defaultImage(origin),
      imageWidth: OG_IMAGE_WIDTH,
      imageHeight: OG_IMAGE_HEIGHT,
      canonical: `${origin}${pathname}`,
      robots: 'noindex, nofollow',
      type: 'article',
    };
  } catch {
    return notFoundMeta(origin, pathname);
  }
}

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * Short cache for crawler hits: a chat app may fetch the same link several
 * times, and both capability routes need a database lookup. A minute is short
 * enough that a newly published/revoked share is still reflected promptly.
 */
const META_CACHE_TTL_MS = 60_000;
const META_CACHE_LIMIT = 500;
const metaCache = new Map<string, { expires: number; meta: PageMetaTags }>();

/**
 * Resolves the tags for a request path. Only the two capability routes need a
 * database lookup; every other route reuses the document defaults plus a robots
 * directive.
 */
export async function resolveHtmlMeta(
  rawPath: string,
  origin: string
): Promise<PageMetaTags> {
  const pathname = normalizePath(rawPath);
  const cacheKey = `${origin}${pathname}`;
  const cached = metaCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.meta;

  const meta = await resolveUncached(pathname, origin);

  if (metaCache.size >= META_CACHE_LIMIT) metaCache.clear();
  metaCache.set(cacheKey, { expires: Date.now() + META_CACHE_TTL_MS, meta });
  return meta;
}

async function resolveUncached(
  pathname: string,
  origin: string
): Promise<PageMetaTags> {
  const shared = /^\/shared\/([^/]+)$/.exec(pathname);
  if (shared) {
    return sharedTripMeta(decodeURIComponent(shared[1]), origin, pathname);
  }

  const proposal = /^\/proposal\/([^/]+)$/.exec(pathname);
  if (proposal) {
    return proposalShareMeta(decodeURIComponent(proposal[1]), origin, pathname);
  }

  return baseMeta(pathname, origin);
}
