# Agency custom template contract (A6a/A6b/A6c/A6f)

**Status:** locked, schema version 1 for HTML (2026-10-22) and for PDF layouts (2026-10-27)  
**Applies to:** uploaded HTML proposal templates (`engine: "html"`) and uploaded PDF designs with a slot map (`engine: "pdf-background"`).  
**Code:** [`templateValidation.ts`](../backend/src/services/agency/exports/templateValidation.ts), [`templateStorage.ts`](../backend/src/services/agency/exports/templateStorage.ts), [`templateAssets.ts`](../backend/src/services/agency/exports/templateAssets.ts), [`customTemplate.ts`](../backend/src/services/agency/exports/customTemplate.ts), [`templateResolver.ts`](../backend/src/services/agency/exports/templateResolver.ts), [`templateManagement.ts`](../backend/src/services/agency/exports/templateManagement.ts), [`pdfTemplateContract.ts`](../backend/src/services/agency/exports/pdfTemplateContract.ts), [`pdfTemplateRender.ts`](../backend/src/services/agency/exports/pdfTemplateRender.ts), [`AgencyTemplateVersion.ts`](../backend/src/models/AgencyTemplateVersion.ts).

An agency admin uploads either a self-contained HTML file or a finished PDF
design. The server validates it, stores it privately, previews it against a real
trip and only then allows activation. Custom templates are data, not code: there
is no JavaScript, no remote asset loading and no arbitrary document markup. A PDF
upload keeps the agency's own vector design and stores a closed map of text and
image slots on top of it (§10).

## 1. File contract

| Rule | Value |
| --- | --- |
| Encoding | UTF-8; invalid byte sequences are rejected |
| Size | at most 512 KiB (524,288 bytes), non-empty |
| Format | an HTML **body fragment**, not a complete document |
| Must contain | at least one `{{#days}}` section |
| Must render | at least one element with the `page` class using the validation fixture |
| NUL bytes | rejected |

Document-level tags (`<!doctype>`, `<html>`, `<head>`, `<body>`) are rejected
even though a browser fragment parser would silently discard them.

Every printable page must be wrapped in an element with the `page` class, for
example `<section class="page">...</section>`. Page counting used by preview and
activation is based on that class.

## 2. Markup allowlist

Only layout and document markup is allowed:

`section div header footer main article aside span p h1 h2 h3 h4 h5 h6 strong b
em i u small sub sup br hr ul ol li dl dt dd table thead tbody tfoot tr td th
figure figcaption blockquote img style`

Any other element — including `script`, `iframe`, `object`, `embed`, `form`,
`input`, `a`, `link`, `meta`, `base`, `svg` and `math` — fails upload.

Attributes are limited to:

`class style src alt width height colspan rowspan role title aria-label
aria-hidden` plus any `aria-*` attribute.

`on*` event handlers are always rejected. `src` is accepted on `img` only.
`width`/`height` must be static lengths (`120mm`, `50%`, `320px`, …).
`class`, `role` and `aria-*` values must be static.

## 3. Image rules

An `img` source must be one of:

- an embedded raster data URL: `data:image/png`, `data:image/jpeg` or
  `data:image/webp`, base64 encoded;
- the current item inside an image section: `<img src="{{.}}">` within
  `{{#imageDataUrl}}...{{/imageDataUrl}}`;
- an allowlisted image token:
  - `{{assets.logoDataUrl}}`
  - `{{assets.mascotDataUrl}}`
  - `{{assets.coverImageDataUrl}}`
  - `{{imageDataUrl}}` (inside a day)

Remote (`https:`, `//host/...`), relative and unknown image URLs are rejected.
The A6 renderer embeds agency assets as data URLs before rendering, so a PDF
never depends on the network.

## 4. Token vocabulary (v1)

Templates are logic-less Mustache. Every token is checked against this closed
vocabulary; an unknown token fails upload rather than rendering blank. Values
are HTML-escaped. Triple-stash (`{{{...}}}`), partials (`{{>...}}`) and custom
delimiters (`{{=<% %>=}}`) are rejected.

### Values

