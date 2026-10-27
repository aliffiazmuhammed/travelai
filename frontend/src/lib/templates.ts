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
      return 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300';
    case 'draft':
      return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300';
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
