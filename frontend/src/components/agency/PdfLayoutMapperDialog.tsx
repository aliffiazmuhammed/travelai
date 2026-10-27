import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Repeat,
  Save,
  Trash2,
  Type,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  loadPdfDocument,
  pdfPageSize,
  type PDFDocumentProxy,
} from '@/lib/pdfjs';
import type {
  AgencyPdfPage,
  AgencyPdfSlot,
  AgencyPdfSlotMap,
  AgencyPdfTokenOption,
} from '@/types';
import { toast } from 'sonner';

const MIN_SLOT_POINTS = 4;

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function newSlotId(existing: Set<string>): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `slot-${Math.random().toString(36).slice(2, 9)}`;
    if (!existing.has(id)) return id;
  }
  return `slot-${Date.now().toString(36)}`;
}

interface PdfLayoutMapperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The design PDF, as local bytes. */
  pdfSource: Blob | Uint8Array | null;
  audience: 'client' | 'internal';
  tokens: AgencyPdfTokenOption[];
  initialSlotMap?: AgencyPdfSlotMap | null;
  saving?: boolean;
  saveLabel?: string;
  title: string;
  description: string;
  onSave: (slotMap: AgencyPdfSlotMap) => void | Promise<void>;
}

/**
 * A6f visual mapper. Pages are rendered from the sanitised design PDF; boxes
 * are stored in PDF points with a top-left origin, so the same numbers drive
 * the browser overlay and the pdf-lib renderer. One page can repeat for each
 * itinerary day, which is the only place day-scoped tokens are allowed.
 */