```text
agency.name  agency.address  agency.phone  agency.email  agency.website
agency.instagram  agency.gstin  agency.primaryColor  agency.accentColor

trip.title  trip.destination  trip.startDate  trip.endDate
trip.durationDays  trip.nights  trip.groupType  trip.season

client.name  client.email  client.phone  client.adults  client.children
client.rooms

quote.number  quote.version  quote.status  quote.statusLabel  quote.date
quote.validUntil  quote.currency  quote.total  quote.totalFormatted
quote.perPerson  quote.perPersonFormatted

days[].day  days[].pageNumber  days[].date  days[].title  days[].summary
days[].permitRequired  days[].imageDataUrl
days[].activities[].time  days[].activities[].title
days[].activities[].description  days[].activities[].location
days[].stays[].name  days[].stays[].location  days[].stays[].vibe
days[].stays[].description

contact.phone  contact.email  contact.website  contact.instagram

assets.logoDataUrl  assets.mascotDataUrl  assets.coverImageDataUrl
assets.headingFontFamily  assets.bodyFontFamily

generatedAt  watermark  statusLabel  internal
```

### Sections

Objects and lists are used as sections; they cannot be interpolated directly.

```text
#agency  #trip  #client  #quote  #contact  #assets
#days
#quote.inclusions  #quote.exclusions  #quote.terms
#days.activities  #days.stays
#days.food  #days.transport  #days.tips
#recommendations  #thingsToCarry  #cancellationPolicy
```

`{{#quote}}` may be absent (a trip without a quote), so a template that prices
the trip should pair it with an inverted section:

```html
{{#quote}}<p>{{quote.totalFormatted}}</p>{{/quote}}
{{^quote}}<p>Pricing on request</p>{{/quote}}
```

`{{.}}` is the current scalar inside `#days.food`, `#days.transport`,
`#days.tips`, `#quote.inclusions`, `#quote.exclusions`, `#quote.terms`,
`#recommendations`, `#thingsToCarry`, `#cancellationPolicy`, or the current
image URL inside `#imageDataUrl`.

Nested sections resolve names against the nearest context and then walk up, as
Mustache does. Inside `{{#days}}`, `{{title}}` means `days[].title`; inside
`{{#activities}}`, `{{time}}` means the activity time.

`{{day}}` is the itinerary day number. `{{pageNumber}}` is the 1-based position
in the rendered itinerary (`1`, `2`, …) and is the number a template should
show as "Day 1 of N"; it is not the calendar day of the month. Day image
snapshots are matched by that same position: `pageNumber = 1` renders slot
`day-1`. If the itinerary is reordered after upload, images stay with their
position, not with the original day number.

### Internal-only values

The following tokens exist only for `audience: "internal"` templates. A
client-audience upload referencing them is rejected — they are never rendered
into a client document, even if a future view accidentally includes them.

```text
days[].activities[].costFormatted
days[].stays[].pricePerNightFormatted
```

## 5. CSS rules

Each `<style>` block and every `style` attribute must be static. Rejected:

- Mustache tokens in CSS or style attributes — use the injected brand variables;
- CSS backslash escapes;
- `@import`;
- `url(...)` (no remote fonts, background images or external CSS);
- `expression(...)`, `behavior:`, `-moz-binding:`, `javascript:`, `vbscript:`;
- `data:text/html`.

The A6 renderer injects these custom properties into the print wrapper:

```css
--brand-primary   /* Agency.branding.primaryColor */
--brand-accent    /* Agency.branding.accentColor */
--font-heading    /* embedded heading font family */
--font-body       /* embedded body font family */
```

Templates may use them, for example
`h1 { font-family: var(--font-heading); color: var(--brand-primary); }`.
Fallback values are allowed.

## 6. Minimal valid example

