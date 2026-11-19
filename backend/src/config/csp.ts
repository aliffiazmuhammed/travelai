/**
 * Content-Security-Policy allow-list (Milestone 7, M7.4).
 *
 * The SPA is served by this Express app in production (`SERVE_STATIC`), so the
 * policy is written for the assets the app actually requests:
 *
 * - **Scripts:** only this origin. The theme bootstrap moved out of
 *   `index.html` into `public/theme-init.js` precisely so the policy can stay
 *   free of `'unsafe-inline'` / `'unsafe-eval'`.
 * - **Styles:** inline style attributes are unavoidable — Recharts and
 *   Leaflet position elements with `style="..."` — so `style-src` keeps
 *   `'unsafe-inline'`. No remote stylesheets are used: fonts are self-hosted
 *   (C-23), so `style-src` and `font-src` stay same-origin.
 * - **Images:** same-origin uploads and proxied trip covers, inline data/blob
 *   previews, Cloudinary avatars/receipts, and the two map tile providers.
 *   Destination covers go through `/api/images/cover` (C-21), so the browser no
 *   longer needs a third-party photo-host origin.
 * - **Connections:** same-origin API/SSE plus Nominatim geocoding, which the
 *   map calls directly from the browser.
 * - **Frames/objects:** no remote frames. Proposal documents render from
 *   `srcdoc` inside a fully sandboxed iframe; `frame-src 'self'` permits that
 *   local document while still refusing third-party embeds. `object-src` stays
 *   `'none'`.
 *
 * Split-origin deployments (SPA on Vercel, API on Render) get their policy
 * from the static host, not from here; this allow-list covers the unified
 * single-service deployment that `render.yaml` describes.
 */

/** Origins the SPA loads images from (trip covers, avatars, map tiles). */
export const CSP_IMAGE_ORIGINS = [
  "'self'",
  'data:',
  'blob:',
  'https://res.cloudinary.com',
  'https://*.basemaps.cartocdn.com',
  'https://server.arcgisonline.com',
] as const;

/** Stylesheets: same-origin only (fonts are self-hosted since C-23). */
export const CSP_STYLE_ORIGINS: readonly string[] = [];

/** Browser-initiated network calls outside this origin. */
export const CSP_CONNECT_ORIGINS = [
  "'self'",
  'https://nominatim.openstreetmap.org',
] as const;

/**
 * Returns the helmet `directives` object rather than the full middleware so the
 * policy can be asserted in tests without booting Express.
 *
 * `upgrade-insecure-requests` is production-only: it would break a local
 * `http://localhost` build if it leaked into development.
 */
export function buildCspDirectives(isDev: boolean) {
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'", ...CSP_STYLE_ORIGINS],
    imgSrc: [...CSP_IMAGE_ORIGINS],
    fontSrc: ["'self'", 'data:'],
    connectSrc: [...CSP_CONNECT_ORIGINS],
    mediaSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'],
    frameSrc: ["'self'"],
    frameAncestors: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: isDev ? null : [],
  };
}
