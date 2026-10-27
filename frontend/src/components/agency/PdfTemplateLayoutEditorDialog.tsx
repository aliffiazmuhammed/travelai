import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PdfLayoutMapperDialog from '@/components/agency/PdfLayoutMapperDialog';
import { api } from '@/services/api';
import type {
  AgencyPdfSlotMap,
  AgencyPdfTokenOption,
  AgencyTemplate,
  AgencyTemplateVersion,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

interface PdfTemplateLayoutEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  template: AgencyTemplate;
  version: AgencyTemplateVersion;
  onSaved: (result: {
    template: AgencyTemplate;
    version: AgencyTemplateVersion;
    message?: string;
  }) => void | Promise<void>;
}

/**
 * A6f: opens the existing layout of one pinned version. Editing never
 * rewrites the approved version — saving mints the next draft version with
 * the same background bytes and a new slot map.
 */
const PdfTemplateLayoutEditorDialog: React.FC<
  PdfTemplateLayoutEditorDialogProps
> = ({ open, onOpenChange, agencyId, template, version, onSaved }) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [slotMap, setSlotMap] = useState<AgencyPdfSlotMap | null>(null);
  const [tokens, setTokens] = useState<AgencyPdfTokenOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPdfBytes(null);
    setSlotMap(null);
    try {
      const [layout, background, catalog] = await Promise.all([
        api.getAgencyTemplateLayout(agencyId, template._id, version.version),
        api.fetchAgencyTemplateBackground(
          agencyId,
          template._id,
          version.version
        ),
        api.getAgencyPdfTokenCatalog(agencyId, template.audience),
      ]);
      setSlotMap(layout.layout.slotMap);
      setPdfBytes(new Uint8Array(await background.arrayBuffer()));
      setTokens(catalog.tokens ?? []);
    } catch (error) {
      setLoadError(
        errorMessage(error, 'We could not open this PDF layout.')
      );
    } finally {
      setLoading(false);
    }
  }, [agencyId, template._id, template.audience, version.version]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const handleSave = async (nextSlotMap: AgencyPdfSlotMap) => {
    setSaving(true);
    try {
      const result = await api.saveAgencyTemplateLayout(
        agencyId,
        template._id,
        { baseVersion: version.version, slotMap: nextSlotMap }
      );
      toast.success(
        result.message || 'Layout saved as a draft. Preview it before activating.'
      );
      await onSaved(result);
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not save that layout. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  if (pdfBytes && slotMap) {
    return (
      <PdfLayoutMapperDialog
        open={open}
        onOpenChange={onOpenChange}
        pdfSource={pdfBytes}
        audience={template.audience}
        tokens={tokens}
        initialSlotMap={slotMap}
        saving={saving}
        saveLabel="Save as new version"
        title={`Edit layout · ${template.name} v${version.version}`}
        description="Saving creates the next draft version of this template. Exports already pinned to this version keep their current design."
        onSave={handleSave}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit layout · {template.name} v{version.version}
          </DialogTitle>
          <DialogDescription>
            Loading the approved PDF design and its data layout.
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
            <p className="max-w-sm text-xs text-rose-700 dark:text-rose-300">
              {loadError}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            {loading ? 'Loading the design...' : 'Preparing the mapper...'}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PdfTemplateLayoutEditorDialog;