```html
<style>
  .page { page-break-after: always; padding: 14mm; font-family: var(--font-body); }
  h1, h2 { font-family: var(--font-heading); color: var(--brand-primary); }
</style>

<section class="page">
  {{#assets.logoDataUrl}}
    <img src="{{.}}" alt="{{agency.name}}" width="40mm">
  {{/assets.logoDataUrl}}
  <h1>{{trip.title}}</h1>
  <p>{{agency.name}} · {{trip.destination}} · {{trip.durationDays}} days</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
  {{^quote}}<p>Pricing on request</p>{{/quote}}
</section>

{{#days}}
<section class="page">
  <h2>Day {{day}} — {{title}}</h2>
  {{#imageDataUrl}}<img src="{{.}}" alt="{{title}}" width="100%">{{/imageDataUrl}}
  <p>{{summary}}</p>
  <ul>{{#activities}}<li>{{time}} {{title}}</li>{{/activities}}</ul>
  <ul>{{#stays}}<li>{{name}} — {{vibe}}</li>{{/stays}}</ul>
</section>
{{/days}}
```

## 7. Version and storage model

- `AgencyTemplate` is the stable identity: name, audience, engine, active
  version and default flag. Built-ins remain code-backed; uploaded templates
  are versioned.
- `AgencyTemplateVersion` is immutable. It records the validated source's
  SHA-256 checksum, byte size, page count, token list, audience, schema version,
  asset snapshots and the successful preview (`previewedAt`, `previewedBy`,
  `previewTripId`).
- A version number is unique per `(agencyId, templateId, version)`.
- Exports pin both `templateId` and `version`. Activating a newer version or
  archiving a template never rewrites an existing export; retries keep using
  the pinned, immutable version.
- Activation requires a successful preview against a real trip and is
  admin-only. Archiving prevents selection for new exports but keeps pinned
  versions readable for retries and history.
- A source is stored privately as `<agencyId>/<templateVersionId>.html` under
  `AGENCY_TEMPLATE_DIR` (default `backend/agency-templates/`). Keys are
  generated server-side, files are written with mode `0600`, and nothing is
  served from the public uploads tree.
- PDF designs store the sanitised background at
  `<agencyId>/<templateVersionId>.pdf` under the same root; the version row also
  carries the `slotMap`, its `slotMapChecksum` and the background checksum, byte
  size and page count (§10).
- Validation returns `{ source, bytes, checksum, pageCount, tokens, sections }`
  for HTML, or `{ bytes, checksum, pageCount, pageSizes }` for a PDF. Nothing is
  persisted unless every check passes.

### Asset snapshots

A version also owns private, immutable copies of the assets it renders. They
are stored as `<agencyId>/<templateVersionId>/<slot>.<ext>` beside the source.

| Slot | Content | Source |
| --- | --- | --- |
| `logo` | image | explicit selection, else current branding logo |
| `mascot` | image | explicit selection, else current branding mascot |
| `cover` | image | explicit selection only |
| `day-1` … `day-30` | image | explicit selection per 1-based itinerary position |
| `heading-font` | woff/woff2/ttf/otf | explicit selection, else current branding heading family |
| `body-font` | woff/woff2/ttf/otf | explicit selection, else current branding body family |

Rules:

- Bytes are copied from tenant-owned private A3 assets. Branding URLs are
  parsed, never fetched; an external or cross-tenant URL is ignored.
- Explicit selections must exist, be the right kind and belong to the tenant;
  a missing explicit asset fails the upload. Branding fallbacks are
  best-effort and skipped when unavailable.
- Images are limited to PNG, JPEG and WebP; fonts to WOFF, WOFF2, TTF and OTF.
  The MIME is sniffed from the bytes, not trusted from the upload.
- A version may snapshot at most 32 MiB in total and at most 30 day images.
- A template that references `assets.logoDataUrl`, `assets.mascotDataUrl`,
  `assets.coverImageDataUrl` or `days[].imageDataUrl` must have a matching
  slot, otherwise the upload fails. Missing client-facing images are never
  discovered at render time.
- Snapshots are version-pinned: replacing or deleting the A3 asset later does
  not change an already uploaded version. At load time the stored byte count
  and MIME are re-checked; a truncated or altered snapshot fails with `409`
  and requires a new version.

## 8. Rendering

The A6 renderer turns a pinned version plus one real trip into a complete
print document:

- The Mustache view is assembled from the A5 `ExportDocument` and the version
  snapshots. Client-audience views omit `costFormatted` and
  `pricePerNightFormatted` keys entirely; internal-audience views include
  them. `internal`, `statusLabel` and `watermark` are view-provided values.
