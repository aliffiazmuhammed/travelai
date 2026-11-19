import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadPdfDocument, pdfPageSize } from '@/lib/pdfjs';

const RENDER_WIDTH = 1100;
/** Pages rendered per batch so a long proposal never rasterises up front. */
const PAGE_BATCH = 3;

type PdfDocumentHandle = Awaited<ReturnType<typeof loadPdfDocument>>;
type PdfPageHandle = Awaited<ReturnType<PdfDocumentHandle['getPage']>>;

interface RenderedPage {
  number: number;
  url: string;
}

async function renderPage(page: PdfPageHandle): Promise<string> {
  const size = pdfPageSize(page);
  const scale = RENDER_WIDTH / size.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot render PDF pages.');
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  if (!blob) throw new Error('This browser cannot render PDF pages.');
  return URL.createObjectURL(blob);
}

interface PdfDocumentViewerProps {
  source: Blob | Uint8Array | null;
  title?: string;
  className?: string;
}

/**
 * In-app preview for generated PDFs. Drawing to images keeps the document
 * inside the app shell: the files are private, and the CSP does not need to
 * allow blob frames or external viewers.
 *
 * Pages render in small batches when the reader asks for them (C-22). A
 * 40-page proposal therefore holds three page bitmaps, not forty, and every
 * object URL is revoked when the source changes or the viewer unmounts.
 */
const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  source,
  title = 'PDF preview',
  className,
}) => {
  const [doc, setDoc] = useState<PdfDocumentHandle | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [renderingMore, setRenderingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);
  const pagesRef = useRef<RenderedPage[]>([]);

  const message = useCallback((value: unknown) => {
    return value instanceof Error && value.message
      ? value.message
      : 'We could not display this PDF.';
  }, []);

  const releasePages = useCallback(() => {
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    pagesRef.current = [];
    setPages([]);
  }, []);

  // Load the document, not its pages: nothing rasterises until the first
  // batch effect below runs.
  useEffect(() => {
    runId.current += 1;
    const id = runId.current;
    releasePages();
    setDoc(null);
    setError(null);
    setNextPage(1);

    if (!source) {
      setLoading(false);
      return;
    }

    let loaded: PdfDocumentHandle | null = null;
    setLoading(true);
    (async () => {
      try {
        loaded = await loadPdfDocument(source);
        if (runId.current !== id) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setLoading(false);
      } catch (renderError) {
        if (runId.current === id) {
          setError(message(renderError));
          setLoading(false);
        }
      }
    })();

    return () => {
      // A late load must not keep its worker/page tree alive.
      if (runId.current === id) runId.current += 1;
    };
  }, [source, message, releasePages]);

  // Destroy the parsed document whenever it is replaced or the viewer closes.
  useEffect(() => {
    return () => {
      if (doc) void doc.destroy();
    };
  }, [doc]);

  // First batch, as soon as the document is ready.
  useEffect(() => {
    if (!doc) return;
    const id = runId.current;
    let cancelled = false;
    const batch: RenderedPage[] = [];

    (async () => {
      try {
        const last = Math.min(PAGE_BATCH, doc.numPages);
        for (let number = 1; number <= last; number += 1) {
          const page = await doc.getPage(number);
          if (cancelled) return;
          const url = await renderPage(page);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          batch.push({ number, url });
        }
        if (cancelled) return;
        pagesRef.current = batch;
        setPages(batch);
        setNextPage(last + 1);
      } catch (renderError) {
        if (cancelled) return;
        batch.forEach((page) => URL.revokeObjectURL(page.url));
        setError(message(renderError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, message]);

  const pageCount = doc?.numPages ?? 0;
  const hasMore = nextPage <= pageCount;

  const showMore = async () => {
    if (!doc || renderingMore || !hasMore) return;
    const id = runId.current;
    setRenderingMore(true);
    setError(null);
    const batch: RenderedPage[] = [];
    const last = Math.min(pageCount, nextPage + PAGE_BATCH - 1);
    try {
      for (let number = nextPage; number <= last; number += 1) {
        const page = await doc.getPage(number);
        if (runId.current !== id) {
          batch.forEach((rendered) => URL.revokeObjectURL(rendered.url));
          return;
        }
        const url = await renderPage(page);
        if (runId.current !== id) {
          batch.forEach((rendered) => URL.revokeObjectURL(rendered.url));
          URL.revokeObjectURL(url);
          return;
        }
        batch.push({ number, url });
      }
      if (runId.current !== id) {
        batch.forEach((rendered) => URL.revokeObjectURL(rendered.url));
        return;
      }
      pagesRef.current = [...pagesRef.current, ...batch];
      setPages(pagesRef.current);
      setNextPage(last + 1);
    } catch (renderError) {
      batch.forEach((rendered) => URL.revokeObjectURL(rendered.url));
      if (runId.current === id) setError(message(renderError));
    } finally {
      if (runId.current === id) setRenderingMore(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/60 text-xs text-muted-foreground dark:bg-background/40',
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-agency-accent-ink" />
        Rendering the PDF...
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div
        className={cn(
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-6 text-center text-xs text-destructive-ink dark:border-destructive/20 dark:bg-destructive/30',
          className
        )}
      >
        <AlertTriangle className="h-5 w-5" />
        {error}
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div
        className={cn(
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-xs text-muted-foreground',
          className
        )}
      >
        <FileText className="h-5 w-5 text-muted-foreground" />
        No document to show yet.
      </div>
    );
  }

  return (
    <div
      className={cn(
        'max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/60 p-3 dark:bg-background/40',
        className
      )}
    >
      {pages.map((page) => (
        <img
          key={page.number}
          src={page.url}
          alt={`${title} · page ${page.number}`}
          className="mx-auto block w-full max-w-[820px] rounded-lg bg-white shadow-sm"
        />
      ))}

      {error ? (
        <p
          role="status"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive-ink"
        >
          {error}
        </p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void showMore()}
            disabled={renderingMore}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {renderingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {renderingMore
              ? 'Rendering pages…'
              : `Show pages ${nextPage}–${Math.min(pageCount, nextPage + PAGE_BATCH - 1)}`}
          </button>
        </div>
      ) : pageCount > PAGE_BATCH ? (
        <p className="pb-1 text-center text-xs text-muted-foreground">
          End of document · {pageCount} pages
        </p>
      ) : null}
    </div>
  );
};

export default PdfDocumentViewer;