const PdfLayoutMapperDialog: React.FC<PdfLayoutMapperDialogProps> = ({
  open,
  onOpenChange,
  pdfSource,
  audience,
  tokens,
  initialSlotMap = null,
  saving = false,
  saveLabel = 'Save layout',
  title,
  description,
  onSave,
}) => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageSizes, setPageSizes] = useState<
    Array<{ width: number; height: number }>
  >([]);
  const [pages, setPages] = useState<AgencyPdfPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initialSlotMap);

  initialRef.current = initialSlotMap;

  // The loading state swaps the whole layout out, so the observed node is a new
  // element every time the PDF finishes loading; observe it again or the canvas
  // keeps the width measured before the swap (0 while detached).
  useEffect(() => {
    if (!open) return;
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      setContainerWidth(Math.floor(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, loading, loadError]);

  useEffect(() => {
    if (!open || !pdfSource) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setDoc(null);
      setPageSizes([]);
      setSelectedSlotId(null);
      try {
        const loaded = await loadPdfDocument(pdfSource);
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        const sizes: Array<{ width: number; height: number }> = [];
        for (let number = 1; number <= loaded.numPages; number += 1) {
          const page = await loaded.getPage(number);
          sizes.push(pdfPageSize(page));
        }
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        const initial = initialRef.current;
        const restored: AgencyPdfPage[] = (initial?.pages ?? []).map((page) => ({
          page: page.page,
          ...(page.repeat ? { repeat: page.repeat } : {}),
          slots: page.slots.map((slot) => ({ ...slot })),
        }));
        setPageSizes(sizes);
        setDoc(loaded);
        setPages(restored);
        setCurrentPage(
          Math.min(
            Math.max(restored[0]?.page ?? 1, 1),
            Math.max(loaded.numPages, 1)
          )
        );
      } catch (error) {
        setLoadError(
          errorMessage(
            error,
            'We could not read that PDF. Upload it again or choose another file.'
          )
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pdfSource]);

  useEffect(() => {
    if (!doc) return;
    return () => {
      void doc.destroy();
    };
  }, [doc]);

  useEffect(() => {
    if (!doc || !containerWidth) return;
    let cancelled = false;
    const pageNumber = currentPage;
    (async () => {
      setRendering(true);
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const size = pdfPageSize(page);
        const scale = containerWidth / size.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext('2d');
        if (!context) return;
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            errorMessage(error, 'We could not draw that PDF page.')
          );
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage, containerWidth]);

  const pageSize = pageSizes[currentPage - 1];
  const repeatPage =
    pages.find((page) => page.repeat === 'days')?.page ?? null;
  const isRepeatPage = repeatPage === currentPage;
  const currentSlots = useMemo(
    () => pages.find((page) => page.page === currentPage)?.slots ?? [],
    [pages, currentPage]
  );
  const selectedSlot =
    currentSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const allSlots = pages.flatMap((page) => page.slots);

  const patchPage = useCallback(
    (pageNumber: number, mutator: (page: AgencyPdfPage) => AgencyPdfPage) => {
      setPages((prev) => {
        const existing =
          prev.find((page) => page.page === pageNumber) ??
          ({ page: pageNumber, slots: [] } as AgencyPdfPage);
        const next = mutator(existing);
        const index = prev.findIndex((page) => page.page === pageNumber);
        if (index === -1) {
          return [...prev, next].sort((a, b) => a.page - b.page);
        }
        return prev.map((page, pageIndex) =>
          pageIndex === index ? next : page
        );
      });
    },
    []
  );

  const updateSlot = useCallback(
    (slotId: string, patch: Partial<AgencyPdfSlot>) => {
      patchPage(currentPage, (page) => ({
        ...page,
        slots: page.slots.map((slot) =>
          slot.id === slotId ? { ...slot, ...patch } : slot
        ),
      }));
    },
    [currentPage, patchPage]
  );

  const removeSlot = useCallback(
    (slotId: string) => {
      patchPage(currentPage, (page) => ({
        ...page,
        slots: page.slots.filter((slot) => slot.id !== slotId),
      }));
      setSelectedSlotId((current) => (current === slotId ? null : current));
    },
    [currentPage, patchPage]
  );

  const toggleRepeat = (enabled: boolean) => {
    setPages((prev) => {
      const cleared = prev.map((page) =>
        page.repeat ? { ...page, repeat: undefined } : page
      );
      if (!enabled) return cleared;
      const existing =
        cleared.find((page) => page.page === currentPage) ??
        ({ page: currentPage, slots: [] } as AgencyPdfPage);
      const merged = { ...existing, repeat: 'days' as const };
      return cleared.some((page) => page.page === currentPage)
        ? cleared.map((page) => (page.page === currentPage ? merged : page))
        : [...cleared, merged].sort((a, b) => a.page - b.page);
    });
  };

  const addSlot = (kind: AgencyPdfSlot['kind']) => {
    if (!pageSize) return;
    const existingIds = new Set(allSlots.map((slot) => slot.id));
    const candidates = tokens.filter(
      (token) =>
        token.kind === kind && (isRepeatPage || !token.day)
    );
    const preferred = isRepeatPage
      ? candidates.find((token) => token.day) ?? candidates[0]
      : candidates.find((token) => !token.day) ?? candidates[0];
    if (!preferred) {
      toast.error(
        kind === 'text'
          ? 'No text fields are available for this audience.'
          : 'No image fields are available for this audience.'
      );
      return;
    }

    const offset = (currentSlots.length % 8) * 12;
    const width =
      kind === 'text' ? Math.min(240, pageSize.width - 32) : Math.min(180, pageSize.width - 32);
    const height =
      kind === 'text' ? 26 : Math.min(140, Math.round((pageSize.height * 0.28)));
    const x = clamp(16 + offset, 0, Math.max(0, pageSize.width - width));
    const y = clamp(16 + offset, 0, Math.max(0, pageSize.height - height));

    const slot: AgencyPdfSlot =
      kind === 'text'
        ? {
            id: newSlotId(existingIds),
            kind,
            token: preferred.token,
            x: round(x),
            y: round(y),
            w: round(width),
            h: round(height),
            font: 'body',
            size: 11,
            minSize: 7,
            align: 'left',
            color: '#0F172A',
            lineHeight: 1.25,
            maxLines: 6,
          }
        : {
            id: newSlotId(existingIds),
            kind,
            token: preferred.token,
            x: round(x),
            y: round(y),
            w: round(width),
            h: round(height),
            fit: 'cover',
          };

    patchPage(currentPage, (page) => ({
      ...page,
      slots: [...page.slots, slot],
    }));
    setSelectedSlotId(slot.id);
  };

  const beginDrag = (
    event: React.PointerEvent,
    slot: AgencyPdfSlot,
    mode: 'move' | 'resize'
  ) => {
    if (saving || !pageSize) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedSlotId(slot.id);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const start = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
    const pageNumber = currentPage;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * pageSize.width;
      const dy = ((moveEvent.clientY - startY) / rect.height) * pageSize.height;
      if (mode === 'move') {
        const x = clamp(start.x + dx, 0, pageSize.width - start.w);
        const y = clamp(start.y + dy, 0, pageSize.height - start.h);
        setPages((prev) =>
          prev.map((page) =>
            page.page === pageNumber
              ? {
                  ...page,
                  slots: page.slots.map((entry) =>
                    entry.id === slot.id
                      ? { ...entry, x: round(x), y: round(y) }
                      : entry
                  ),
                }
              : page
          )
        );
      } else {
        const w = clamp(
          start.w + dx,
          MIN_SLOT_POINTS,
          pageSize.width - start.x
        );
        const h = clamp(
          start.h + dy,
          MIN_SLOT_POINTS,
          pageSize.height - start.y
        );
        setPages((prev) =>
          prev.map((page) =>
            page.page === pageNumber
              ? {
                  ...page,
                  slots: page.slots.map((entry) =>
                    entry.id === slot.id
                      ? { ...entry, w: round(w), h: round(h) }
                      : entry
                  ),
                }
              : page
          )
        );
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const buildSlotMap = (): AgencyPdfSlotMap | null => {
    const mapped = pages
      .filter((page) => page.slots.length > 0)
      .map((page) => ({
        page: page.page,
        ...(page.repeat === 'days' ? { repeat: 'days' as const } : {}),
        slots: page.slots.map((slot) => ({ ...slot })),
      }));
    if (mapped.length === 0) {
      toast.error('Add at least one slot to the PDF layout.');
      return null;
    }

    const repeat = mapped.find((page) => page.repeat === 'days')?.page ?? null;
    for (const page of mapped) {
      for (const slot of page.slots) {
        if (!slot.token) {
          toast.error('Every slot needs a field.');
          return null;
        }
        const definition = tokens.find((token) => token.token === slot.token);
        if (!definition) {
          toast.error(`"${slot.token}" is not available for this template.`);
          return null;
        }
        if (definition.day && repeat !== page.page) {
          toast.error(
            `"${definition.label}" needs the repeat-for-days page. Turn on "Repeat this page" for that page first.`
          );
          return null;
        }
        const size = pageSizes[page.page - 1];
        if (
          !size ||
          slot.x < 0 ||
          slot.y < 0 ||
          slot.w < MIN_SLOT_POINTS ||
          slot.h < MIN_SLOT_POINTS ||
          slot.x + slot.w > size.width + 0.5 ||
          slot.y + slot.h > size.height + 0.5
        ) {
          toast.error('Every slot must sit inside the page and be at least 4 points.');
          return null;
        }
      }
    }
    return { schemaVersion: 1, pages: mapped };
  };

  const handleSave = async () => {
    if (!pageSize && !doc) return;
    const slotMap = buildSlotMap();
    if (!slotMap) return;
    await onSave(slotMap);
  };

  const tokenOptions = (kind: AgencyPdfSlot['kind']) =>
    tokens.filter(
      (token) =>
        token.kind === kind && (isRepeatPage || !token.day)
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[94vh] overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex max-h-[94vh] flex-col">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {title}
              <Badge variant="outline" className="text-[10px]">
                {audience === 'internal' ? 'Internal' : 'Client'}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                PDF design
              </Badge>
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              Reading the PDF design...
            </div>
          ) : loadError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <p className="max-w-sm text-sm text-rose-700 dark:text-rose-300">
                {loadError}
              </p>
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-h-0 flex-col overflow-hidden border-b border-slate-200 lg:border-b-0 lg:border-r dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      disabled={currentPage <= 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[92px] text-center text-xs font-medium">
                      Page {currentPage} of {pageSizes.length || 1}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(pageSizes.length || 1, page + 1)
                        )
                      }
                      disabled={currentPage >= (pageSizes.length || 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {isRepeatPage ? (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        <Repeat className="mr-1 h-2.5 w-2.5" />
                        Repeats per day
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addSlot('text')}
                      disabled={saving || !pageSize}
                    >
                      <Type className="mr-1.5 h-3.5 w-3.5" />
                      Add text
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addSlot('image')}
                      disabled={saving || !pageSize}
                    >
                      <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                      Add image
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-slate-100/70 px-4 pb-6 dark:bg-slate-950/40">
                  <div
                    ref={wrapRef}
                    className="relative mx-auto w-full max-w-[760px] select-none bg-white shadow-sm"
                    onPointerDown={() => setSelectedSlotId(null)}
                  >
                    <canvas ref={canvasRef} className="block h-auto w-full" />
                    {pageSize
                      ? currentSlots.map((slot) => {
                          const selected = slot.id === selectedSlotId;
                          return (
                            <div
                              key={slot.id}
                              role="button"
                              tabIndex={0}
                              onPointerDown={(event) =>
                                beginDrag(event, slot, 'move')
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  setSelectedSlotId(slot.id);
                                }
                              }}
                              className={cn(
                                'absolute cursor-move touch-none rounded-[3px] border-2 text-[9px] font-medium leading-none',
                                selected
                                  ? 'border-teal-500 bg-teal-400/25 text-teal-900 shadow-[0_0_0_1px_rgba(13,148,136,0.35)]'
                                  : 'border-sky-500/70 bg-sky-400/15 text-sky-900'
                              )}
                              style={{
                                left: `${(slot.x / pageSize.width) * 100}%`,
                                top: `${(slot.y / pageSize.height) * 100}%`,
                                width: `${(slot.w / pageSize.width) * 100}%`,
                                height: `${(slot.h / pageSize.height) * 100}%`,
                              }}
                            >
                              <span className="pointer-events-none absolute inset-0 flex items-center gap-1 overflow-hidden px-1 text-[9px] font-semibold">
                                {slot.kind === 'image' ? (
                                  <ImageIcon className="h-2.5 w-2.5 shrink-0" />
                                ) : (
                                  <Type className="h-2.5 w-2.5 shrink-0" />
                                )}
                                <span className="truncate">
                                  {tokens.find(
                                    (token) => token.token === slot.token
                                  )?.label ?? slot.token}
                                </span>
                              </span>
                              {selected ? (
                                <span
                                  role="presentation"
                                  onPointerDown={(event) =>
                                    beginDrag(event, slot, 'resize')
                                  }
                                  className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-teal-600"
                                />
                              ) : null}
                            </div>
                          );
                        })
                      : null}
                    {rendering ? (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/40">
                        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                      </div>
                    ) : null}
                  </div>
                  <p className="mx-auto mt-2 max-w-[760px] text-center text-[10px] text-slate-500 dark:text-slate-400">
                    Drag a box to move it; drag its corner to resize. Page{' '}
                    {currentPage} ·{' '}
                    {pageSize
                      ? `${Math.round(pageSize.width)} × ${Math.round(
                          pageSize.height
                        )} pt`
                      : ''}
                  </p>
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Repeat per day</p>
                      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Repeat this page once for every itinerary day. Only one
                        page can repeat, and day fields live there.
                      </p>
                    </div>
                    <Switch
                      checked={isRepeatPage}
                      onCheckedChange={(checked) => toggleRepeat(checked)}
                      disabled={saving}
                      aria-label="Repeat this page for each itinerary day"
                    />
                  </div>

                  {selectedSlot ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold">
                          {selectedSlot.kind === 'text'
                            ? 'Text slot'
                            : 'Image slot'}
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                          onClick={() => removeSlot(selectedSlot.id)}
                          disabled={saving}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          Field
                        </span>
                        <Select
                          value={selectedSlot.token}
                          onValueChange={(token) =>
                            updateSlot(selectedSlot.id, { token })
                          }
                          disabled={saving}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {tokenOptions(selectedSlot.kind).map((token) => (
                              <SelectItem
                                key={token.token}
                                value={token.token}
                              >
                                {token.label}
                                {token.day ? ' · day page' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedSlot.kind === 'text' ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField
                              label="Size"
                              value={selectedSlot.size ?? 11}
                              min={6}
                              max={72}
                              step={0.5}
                              onChange={(size) =>
                                updateSlot(selectedSlot.id, {
                                  size,
                                  minSize: Math.min(
                                    selectedSlot.minSize ?? 7,
                                    size
                                  ),
                                })
                              }
                              disabled={saving}
                            />
                            <NumberField
                              label="Min size"
                              value={selectedSlot.minSize ?? 7}
                              min={6}
                              max={selectedSlot.size ?? 11}
                              step={0.5}
                              onChange={(minSize) =>
                                updateSlot(selectedSlot.id, { minSize })
                              }
                              disabled={saving}
                            />
                            <NumberField
                              label="Line height"
                              value={selectedSlot.lineHeight ?? 1.25}
                              min={1}
                              max={2.5}
                              step={0.05}
                              onChange={(lineHeight) =>
                                updateSlot(selectedSlot.id, { lineHeight })
                              }
                              disabled={saving}
                            />
                            <NumberField
                              label="Max lines"
                              value={selectedSlot.maxLines ?? 6}
                              min={1}
                              max={60}
                              step={1}
                              onChange={(maxLines) =>
                                updateSlot(selectedSlot.id, { maxLines })
                              }
                              disabled={saving}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                Font
                              </span>
                              <Select
                                value={selectedSlot.font ?? 'body'}
                                onValueChange={(font) =>
                                  updateSlot(selectedSlot.id, {
                                    font: font as 'body' | 'heading',
                                  })
                                }
                                disabled={saving}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="body">Body font</SelectItem>
                                  <SelectItem value="heading">
                                    Heading font
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                Align
                              </span>
                              <Select
                                value={selectedSlot.align ?? 'left'}
                                onValueChange={(align) =>
                                  updateSlot(selectedSlot.id, {
                                    align: align as 'left' | 'center' | 'right',
                                  })
                                }
                                disabled={saving}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              Colour
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedSlot.color ?? '#0F172A'}
                                onChange={(event) =>
                                  updateSlot(selectedSlot.id, {
                                    color: event.target.value.toUpperCase(),
                                  })
                                }
                                disabled={saving}
                                className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-slate-700"
                                aria-label="Text colour"
                              />
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {selectedSlot.color ?? '#0F172A'}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            Image fit
                          </span>
                          <Select
                            value={selectedSlot.fit ?? 'cover'}
                            onValueChange={(fit) =>
                              updateSlot(selectedSlot.id, {
                                fit: fit as 'cover' | 'contain',
                              })
                            }
                            disabled={saving}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cover">
                                Cover (fill and crop)
                              </SelectItem>
                              <SelectItem value="contain">
                                Contain (fit inside)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          Position (points)
                        </span>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                          <NumberField
                            label="X"
                            value={selectedSlot.x}
                            min={0}
                            max={Math.max(0, (pageSize?.width ?? 0) - selectedSlot.w)}
                            step={1}
                            onChange={(x) => updateSlot(selectedSlot.id, { x })}
                            disabled={saving}
                          />
                          <NumberField
                            label="Y"
                            value={selectedSlot.y}
                            min={0}
                            max={Math.max(0, (pageSize?.height ?? 0) - selectedSlot.h)}
                            step={1}
                            onChange={(y) => updateSlot(selectedSlot.id, { y })}
                            disabled={saving}
                          />
                          <NumberField
                            label="Width"
                            value={selectedSlot.w}
                            min={MIN_SLOT_POINTS}
                            max={Math.max(
                              MIN_SLOT_POINTS,
                              (pageSize?.width ?? 0) - selectedSlot.x
                            )}
                            step={1}
                            onChange={(w) => updateSlot(selectedSlot.id, { w })}
                            disabled={saving}
                          />
                          <NumberField
                            label="Height"
                            value={selectedSlot.h}
                            min={MIN_SLOT_POINTS}
                            max={Math.max(
                              MIN_SLOT_POINTS,
                              (pageSize?.height ?? 0) - selectedSlot.y
                            )}
                            step={1}
                            onChange={(h) => updateSlot(selectedSlot.id, { h })}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center dark:border-slate-800">
                      <p className="text-[11px] font-medium">
                        {currentSlots.length === 0
                          ? 'No slots on this page yet'
                          : `${currentSlots.length} slot${
                              currentSlots.length === 1 ? '' : 's'
                            } on this page`}
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Add a text or image slot, then click it to bind a field
                        and fine-tune its position.
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    <p className="font-medium text-slate-600 dark:text-slate-300">
                      {allSlots.length} slot{allSlots.length === 1 ? '' : 's'} on{' '}
                      {pages.filter((page) => page.slots.length > 0).length}{' '}
                      page
                      {pages.filter((page) => page.slots.length > 0).length === 1
                        ? ''
                        : 's'}
                    </p>
                    <p className="mt-1">
                      Layout changes are saved as a new draft version. Activate
                      it only after previewing it against a real trip.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          )}

          <DialogFooter className="border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => void handleSave()}
              disabled={saving || loading || !doc}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {saveLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}) => (
  <label className="space-y-1">
    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
      {label}
    </span>
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (!Number.isFinite(next)) return;
        onChange(clamp(next, min ?? -Infinity, max ?? Infinity));
      }}
      className="h-8 text-xs"
    />
  </label>
);

export default PdfLayoutMapperDialog;
