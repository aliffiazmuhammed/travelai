import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import PdfDocumentViewer from '@/components/agency/PdfDocumentViewer';
import LiveProposalDocument from '@/components/directory/LiveProposalDocument';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/currency';
import { formatDate, formatDateOnly } from '@/lib/date';
import type { AgencyProposalView } from '@/types/agency';

/**
 * A proposal document opened from the comparison page or a conversation
 * (Milestone 9 D8).
 *
 * The full document needs a different capability depending on the viewer: the
 * signed-in traveller resolves the row by id, while a guest uses the private
 * conversation link. Both callers pass the loader, so this component never
 * knows (or stores) a proposal token.
 *
 * An in-app proposal (R9) renders the itinerary snapshot the agency sent with
 * the quote; a PDF/html row renders its pinned export instead.
 */
interface ProposalPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: () => Promise<AgencyProposalView>;
  loadPdf?: () => Promise<Blob>;
  downloadUrl?: string;
}

export const ProposalPreviewDialog: React.FC<ProposalPreviewDialogProps> = ({
  open,
  onOpenChange,
  load,
  loadPdf,
  downloadUrl,
}) => {
  const [proposal, setProposal] = useState<AgencyProposalView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProposal(null);
    setPdfBlob(null);
    setPdfError(null);

    load()
      .then((result) => {
        if (!cancelled) setProposal(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'This proposal could not be opened.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `load` is intentionally not a dependency: callers pass a fresh closure
    // for the selected row, and reloading on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !proposal || proposal.documentMode !== 'pdf' || !loadPdf) return;
    let cancelled = false;
    loadPdf()
      .then((blob) => {
        if (!cancelled) setPdfBlob(blob);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPdfError(
            err instanceof Error && err.message
              ? err.message
              : 'The PDF could not be loaded. Download it instead.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposal?.documentMode]);

  const quote = proposal?.quote ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            {proposal?.trip.title ?? 'Proposal document'}
            {quote ? (
              <Badge variant="outline" className="text-[10px]">
                {quote.number} · v{quote.version}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {proposal?.agency.name ?? 'Your agency'}
            {quote ? ` · ${formatMoney(quote.total, quote.currency)} total` : ''}
            {proposal && proposal.documentMode !== 'live' && proposal.expiresAt
              ? ` · link valid until ${formatDate(proposal.expiresAt)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening the proposal…
          </div>
        ) : error || !proposal ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center text-xs text-destructive">
            <AlertCircle className="h-5 w-5" />
            {error ?? 'This proposal could not be opened.'}
          </div>
        ) : (
          <div className="space-y-4">
            {quote ? (
              <div className="grid gap-2 rounded-2xl border border-border/70 p-3 text-xs sm:grid-cols-4">
                <Summary label="Total" value={formatMoney(quote.total, quote.currency)} />
                <Summary
                  label="Per person"
                  value={formatMoney(quote.perPerson, quote.currency)}
                />
                <Summary label="Status" value={quote.status} />
                <Summary
                  label="Valid until"
                  value={quote.validUntil ? formatDateOnly(quote.validUntil) : '—'}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {proposal.documentMode === 'live'
                  ? 'The itinerary as it stood when the quote was sent.'
                  : `${proposal.pageCount} page${proposal.pageCount === 1 ? '' : 's'} · ${proposal.templateName}`}
              </p>
              {proposal.pdf && downloadUrl ? (
                <Button asChild size="sm" className="rounded-xl text-xs font-bold gap-1.5">
                  <a href={downloadUrl} target="_blank" rel="noreferrer">
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </a>
                </Button>
              ) : null}
            </div>

            {proposal.documentMode === 'live' ? (
              proposal.itinerary ? (
                <LiveProposalDocument
                  document={proposal.itinerary}
                  className="max-h-[70vh] overflow-y-auto"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 px-6 py-16 text-center text-xs text-muted-foreground">
                  <AlertCircle className="h-5 w-5" />
                  This proposal's itinerary could not be loaded.
                </div>
              )
            ) : proposal.documentMode === 'pdf' ? (
              pdfError ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-16 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertCircle className="h-5 w-5" />
                  {pdfError}
                </div>
              ) : (
                <PdfDocumentViewer
                  source={pdfBlob}
                  title={proposal.trip.title}
                  className="h-[70vh]"
                />
              )
            ) : (
              <iframe
                title={`${proposal.trip.title} proposal`}
                srcDoc={proposal.html}
                sandbox=""
                className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-white"
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Summary: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-0.5">
    <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="truncate text-xs font-semibold capitalize text-foreground">{value}</p>
  </div>
);

export default ProposalPreviewDialog;