- The source is re-validated on every render with the version's audience. A
  file edited on disk cannot become executable or gain internal tokens.
- The wrapper provides the CSP (`default-src 'none'`, data-only images and
  fonts, no scripts), embedded `@font-face` rules, brand CSS variables, A4
  print geometry and a fixed `.export-watermark` element.
- Watermark text: `DRAFT` when a client document has no quote or a draft
  quote, `EXPIRED` for an expired quote, `CANCELLED` for a cancelled quote,
  and none for accepted/sent quotes or internal templates. The wrapper prints
  it; templates must not draw their own.
- A render that produces zero `page` elements for the selected trip fails
  rather than shipping a blank proposal.
- Pinned resolution verifies the version's SHA-256 checksum, byte size,
  schema version, engine `html` and audience. Archived templates and versions
  remain resolvable for pinned retries; activating new exports requires an
  active template and a successfully previewed version.

## 9. Management API (A6c)

All routes are tenant-scoped by `/:agencyId`; a template or version belonging
to another agency resolves as `404`. Custom-template management is
`admin`-only. Members may list and use active client templates.

| Route | Purpose |
| --- | --- |
| `GET /:agencyId/templates` | List templates. Non-admins always get active `client` templates; `status` (`draft`, `archived`, `all`) and `internal` are admin-only. |
| `POST /:agencyId/templates` | Multipart upload: `file`, `name`, `description`, `audience`, `assets` (JSON). Creates a draft template and version 1. |
| `POST /:agencyId/templates/pdf` | Multipart PDF design: `file`, `name`, `description`, `audience`, `slotMap` (JSON), `assets` (JSON). Sanitises the design and creates a draft `pdf-background` template and version 1 (§10). |
| `GET /:agencyId/templates/pdf-tokens?audience=` | Slot-token catalogue for the mapper; internal-only tokens only for `audience=internal`. |
| `GET /:agencyId/templates/:templateId/versions/:version/layout` | Stored slot map, slot-map checksum, background checksum and page count. `409` if the stored map no longer matches its checksum. |
| `GET /:agencyId/templates/:templateId/versions/:version/background` | Streams the private background PDF for the visual mapper (`Content-Disposition: inline`, `no-store`). `409` if the stored bytes no longer match the version checksum. |
| `POST /:agencyId/templates/:templateId/versions/from-layout` | JSON `{ baseVersion, slotMap }`. Validates the edited layout against the real page sizes and saves it as the next immutable version, carrying the background and asset snapshots forward. |
| `PATCH /:agencyId/templates/:templateId` | Rename or re-describe a custom template. |
| `GET /:agencyId/templates/:templateId/versions` | List versions with the active marker. |
| `GET /:agencyId/templates/:templateId/versions/:version/source` | Returns the private HTML source plus checksum and schema version for the in-app editor. `409` if the stored bytes no longer match the approved checksum. |
| `POST /:agencyId/templates/:templateId/versions/from-source` | JSON `{ baseVersion, source }`. Validates the edited fragment and saves it as the next immutable version, carrying the base version's asset snapshots forward. `409` when archived or when the stored base source fails its checksum. |
| `POST /:agencyId/templates/:templateId/versions` | Multipart upload of the next version; the template audience is reused. `409` when archived. |
| `POST /:agencyId/templates/:templateId/versions/:version/preview` | JSON `{ tripId, quoteId? }`; renders against a real tenant trip and records `previewedAt`, `previewedBy`, `previewTripId`. |
| `POST /:agencyId/templates/:templateId/versions/:version/activate` | Makes the previewed version active for new exports. `409` without a preview. |
| `POST /:agencyId/templates/:templateId/archive` | Archives a custom template and clears its default flag. |
| `POST /:agencyId/templates/:templateId/default` | Sets the default for its audience. Only an active template can be default. |

Lifecycle rules:

- Upload and version upload validate the source and snapshot assets before any
  row is written; a failed upload leaves no template, version or files behind.
