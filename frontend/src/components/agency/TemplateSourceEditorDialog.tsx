import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TEMPLATE_SOURCE_MAX_BYTES } from '@/lib/templates';
import { api } from '@/services/api';
import type { AgencyTemplate, AgencyTemplateVersion } from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TemplateSourceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  onSaved: (result: {
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
  }) => void | Promise<void>;
}

/**
 * A6e: in-app editing of a custom template's HTML. Saving always produces a
 * new immutable version and carries the base version's asset snapshots, so a
 * typo fix can never swap a client's approved imagery. Preview and activation
 * still gate publication.
 */
const TemplateSourceEditorDialog: React.FC<TemplateSourceEditorDialogProps> = ({
  open,
  onOpenChange,
  agencyId,
  template,
  version,
  onSaved,
}) => {
  const [source, setSource] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setSource('');
    setBaseline('');
    api
      .getAgencyTemplateSource(agencyId, template._id, version.version)
      .then((result) => {
        if (cancelled) return;
        setSource(result.source);
        setBaseline(result.source);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          errorMessage(err, 'We could not load this version’s source.')
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, agencyId, template._id, version.version, loadNonce]);

  const sourceBytes = useMemo(
    () => new TextEncoder().encode(source).length,
    [source]
  );
  const lineCount = source ? source.split('\n').length : 0;
  const dirty = !loading && !loadError && source !== baseline;
  const overLimit = sourceBytes > TEMPLATE_SOURCE_MAX_BYTES;

  const requestClose = () => {
    if (saving) return;
    if (
      dirty &&
      !window.confirm('Discard your unsaved HTML changes to this version?')
    ) {
      return;
    }
    onOpenChange(false);
  };

  const save = async () => {
    if (saving || !dirty) return;
    if (!source.trim()) {
      setError('Add the template HTML before saving a version.');
      return;
    }
    if (overLimit) {
      setError(
        'Templates must be smaller than 512 KB. Remove some markup or styles.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await api.saveAgencyTemplateSource(
        agencyId,
        template._id,
        { baseVersion: version.version, source }
      );
      toast.success(
        result.message ||
          `Version ${result.version.version} saved as a draft. Preview it before activating.`
      );
      await onSaved({ template: result.template, version: result.version });
    } catch (err) {
      setError(
        errorMessage(err, 'We could not save this version. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Code2 className="h-4 w-4 text-teal-600" />
            Edit HTML source
            <Badge variant="outline" className="text-[10px]">
              v{version.version}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {template.name} · saving creates a new draft version. v
            {version.version} and every export pinned to it stay unchanged.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading source...
          </div>
        ) : loadError ? (
          <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-500" />
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {loadError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLoadNonce((value) => value + 1)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {lineCount} {lineCount === 1 ? 'line' : 'lines'} ·{' '}
                <span
                  className={
                    overLimit ? 'font-medium text-rose-600 dark:text-rose-400' : undefined
                  }
                >
                  {formatBytes(sourceBytes)}
                </span>{' '}
                of 512 KB
              </span>
              <span>
                Logo, fonts and images are copied from v{version.version}.
              </span>
            </div>

            <Textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Template HTML source"
              disabled={saving}
              className="h-[44vh] resize-y rounded-2xl font-mono text-xs leading-relaxed"
            />

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <details className="rounded-2xl border border-slate-200 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <summary className="cursor-pointer font-medium">
                Template rules
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  Body fragment only: no <code>&lt;html&gt;</code>,{' '}
                  <code>&lt;head&gt;</code> or <code>&lt;script&gt;</code>.
                  Scripts, forms, iframes, links and remote assets are
                  rejected.
                </li>
                <li>
                  Include at least one <code>{'{{#days}}…{{/days}}'}</code>{' '}
                  section.
                </li>
                <li>
                  Every printable page needs <code>class="page"</code>.
                </li>
                <li>
                  Images come from tokens such as{' '}
                  <code>{'{{assets.logoDataUrl}}'}</code>; brand colours and
                  fonts use <code>var(--brand-primary)</code> and{' '}
                  <code>var(--font-heading)</code>.
                </li>
                <li>
                  Saving keeps this version a draft. Preview it against a real
                  trip before activating it for exports.
                </li>
              </ul>
            </details>
          </>
        )}

        <DialogFooter className="flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSource(baseline);
                setError(null);
              }}
              disabled={!dirty || saving}
            >
              Discard changes
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => void save()}
              disabled={loading || Boolean(loadError) || saving || !dirty || overLimit}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save as new version
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateSourceEditorDialog;
