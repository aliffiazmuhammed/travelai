/** Agency Workspace A1 client types. */

import type { User } from './auth';

export type AgencyRole = 'owner' | 'admin' | 'planner' | 'viewer';
export type AgencyInvitableRole = Exclude<AgencyRole, 'owner'>;
export type AgencyAssetKind = 'logo' | 'mascot' | 'font' | 'image';

export interface AgencyBranding {
  logoUrl?: string;
  mascotUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
}

/** Reusable quote text owned by the agency (A4). */
export interface AgencyTerms {
  inclusions: string[];
  exclusions: string[];
  terms: string[];
}

export interface Agency {
  _id: string;
  name: string;
  branding: AgencyBranding;
  /** Optional tax id used by quotes/invoices. */
  gstin?: string;
  /** Prefilled into every new trip quote; the quote can override each line. */
  defaultTerms: AgencyTerms;
  /** The caller's role in this agency. */
  role: AgencyRole;
  memberCount: number;
  /** PA0: URL-safe tenant id used at `/agency/login?workspace=<slug>`. */
  slug?: string;
  /** PA0: suspended tenants cannot sign in or use agency routes. */
  status?: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  PA0 account realms                                                        */
/* -------------------------------------------------------------------------- */

/** Public tenant lookup for the agency login page (no account data). */
export interface AgencyPublicTenant {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface AgencyLoginContext {
  success: boolean;
  agency: AgencyPublicTenant;
}

/**
 * The agency account is a separate realm record. It is not a personal `User`
 * with extra fields: `accountType` and `mustChangePassword` are part of the
 * session contract and drive the client guard.
 */
export interface AgencySessionUser extends User {
  accountType: 'agency';
  mustChangePassword: boolean;
}

/** The single tenant this agency account belongs to (no switcher). */
export interface AgencySessionAgency {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
  status: 'active' | 'suspended';
  role: AgencyRole;
}

/** Response shape of agency signin, `/me`, and invite activation. */
export interface AgencyAuthSession {
  success: boolean;
  user: AgencySessionUser;
  agency: AgencySessionAgency;
}

/* -------------------------------------------------------------------------- */
/*  Public directory profile (M9 D1/D2)                                       */
/* -------------------------------------------------------------------------- */

export type DirectoryProfileState = 'draft' | 'published' | 'hidden';

export interface DirectoryServiceOption {
  id: string;
  label: string;
}

export interface DirectoryLanguageOption {
  code: string;
  label: string;
}

/** The tenant's own view of its directory row, in any state. */
export interface AgencyDirectoryProfile {
  state: DirectoryProfileState;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  /** Service ids from the server catalog. */
  services: string[];
  /** Language codes from the server catalog. */
  languages: string[];
  showPhone: boolean;
  showGstin: boolean;
  publishedAt: string | null;
  verified: boolean;
  /** Ops hid the profile; only support can clear it. */
  underReview: boolean;
}

export interface AgencyDirectoryReadiness {
  ready: boolean;
  missing: string[];
}

export interface AgencyDirectoryCatalog {
  services: DirectoryServiceOption[];
  languages: DirectoryLanguageOption[];
}

/** GET adds the chooser catalog; every mutation returns profile + readiness. */
export interface AgencyDirectoryProfileResponse {
  success: boolean;
  profile: AgencyDirectoryProfile;
  readiness: AgencyDirectoryReadiness;
  catalog: AgencyDirectoryCatalog;
}

export interface AgencyDirectoryProfilePayload {
  success: boolean;
  profile: AgencyDirectoryProfile;
  readiness: AgencyDirectoryReadiness;
}

export interface AgencyDirectoryProfileInput {
  about?: string;
  baseCity?: string;
  destinations?: string[];
  specialties?: string[];
  services?: string[];
  languages?: string[];
  showPhone?: boolean;
  showGstin?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Public directory (M9 D3)                                                  */
/* -------------------------------------------------------------------------- */

/** One listing card — smaller than the profile by design. */
export interface AgencyDirectoryCard {
  slug: string;
  name: string;
  baseCity: string;
  specialties: string[];
  services: DirectoryServiceOption[];
  logoUrl: string | null;
  verified: boolean;
  /** Lowest published package price; null means "price on request". */
  fromPricePerPerson: number | null;
  currency: string;
}

export interface AgencyDirectoryPage {
  success: boolean;
  agencies: AgencyDirectoryCard[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface AgencyDirectoryFilters {
  q?: string;
  city?: string;
  destination?: string;
  specialty?: string;
  language?: string;
  cursor?: string;
  limit?: number;
}

export interface AgencyDirectoryFacet {
  value: string;
  label: string;
  count: number;
}

export interface AgencyDirectoryFacets {
  destinations: AgencyDirectoryFacet[];
  specialties: AgencyDirectoryFacet[];
  cities: AgencyDirectoryFacet[];
  languages: AgencyDirectoryFacet[];
}

export interface AgencyDirectoryFacetsResponse {
  success: boolean;
  facets: AgencyDirectoryFacets;
}

/** One published package on the public profile (M9 D4). Snapshot fields only. */
export interface AgencyDirectoryPackage {
  id: string;
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  highlights: string[];
  inclusions: string[];
}

/** The public profile payload (`GET /api/agencies/:slug`). */
export interface AgencyDirectoryPublicProfile {
  slug: string;
  name: string;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: DirectoryServiceOption[];
  languages: DirectoryLanguageOption[];
  logoUrl: string | null;
  website: string | null;
  contactPhone: string | null;
  gstin: string | null;
  verified: boolean;
  publishedAt: string | null;
  /** Median first-response hours; null while the sample is too small (M9 D7). */
  replyTimeHours: number | null;
  packages: AgencyDirectoryPackage[];
}

export interface AgencyDirectoryPublicProfileResponse {
  success: boolean;
  profile: AgencyDirectoryPublicProfile;
}

/* -------------------------------------------------------------------------- */
/*  Public enquiries (M9 D5)                                                  */
/* -------------------------------------------------------------------------- */

export type AgencyEnquiryStatus = 'new' | 'replied' | 'quoted' | 'won' | 'lost';
export type AgencyEnquirySource = 'profile' | 'package';
export type AgencyEnquiryBudgetBand =
  | 'under_25k'
  | '25k_50k'
  | '50k_1l'
  | 'above_1l'
  | 'not_sure';

export type AgencyEnquiryDateView = {
  start: string | null;
  end: string | null;
  flexible: boolean;
};

/**
 * One enquiry as both sides read it. The inbox never includes `agency`; the
 * traveller's own history does, so a row is identifiable without the slug.
 * Internal bookkeeping (`client`, `assignee`, `assignedTo`, `lostReason`) is
 * always blank on the consumer projection.
 */
export interface AgencyEnquiry {
  id: string;
  status: AgencyEnquiryStatus;
  source: AgencyEnquirySource;
  contact: { name: string; email: string; phone: string | null };
  party: { adults: number; children: number };
  dates: AgencyEnquiryDateView;
  budgetBand: AgencyEnquiryBudgetBand | null;
  message: string;
  /** `tripId` is tenant-only: it powers the quote hand-off. */
  package: { id: string; title: string; tripId?: string | null } | null;
  agency?: { name: string; slug: string } | null;
  client: { id: string; name: string } | null;
  /** Tenant-only: the trip started from this lead, for the quote hand-off. */
  tripId: string | null;
  assignedTo: string | null;
  assignee: { id: string; name: string } | null;
  consentAt: string | null;
  repliedAt: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  /** D8: replies after the opening enquiry. */
  replyCount: number;
  unread: AgencyConversationUnread;
  lastMessageAt: string | null;
  lastMessageBy: AgencyConversationAuthor | null;
  /** Full thread on the detail read; omitted from list projections. */
  messages?: AgencyConversationMessage[];
  /**
   * Live proposals answering this enquiry. `lastDeclinedAt` belongs to the
   * newest share, so sending a new version clears the decline notice.
   */
  proposals?: {
    count: number;
    lastAt: string | null;
    lastDeclinedAt: string | null;
  };
  /** When the guest link stops working (agency view only). */
  conversationExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AgencyEnquiryPage {
  success: boolean;
  enquiries: AgencyEnquiry[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

/** What the public form posts; the server re-validates every field. */
export interface AgencyEnquiryInput {
  name: string;
  email: string;
  phone?: string;
  adults: number;
  children?: number;
  startDate?: string;
  endDate?: string;
  flexible?: boolean;
  budgetBand?: AgencyEnquiryBudgetBand;
  message: string;
  packageId?: string;
  consent: boolean;
}

export interface AgencyEnquiryAcknowledgement {
  id: string;
  status: AgencyEnquiryStatus;
  createdAt: string | null;
}

export interface AgencyEnquiryFilters {
  status?: AgencyEnquiryStatus;
  cursor?: string;
  limit?: number;
}

/** D6 inbox actions. `assigneeId: null` releases the lead. */
export interface AgencyEnquiryUpdateInput {
  status?: AgencyEnquiryStatus;
  lostReason?: string;
  assigneeId?: string | null;
}

export interface AgencyEnquiryUpdateResult {
  success: boolean;
  enquiry: AgencyEnquiry;
  /** True only when this call won the claim on an unassigned lead. */
  claimed: boolean;
}

export interface AgencyEnquiryConversion {
  success: boolean;
  enquiry: AgencyEnquiry;
  client: AgencyClient;
  /** True when an existing directory record was reused. */
  reused: boolean;
  /** True when this call created the directory record. */
  created: boolean;
}

export interface AgencyEnquirySummaryView {
  total: number;
  byStatus: Record<AgencyEnquiryStatus, number>;
  /** New + replied + quoted: the leads still needing work. */
  open: number;
  receivedThisWeek: number;
  repliedThisWeek: number;
  convertedThisWeek: number;
  /** Won ÷ total, rounded to three decimals. */
  conversionRate: number;
  /**
   * Leads asking for a person right now: new ones, plus any whose thread holds
   * a traveller message the team has not opened.
   */
  needsAttention: number;
  weekStart: string;
}

export interface AgencyEnquirySummary {
  success: boolean;
  summary: AgencyEnquirySummaryView;
}

/** The traveller's own badge counters (M9 R1), used by the personal nav. */
export interface MyEnquirySummary {
  /** Agency messages this account has not opened, across every enquiry. */
  unread: number;
  /** Live proposals answering any of them. */
  liveProposals: number;
  lastMessageAt: string | null;
}

export interface MyEnquirySummaryResponse {
  success: boolean;
  summary: MyEnquirySummary;
}

/* -------------------------------------------------------------------------- */
/*  Enquiry conversations (M9 D8)                                             */
/* -------------------------------------------------------------------------- */

export type AgencyConversationAuthor = 'traveller' | 'agency';

export interface AgencyConversationMessage {
  id: string;
  author: AgencyConversationAuthor;
  authorName: string;
  body: string;
  createdAt: string | null;
  /** Read receipts: the side that did not write the message fills these in. */
  readByAgencyAt: string | null;
  readByTravellerAt: string | null;
}

export interface AgencyConversationUnread {
  agency: number;
  traveller: number;
}

/** The thread as the guest link or the signed-in traveller reads it. */
export interface AgencyConversation {
  id: string;
  status: AgencyEnquiryStatus;
  agency: { name: string; slug: string };
  traveller: { name: string };
  enquiry: {
    source: AgencyEnquirySource;
    message: string;
    party: { adults: number; children: number };
    dates: AgencyEnquiryDateView;
    budgetBand: AgencyEnquiryBudgetBand | null;
    packageTitle: string | null;
    createdAt: string | null;
  };
  messages: AgencyConversationMessage[];
  unread: AgencyConversationUnread;
  lastMessageAt: string | null;
  lastMessageBy: AgencyConversationAuthor | null;
  repliedAt: string | null;
  /** Guest link expiry; null for a signed-in traveller. */
  expiresAt: string | null;
  canReply: boolean;
}

/** One live proposal in the traveller's comparison page. */
export interface AgencyProposalSummary {
  id: string;
  /**
   * `live` is the in-app share minted when the agency sends a quote; `pdf` is
   * a public link to a generated document (M9 R9).
   */
  kind: 'pdf' | 'live';
  /** The conversation this proposal answers, when it can be resolved. */
  enquiryId: string | null;
  agency: { name: string; slug: string };
  trip: { id: string; title: string };
  quote: {
    number: string;
    version: number;
    status: string;
    currency: string;
    total: number;
    perPerson: number;
    validUntil: string | null;
    inclusions: string[];
    exclusions: string[];
    createdAt: string | null;
  } | null;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  /** The traveller turned down this version in-app (M9 R6). */
  declinedAt: string | null;
  /**
   * Another version of this trip is already accepted, so this one is shown for
   * reference only — accepting it is refused by the server (M9 R7).
   */
  settledByAcceptedTrip: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Package snapshots (M9 D4)                                                 */
/* -------------------------------------------------------------------------- */

export type AgencyPackageState = 'draft' | 'published';

export interface AgencyPackageReadiness {
  ready: boolean;
  missing: string[];
}

/**
 * The agency's own package row. `tripId` is provenance only — the package is a
 * copy of the trip at creation time and never reads it again.
 */
export interface AgencyPackage {
  id: string;
  tripId: string | null;
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  /** Authenticated asset URL for the tenant's own previews. */
  coverUrl: string | null;
  highlights: string[];
  inclusions: string[];
  state: AgencyPackageState;
  publishedAt: string | null;
  /** Ops takedown; only support can clear it. */
  hidden: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  readiness: AgencyPackageReadiness;
}

/** Editable package fields; any subset is a valid PATCH. */
export interface AgencyPackageInput {
  title?: string;
  summary?: string;
  nights?: number;
  fromPricePerPerson?: number | null;
  highlights?: string[];
  inclusions?: string[];
  coverAssetId?: string | null;
}

/** Creation needs either a source trip (snapshot) or an explicit title. */
export interface AgencyPackageCreateInput extends AgencyPackageInput {
  tripId?: string;
}

export interface AgencyPackageResponse {
  success: boolean;
  package: AgencyPackage;
}

export interface AgencyPackageListResponse {
  success: boolean;
  packages: AgencyPackage[];
}

/* -------------------------------------------------------------------------- */
/*  Public events and interest rosters (M10)                                  */
/* -------------------------------------------------------------------------- */

export type AgencyEventKind = 'camp' | 'group_trip' | 'retreat' | 'other';
export type AgencyEventState = 'draft' | 'published';
export type AgencyEventInterestStatus = 'pending' | 'confirmed' | 'declined';

export interface AgencyEventReadiness {
  ready: boolean;
  missing: string[];
}

export interface AgencyEventInterestCounts {
  pending: number;
  confirmed: number;
  declined: number;
}

/** The tenant's own event row, drafts and past windows included. */
export interface AgencyEvent {
  id: string;
  title: string;
  summary: string;
  kind: AgencyEventKind;
  destination: string;
  venue: string;
  /** `YYYY-MM-DD`, both inclusive. */
  startDate: string;
  endDate: string;
  /** Ready-to-show window, e.g. "12–15 Jun 2027". */
  dateLabel: string;
  capacity: number | null;
  pricePerPerson: number | null;
  currency: string;
  /** Authenticated asset URL for the tenant's own previews. */
  coverUrl: string | null;
  highlights: string[];
  state: AgencyEventState;
  publishedAt: string | null;
  /** Closed windows keep a public page but take no new interest. */
  closedAt: string | null;
  /** Ops takedown; only support can clear it. */
  hidden: boolean;
  hiddenReason: string | null;
  interests: AgencyEventInterestCounts;
  readiness: AgencyEventReadiness;
}

export interface AgencyEventInput {
  title?: string;
  summary?: string;
  kind?: AgencyEventKind;
  destination?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
  capacity?: number | null;
  pricePerPerson?: number | null;
  highlights?: string[];
  coverAssetId?: string | null;
}

export interface AgencyEventResponse {
  success: boolean;
  event: AgencyEvent;
}

export interface AgencyEventListResponse {
  success: boolean;
  events: AgencyEvent[];
}

/** Tenant-wide interest counts: what the Events nav badge reads. */
export interface AgencyEventInterestSummary {
  pending: number;
  confirmed: number;
  declined: number;
}

export interface AgencyEventSummaryResponse {
  success: boolean;
  summary: AgencyEventInterestSummary;
}

/** One person on an event roster. Contact details are tenant-only. */
export interface AgencyEventInterest {
  id: string;
  name: string;
  email: string;
  phone: string;
  note: string;
  status: AgencyEventInterestStatus;
  decidedAt: string | null;
  createdAt: string;
}

export interface AgencyEventInterestListResponse {
  success: boolean;
  interests: AgencyEventInterest[];
}

export interface AgencyEventInterestResponse {
  success: boolean;
  interest: AgencyEventInterest;
}

/* -------------------------------------------------------------------------- */
/*  Client directory and quotes (A4)                                          */
/* -------------------------------------------------------------------------- */

export interface AgencyClient {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  /** The inbox lead this person came from, when there is one. */
  sourceEnquiryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'expired' | 'cancelled';

export interface QuoteClient {
  name: string;
  email?: string;
  phone?: string;
  adults: number;
  children: number;
  rooms?: number;
}

/** A quote line as saved. `total` is always server-computed. */
export interface QuoteLineItem {
  label: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Editable line shape sent to PUT /quote — never includes `total`. */
export interface QuoteLineDraft {
  label: string;
  description?: string;
  quantity: number;
  unitPrice: number;
}

export interface AgencyQuote {
  _id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  clientId?: string;
  client: QuoteClient;
  currency: string;
  lineItems: QuoteLineItem[];
  subtotal: number;
  /** Internal-only: absent from the viewer/client projection. */
  markupPct?: number;
  /** Internal-only: absent from the viewer/client projection. */
  markupAmount?: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  validUntil: string;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  /** Internal-only: absent from the viewer/client projection. */
  preparedBy?: string;
  sentAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyQuoteInput {
  clientId?: string | null;
  client: QuoteClient;
  currency: string;
  lineItems: QuoteLineDraft[];
  markupPct?: number;
  taxPct?: number;
  discount?: number;
  validUntil: string;
  inclusions?: string[];
  exclusions?: string[];
  terms?: string[];
  preparedBy?: string;
}

/* -------------------------------------------------------------------------- */
/*  Proposal templates and exports (A5)                                       */
/* -------------------------------------------------------------------------- */

export type AgencyTemplateAudience = 'client' | 'internal';
export type AgencyTemplateStatus = 'draft' | 'active' | 'archived';
export type AgencyTemplateListStatus = 'active' | 'draft' | 'archived' | 'all';
export type AgencyExportStatus = 'queued' | 'rendering' | 'ready' | 'failed';

/** Managed template metadata; template bytes never reach the client. */
export interface AgencyTemplate {
  _id: string;
  name: string;
  description?: string;
  engine: 'html' | 'docx' | 'pdf-background';
  status: AgencyTemplateStatus;
  version: number;
  /** The activated version; present once the template is active. */
  activeVersion?: number;
  schemaVersion: number;
  audience: AgencyTemplateAudience;
  isDefault: boolean;
  builtinKey?: 'brochure' | 'internal-summary';
  createdAt: string;
  updatedAt: string;
}

/** One immutable uploaded version; source bytes stay server-side. */
export interface AgencyTemplateVersion {
  version: number;
  audience: AgencyTemplateAudience;
  pageCount: number;
  sourceBytes: number;
  createdAt: string;
  previewedAt?: string;
  previewTripId?: string;
  active: boolean;
}

/** The private editable source of one version; admin-only. */
export interface AgencyTemplateSource {
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  source: string;
  checksum: string;
  schemaVersion: number;
}

export interface AgencyTemplateAssetSelection {
  logoAssetId?: string | null;
  mascotAssetId?: string | null;
  headingFontAssetId?: string | null;
  bodyFontAssetId?: string | null;
  coverAssetId?: string | null;
  /** One image per 1-based itinerary position. */
  dayAssets?: Array<{ day: number; assetId: string }>;
}

/**
 * PDF-background templates (A6f). Coordinates are PDF points with a top-left
 * origin, so the mapper can position boxes with plain percentages; the server
 * converts them for the renderer.
 */
export type AgencyPdfSlotKind = 'text' | 'image';
export type AgencyPdfSlotFont = 'body' | 'heading';
export type AgencyPdfSlotAlign = 'left' | 'center' | 'right';
export type AgencyPdfSlotFit = 'cover' | 'contain';

export interface AgencyPdfSlot {
  id: string;
  kind: AgencyPdfSlotKind;
  token: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font?: AgencyPdfSlotFont;
  size?: number;
  minSize?: number;
  align?: AgencyPdfSlotAlign;
  color?: string;
  lineHeight?: number;
  maxLines?: number;
  fit?: AgencyPdfSlotFit;
}

export interface AgencyPdfPage {
  page: number;
  /** The one page the renderer repeats for each itinerary day. */
  repeat?: 'days';
  slots: AgencyPdfSlot[];
}

export interface AgencyPdfSlotMap {
  schemaVersion: 1;
  pages: AgencyPdfPage[];
}

/** One bindable field, as advertised by the server. */
export interface AgencyPdfTokenOption {
  token: string;
  label: string;
  kind: AgencyPdfSlotKind;
  day: boolean;
}

export interface AgencyTemplateLayout {
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  slotMap: AgencyPdfSlotMap;
  slotMapChecksum: string;
  pageCount: number;
  checksum: string;
}

/** Real-trip render that marks a version as previewed before activation. */
export interface AgencyTemplateVersionPreview {
  engine: AgencyTemplate['engine'];
  html?: string;
  /** Base64 PDF bytes for PDF-background templates. */
  pdf?: string;
  pageCount: number;
  audience: AgencyTemplateAudience;
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  trip: { _id: string; title: string };
}

/** One durable export job in the trip history. */
export interface AgencyExport {
  _id: string;
  tripId: string;
  quoteId?: string;
  quoteNumber?: string;
  quoteVersion?: number;
  templateId: string;
  templateName: string;
  templateVersion: number;
  audience: AgencyTemplateAudience;
  format: 'pdf';
  status: AgencyExportStatus;
  bytes?: number;
  error?: string;
  attempts: number;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  expired: boolean;
  /** Short-lived signed URL; null until the job is ready. */
  downloadUrl: string | null;
}

export interface AgencyExportQuoteSummary {
  _id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  validUntil: string | null;
  currency: string;
  total: number;
  perPerson: number;
}

/** Real renderer output for the in-app preview. */
export interface AgencyExportPreview {
  engine: AgencyTemplate['engine'];
  html?: string;
  /** Base64 PDF bytes for PDF-background templates. */
  pdf?: string;
  pageCount: number;
  audience: AgencyTemplateAudience;
  template: AgencyTemplate;
  quote: AgencyExportQuoteSummary | null;
}

export interface AgencyExportInput {
  templateId: string;
  quoteId?: string | null;
}

/**
 * A private tenant brand asset (A3). `url` is the authenticated content route;
 * the frontend must fetch it with credentials rather than linking directly.
 */
export interface AgencyAsset {
  _id: string;
  kind: AgencyAssetKind;
  mime: string;
  bytes: number;
  originalName?: string;
  fontFamily?: string;
  licenseNote?: string;
  createdAt: string;
  url: string;
}

export interface AgencyMember {
  userId: string;
  role: AgencyRole;
  joinedAt: string;
  label: string;
  avatarUrl?: string;
  /** Only present for admins/owners, or on the caller's own row. */
  email?: string;
  isYou?: boolean;
}

export interface AgencyInvite {
  _id: string;
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  email: string | null;
  tokenHint: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * PA0 public preview. The token holder learns only which tenant invited them,
 * the role and the expiry — never the bound email or the inviter.
 */
export interface AgencyInvitePreview {
  agency: AgencyPublicTenant;
  role: AgencyInvitableRole;
  expiresAt: string;
}

export interface AgencyHealth {
  enabled?: boolean;
  milestone?: string;
  writesEnabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Client-facing proposal shares (A7)                                        */
/* -------------------------------------------------------------------------- */

/** What a share-link visitor is allowed to see: the client quote projection
 *  (never markup, prepared-by or expenses) plus the rendered document. */
export interface AgencyProposalView {
  agency: { name: string };
  trip: { _id: string; title: string };
  quote: AgencyQuote | null;
  canAccept: boolean;
  accepted: boolean;
  acceptedAt: string | null;
  declined: boolean;
  declinedAt: string | null;
  html: string;
  /**
   * `live` renders the itinerary snapshot sent with the quote; `html`/`pdf`
   * are generated exports (A7).
   */
  documentMode: 'live' | 'html' | 'pdf';
  /** The client-safe snapshot behind a `live` proposal; null for exports. */
  itinerary: AgencyExportDocument | null;
  pageCount: number;
  templateName: string;
  pdf: { bytes: number } | null;
  expiresAt: string;
}

/**
 * The renderer-ready document a live proposal snapshots at send time. Mirrors
 * the server's `ExportDocument`: client-safe by construction (no markup, cost
 * or chat content).
 */
export interface AgencyExportDocument {
  schemaVersion: number;
  generatedAt: string;
  agency: {
    name: string;
    logoUrl: string | null;
    mascotUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    fontHeading: string | null;
    fontBody: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    gstin: string | null;
  };
  trip: {
    id: string;
    title: string;
    destination: string;
    startDate: string | null;
    endDate: string | null;
    durationDays: number;
    nights: number;
    groupType: string | null;
    season: string | null;
    days: AgencyExportDay[];
  };
  client: {
    name: string;
    email: string | null;
    phone: string | null;
    adults: number | null;
    children: number | null;
    rooms: number | null;
  } | null;
  quote: {
    id: string;
    number: string;
    version: number;
    status: string;
    date: string | null;
    validUntil: string | null;
    currency: string;
    total: number;
    perPerson: number;
    inclusions: string[];
    exclusions: string[];
    terms: string[];
  } | null;
  recommendations: string[];
  thingsToCarry: string[];
  cancellationPolicy: string[];
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
    instagram: string | null;
  };
}

export interface AgencyExportDay {
  day: number;
  date: string | null;
  title: string;
  summary: string | null;
  activities: Array<{
    title: string;
    time: string | null;
    description: string | null;
    location: string | null;
    cost: number | null;
  }>;
  stay: Array<{
    name: string;
    location: string | null;
    description: string | null;
    vibe: string | null;
    pricePerNight: string | null;
  }>;
  food: string[];
  transport: string[];
  tips: string[];
  permitRequired: boolean;
  imageUrl: string | null;
}

export interface AgencyProposalAcceptResult {
  status: 'accepted';
  acceptedAt: string;
  quote: AgencyQuote;
}

/** The traveller answered "not this one" (M9 R6); the version is closed. */
export interface AgencyProposalDeclineResult {
  status: 'declined';
  declinedAt: string;
}

/** Staff-side row in the trip's share list. The token itself never returns. */
export interface AgencyProposalLink {
  _id: string;
  kind: 'pdf' | 'live';
  quoteId: string | null;
  tokenHint: string;
  quoteNumber: string | null;
  quoteVersion: number;
  templateName: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  declinedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Operations (A8): plan limits, usage and audit                             */
/* -------------------------------------------------------------------------- */

export type AgencyUsageLevel = 'ok' | 'warning' | 'over';

export interface AgencyPlanLimits {
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
}

export interface AgencyUsage {
  plan: AgencyPlanLimits;
  used: {
    seats: number;
    exportsThisMonth: number;
    storageBytes: number;
  };
  levels: {
    seats: AgencyUsageLevel;
    exports: AgencyUsageLevel;
    storage: AgencyUsageLevel;
  };
}

export interface AgencyAuditEntry {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Resolved display name/email; null for token and TravelAI-ops events. */
  actor: string | null;
  createdAt: string;
}