- In-app editing is the same lifecycle with a textarea: the editor reads one
  version's source, and saving writes a **new** version. The base version's
  snapshots are copied byte-for-byte into the new version (so replacing or
  deleting the A3 asset cannot change the imagery), the saved version starts
  un-previewed, and archived templates must be restored first. Saving the
  unchanged source is rejected. Editing is `admin`-only; source bytes are never
  exposed to members or clients.
- PDF layout editing follows the same rules: the mapper reads one version's
  slot map and background, and saving writes a **new** version with the same
  background bytes, page count and snapshots. Saving an unchanged layout is
  rejected; the base map and stored background are re-verified before saving.
- A preview is required before activation and is re-verified at activation
  (source checksum plus snapshots). The preview uses the same renderer as the
  PDF, so a version that previews successfully is the version that exports.
- Activation never rewrites existing exports: export jobs pin
  `(templateId, templateVersion)`, and retries keep rendering that immutable
  version even after a newer version is active or the template is archived.
- There is at most one default per `(agencyId, audience)`, enforced by a
  partial unique index. Setting a default unsets the previous one in the same
  audience.
- Archived templates cannot be selected by new exports or set as default, but
  their pinned versions stay resolvable for retries and history. An archived
  template is restored by previewing one of its versions against a real trip
  and activating it; a version that was never previewed can be previewed
  while the template is archived.
- Every management action writes a tenant-scoped `AgencyAudit` event
  (`template.created`, `template.version_uploaded`, `template.version_edited`,
  `template.previewed`, `template.activated`, `template.archived`,
  `template.default_set`, `template.updated`).
- Uploads and in-app source saves are rate-limited per member and agency (30
  per hour), and each source is held in memory only up to the 512 KiB contract
  limit.

## 10. PDF designs (`engine: "pdf-background"`, A6f)

An agency may upload its finished PDF design instead of authoring HTML. The
design is kept as a vector background and TravelAI merges trip and quote data
into boxes that an admin maps over the pages in the browser. The upload is
rebuilt as a passive document, so no scripts, form fields, links, attachments or
annotations from the source can execute or reach a client.

### 10.1 Upload contract

| Rule | Value |
| --- | --- |
| Size | at most 10 MiB (10,485,760 bytes), non-empty |
| Pages | 1 to 20 |
| Format | starts with `%PDF-`; password-protected files are rejected |
| Page boxes | `MediaBox` and `CropBox` must match within 0.5 pt |
| Page rotation | must be 0 — rotate the page in the design tool and re-export |
| Sanitisation | pages are copied into a fresh document; page `Annots`, `AA` and `Metadata` are dropped; the new catalog has no OpenAction, JavaScript, AcroForm or attachments |
| Checksum | SHA-256 of the sanitised bytes, compared again on every render |

The design keeps its vector content; pages are never rasterised.

### 10.2 Slot map (schema version 1)

```json
{
  "schemaVersion": 1,
  "pages": [
    {
      "page": 1,
      "slots": [
        {
          "id": "title", "kind": "text", "token": "trip.title",
          "x": 40, "y": 60, "w": 500, "h": 40,
          "font": "heading", "size": 22, "minSize": 13.2,
          "align": "left", "color": "#0F172A",
          "lineHeight": 1.25, "maxLines": 10
        }
      ]
    },
    {
      "page": 2,
      "repeat": "days",
      "slots": [
        { "id": "day-title", "kind": "text", "token": "day.title", "x": 40, "y": 40, "w": 440, "h": 24 }
      ]
    },
    {
      "page": 3,
      "slots": [
        { "id": "logo", "kind": "image", "token": "image.logo", "x": 480, "y": 40, "w": 70, "h": 70, "fit": "cover" }
      ]
    }
  ]
}
```

- Coordinates are PDF points with a **top-left origin**, relative to the page's
  `MediaBox`. The browser mapper and the pdf-lib renderer use the same numbers;
  the renderer converts to pdf-lib's bottom-left space.
- Each page appears at most once; `page` is 1-based and must exist in the PDF.
  Not every design page has to be mapped.
- Exactly one page may set `"repeat": "days"`. It is rendered once per itinerary
  day, in order. A layout without a repeat page renders good for fixed
  documents but cannot show day content.
