import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import TemplateAssetMapping, {
  trimAssetSelection,
  validateAssetSelection,
} from '@/components/agency/TemplateAssetMapping';
import { PDF_TEMPLATE_MAX_BYTES } from '@/lib/templates';
import type {
  AgencyAsset,
  AgencyTemplateAssetSelection,
  AgencyTemplateAudience,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Everything the layout step needs once the details are complete. */
export interface PdfTemplateDraft {
  file: File;
  name: string;
  description: string;
  audience: AgencyTemplateAudience;
  assets?: AgencyTemplateAssetSelection;
}

interface PdfTemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: AgencyAsset[];
  assetsLoading?: boolean;
  onContinue: (draft: PdfTemplateDraft) => void | Promise<void>;
}

/**
 * A6f step 1: the agency's own PDF design, its metadata and the asset
 * snapshots. Nothing is uploaded yet — the layout mapper comes next, and the
 * file is only sent once the slot map is valid for its real page geometry.
 */
const PdfTemplateUploadDialog: React.FC<PdfTemplateUploadDialogProps> = ({
  open,
  onOpenChange,
  assets,
  assetsLoading = false,
  onContinue,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] =
    useState<AgencyTemplateAudience>('client');
  const [file, setFile] = useState<File | null>(null);
  const [assetSelection, setAssetSelection] =
    useState<AgencyTemplateAssetSelection>({});
  const [continuing, setContinuing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setAudience('client');
    setFile(null);
    setAssetSelection({});
    setContinuing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  const chooseFile = (selected: File | null) => {
    if (!selected) {
      setFile(null);
      return;
    }
    const looksLikePdf =
      selected.type === 'application/pdf' ||
      /\.pdf$/i.test(selected.name) ||
      selected.type === 'application/x-pdf' ||
      selected.type === 'application/octet-stream';
    if (!looksLikePdf) {
      toast.error('Choose a PDF file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFile(null);
      return;
    }
    if (selected.size > PDF_TEMPLATE_MAX_BYTES) {
      toast.error('PDF designs must be 10 MB or smaller.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleContinue = async () => {
    if (!file) {
      toast.error('Choose a PDF design first.');
      return;
    }
    if (name.trim().length < 2) {
      toast.error('Give this template a name.');
      return;
    }
    const assetError = validateAssetSelection(assetSelection);
    if (assetError) {
      toast.error(assetError);
      return;
    }

    setContinuing(true);
    try {
      await onContinue({
        file,
        name: name.trim(),
        description: description.trim(),
        audience,
        assets: trimAssetSelection(assetSelection),
      });
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not open the layout mapper. Try again.')
      );
    } finally {
      setContinuing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!continuing) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload a PDF design</DialogTitle>
          <DialogDescription>
            Keep the agency’s own layout and let TravelAI fill it with trip,
            client and quote data. The design is sanitised, then you place data
            boxes on it before anything is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pdf-template-name">Template name</Label>
              <Input
                id="pdf-template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Signature brochure"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdf-template-audience">Audience</Label>
              <Select
                value={audience}
                onValueChange={(value) =>
                  setAudience(value as AgencyTemplateAudience)
                }
              >
                <SelectTrigger id="pdf-template-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client proposal</SelectItem>
                  <SelectItem value="internal">Internal desk copy</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Client templates never expose cost or markup fields.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdf-template-description">Description</Label>
              <Textarea
                id="pdf-template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What makes this layout different?"
                rows={2}
                maxLength={240}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf-template-file">PDF design</Label>
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center dark:border-slate-700">
              <input
                ref={fileInputRef}
                id="pdf-template-file"
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                disabled={continuing}
                onChange={(event) =>
                  chooseFile(event.target.files?.[0] ?? null)
                }
              />
              <FileText className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {file ? (
                  <>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {file.name}
                    </span>{' '}
                    · {formatBytes(file.size)}
                  </>
                ) : (
                  'One PDF up to 10 MB and 20 pages. Encrypted, rotated, cropped or fillable PDFs are rejected.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fileInputRef.current?.click()}
                disabled={continuing}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {file ? 'Choose a different PDF' : 'Choose PDF'}
              </Button>
            </div>
          </div>

          <TemplateAssetMapping
            assets={assets}
            assetsLoading={assetsLoading}
            disabled={continuing}
            value={assetSelection}
            onChange={setAssetSelection}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={continuing}
          >
            Cancel
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => void handleContinue()}
            disabled={continuing || !file}
          >
            <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
            Map data slots
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PdfTemplateUploadDialog;
