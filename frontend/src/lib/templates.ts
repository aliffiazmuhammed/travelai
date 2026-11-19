import type {
  AgencyTemplate,
  AgencyTemplateAudience,
  AgencyTemplateStatus,
} from '@/types/agency';

export const TEMPLATE_STATUS_LABELS: Record<AgencyTemplateStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

/** Mirrors the backend template contract: one HTML fragment, up to 512 KiB. */
export const TEMPLATE_SOURCE_MAX_BYTES = 512 * 1024;

/** Mirrors the backend sanitizer: an uploaded design PDF, up to 10 MiB. */
export const PDF_TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
/** Aligned with the backend page ceiling for uploaded designs. */
export const PDF_TEMPLATE_MAX_PAGES = 20;

export function templateStatusLabel(status: AgencyTemplateStatus): string {
  return TEMPLATE_STATUS_LABELS[status] ?? status;
}

export function templateStatusClass(status: AgencyTemplateStatus): string {
  switch (status) {
    case 'active':
      return 'border-agency-accent/30 bg-agency-accent-soft text-agency-accent-ink';
    case 'draft':
      return 'border-warning/30 bg-warning/10 text-warning-ink dark:border-warning/40 dark:bg-warning/20';
    default:
      return 'border-agency-line bg-agency-soft text-agency-muted';
  }
}

export function templateAudienceLabel(
  audience: AgencyTemplateAudience
): string {
  return audience === 'internal' ? 'Internal' : 'Client';
}

/** The version new exports use: the activated version, else the stored one. */
export function templateVersionNumber(template: AgencyTemplate): number {
  return Number(template.activeVersion ?? template.version ?? 1);
}

export function templateSourceLabel(template: AgencyTemplate): string {
  return template.builtinKey ? 'Built-in' : 'Custom';
}

export function templateEngineLabel(template: AgencyTemplate): string {
  if (template.engine === 'pdf-background') return 'PDF design';
  if (template.engine === 'docx') return 'DOCX';
  return 'HTML';
}

/** Layout edits only make sense for uploaded PDF designs. */
export function templateSupportsLayoutEdit(template: AgencyTemplate): boolean {
  return !template.builtinKey && template.engine === 'pdf-background';
}