- Total 250 slots, at most 80 per page. Each slot needs a unique id matching
  `[A-Za-z0-9_-]{1,40}`, at least 4 pt wide and tall, and must stay inside the
  page (0.5 pt tolerance).
- Text slots accept `size` 6-72, `minSize` 6 to `size` (default 60% of size),
  `lineHeight` 1-2.5, `maxLines` 1-60, `align` `left|center|right`, `color`
  `#RRGGBB` (stored uppercase) and `font` `body|heading`. The renderer shrinks
  text down to `minSize` to fit the box and truncates at `maxLines`.
- Image slots accept `fit` `cover|contain`.
- Defaults are materialised when the map is validated, so the stored map and
  its checksum stay stable across edits and releases.
- `slotMapChecksum` is a SHA-256 over a key-sorted serialisation of the stored
  map. A map edited in the database no longer matches and is refused with 409.

### 10.3 Slot tokens

Global text tokens:

```text
agency.name  agency.address  agency.phone  agency.email  agency.website
agency.instagram  agency.gstin

trip.title  trip.destination  trip.startDate  trip.endDate
trip.durationDays  trip.nights  trip.groupType  trip.season

client.name  client.email  client.phone  client.adults  client.children
client.rooms

quote.number  quote.version  quote.statusLabel  quote.date  quote.validUntil
quote.totalFormatted  quote.perPersonFormatted
quote.inclusions  quote.exclusions  quote.terms

recommendations  thingsToCarry  cancellationPolicy
contact.phone  contact.email  contact.website  contact.instagram
generatedAt  statusLabel
```

Day tokens, valid only on the page marked `"repeat": "days"`:

```text
day.number  day.date  day.title  day.summary  day.permitRequired
day.activities  day.stays  day.food  day.transport  day.tips
```

Internal-only day tokens, rejected for `audience: "client"` layouts:

```text
day.activityCosts  day.stayPrices
```

Image tokens: `image.logo`, `image.mascot`, `image.cover` and `day.image`
(repeat page only). Lists render as `• ` lines in the slot.

### 10.4 Images and assets

- Mapped image slots reuse the A6 asset snapshots (§7). A layout that maps
  `image.logo`, `image.mascot`, `image.cover` or `day.image` must have the
  matching snapshot, or the upload/save fails before anything is stored.
- The PDF renderer can embed **PNG and JPEG only**. A WebP snapshot selected for
  a mapped slot is rejected with 400 at upload/save time; pick a PNG or JPEG
  version of that image. (The HTML engine still accepts WebP.)
- Snapshots stay version-pinned and are copied byte-for-byte when a layout is
  edited into a new version.

### 10.5 Rendering and verification

- Every render re-validates the stored map against the background's real page
  sizes and re-checks the background checksum and byte count. A tampered row or
  file fails with 409.
- Text uses the brand font when one is embedded, otherwise the built-in PDF
  face. Glyphs the built-in faces cannot encode are replaced (`₹` → `Rs. `,
  arrows/checks simplified).
- The output page order is the design order with the repeat page expanded in
  place once per itinerary day. `pageCount = static mapped pages + itinerary
  days`.
- The renderer adds the same watermark rules as HTML: `DRAFT`, `EXPIRED` or
  `CANCELLED` for client documents; none for sent/accepted quotes or internal
  templates.
- PDF exports are merged in-process with pdf-lib. They need neither Chrome nor
  the Gotenberg renderer, so they keep working on hosts without a browser.
- A public proposal whose pinned export used a PDF design reports
  `documentMode: "pdf"` and serves the finished export through the token-only
  PDF route. HTML templates keep re-rendering on the proposal page.

## 11. Contract changes

HTML schema version 1 and PDF slot-map schema version 1 are frozen. A change to
allowed markup, tokens, escaping, rendering semantics, coordinates or
sanitisation requires:

1. a new `AGENCY_TEMPLATE_SCHEMA_VERSION` (HTML) or
   `AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION` (PDF);
2. a new `engine` value if rendering semantics change;
3. migration notes for versions already previewed or activated;
4. validator tests covering both the new and previously stored versions.
