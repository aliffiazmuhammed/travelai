/** Agency Workspace A1 client types. */

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
  createdAt: string;
  updatedAt: string;
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
export type AgencyExportStatus = 'queued' | 'rendering' | 'ready' | 'failed';

/** Managed template metadata; template bytes never reach the client. */
export interface AgencyTemplate {
  _id: string;
  name: string;
  description?: string;
  engine: 'html' | 'docx' | 'pdf-background';
  status: 'draft' | 'active' | 'archived';
  version: number;
  schemaVersion: number;
  audience: AgencyTemplateAudience;
  isDefault: boolean;
  builtinKey?: 'brochure' | 'internal-summary';
  createdAt: string;
  updatedAt: string;
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

/** Real renderer output for the in-app iframe preview. */
export interface AgencyExportPreview {
  html: string;
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

export interface AgencyInvitePreview {
  agency: { _id: string; name: string };
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  invitedBy?: string;
  expiresAt: string;
  emailBoundTo?: string;
}

export interface AgencyHealth {
  enabled?: boolean;
  milestone?: string;
  writesEnabled?: boolean;
}
