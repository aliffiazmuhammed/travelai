import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PdfDocumentViewer from '@/components/agency/PdfDocumentViewer';
import { formatAgencyDate } from '@/lib/agency';
import { base64PdfToBytes } from '@/lib/pdfjs';
import { api } from '@/services/api';
import type {
  AgencyTemplate,
  AgencyTemplateVersion,
  AgencyTemplateVersionPreview,
  Trip,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  /** Called after a successful render, so the version list can show previewed. */
  onPreviewed: () => void | Promise<void>;
}

/**
 * A6d: renders a draft template version against one real tenant trip. The
 * server records the preview, which is what unlocks activation.
 */
const TemplatePreviewDialog: React.FC<TemplatePreviewDialogProps> = ({
  open,
  onOpenChange,
  agencyId,
  template,
  version,
  onPreviewed,
}) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [preview, setPreview] = useState<AgencyTemplateVersionPreview | null>(
    null
  );
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewPdfBytes = useMemo(
    () => (preview?.pdf ? base64PdfToBytes(preview.pdf) : null),
    [preview?.pdf]
  );

  const loadTrips = useCallback(async () => {
    setTripsLoading(true);
    setTripsError(null);
    try {
      const result = await api.getAgencyTrips(agencyId);
      const list = result.trips ?? [];
      setTrips(list);
      setSelectedTripId((current) =>
        current && list.some((trip) => trip._id === current)
          ? current
          : list[0]?._id ?? ''
      );
    } catch (error) {
      setTrips([]);
      setTripsError(
        errorMessage(error, 'We could not load your trips for a preview.')
      );
    } finally {
      setTripsLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setPreviewError(null);
    setPreviewing(false);
    void loadTrips();
  }, [open, template._id, version.version, loadTrips]);

  const handlePreview = async () => {
    if (!selectedTripId) {
      toast.error('Choose a trip for the preview.');
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await api.previewAgencyTemplateVersion(
        agencyId,
        template._id,
        version.version,
        { tripId: selectedTripId }
      );
      setPreview(result.preview);
      toast.success('Version previewed. You can activate it now.');
      await onPreviewed();
    } catch (error) {
      setPreview(null);
      setPreviewError(
        errorMessage(error, 'We could not render this template version.')
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!previewing) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Preview {template.name} · v{version.version}
          </DialogTitle>
          <DialogDescription>
            The preview uses the same renderer as the PDF and the latest quote
            saved on the chosen trip. A successful preview unlocks activation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {tripsLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading trips...
            </div>
          ) : tripsError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {tripsError}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadTrips()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : trips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <p>
                A preview needs a real trip. Create one in the trip library
                first.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/agency/trips/new">Create a trip</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Preview trip
                </span>
                <Select
                  value={selectedTripId}
                  onValueChange={setSelectedTripId}
                  disabled={previewing}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose a trip" />
                  </SelectTrigger>
                  <SelectContent>
                    {trips.map((trip) => (
                      <SelectItem key={trip._id} value={trip._id}>
                        {trip.title?.trim() || 'Untitled trip'}
                        {trip.startDate
                          ? ` · ${formatAgencyDate(trip.startDate)}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700"
                onClick={() => void handlePreview()}
                disabled={previewing || !selectedTripId}
              >
                {previewing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                {preview ? 'Refresh preview' : 'Preview version'}
              </Button>
            </div>
          )}

          {previewError ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {preview.trip.title || 'Untitled trip'} · {preview.pageCount}{' '}
                  {preview.pageCount === 1 ? 'page' : 'pages'}
                </span>
                <span>·</span>
                <span>
                  Previewed {formatAgencyDate(version.previewedAt ?? new Date())}
                </span>
              </div>
              {preview.engine === 'pdf-background' ? (
                <PdfDocumentViewer
                  source={previewPdfBytes}
                  title={`${template.name} v${version.version}`}
                />
              ) : (
                <iframe
                  title={`${template.name} v${version.version} preview`}
                  srcDoc={preview.html ?? ''}
                  sandbox=""
                  className="h-[60vh] w-full rounded-2xl border border-slate-200 bg-white"
                />
              )}
            </>
          ) : trips.length > 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center dark:border-slate-800 dark:bg-slate-900/40">
              {previewing ? (
                <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
              ) : (
                <Eye className="h-7 w-7 text-slate-300 dark:text-slate-700" />
              )}
              <span className="text-sm font-semibold">
                Render this version with real trip data
              </span>
              <span className="max-w-sm text-[11px] text-slate-500 dark:text-slate-400">
                You will see the actual document layout, including the selected
                trip, its days and its latest quote.
              </span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={previewing}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePreviewDialog;
