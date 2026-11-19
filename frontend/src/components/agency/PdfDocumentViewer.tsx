import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadPdfDocument, pdfPageSize } from '@/lib/pdfjs';

const RENDER_WIDTH = 1100;

interface PdfDocumentViewerProps {
  source: Blob | Uint8Array | null;
  title?: string;
  className?: string;
}

/**
 * In-app preview for generated PDFs. Drawing to images keeps the document
 * inside the app shell: the files are private, and the CSP does not need to
 * allow blob frames or external viewers.
 */
const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  source,
  title = 'PDF preview',
  className,
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setImages([]);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setImages([]);
      let doc: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
      try {
        doc = await loadPdfDocument(source);
        const rendered: string[] = [];
        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number);
          if (cancelled) return;
          const size = pdfPageSize(page);
          const scale = RENDER_WIDTH / size.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('This browser cannot render PDF pages.');
          await page.render({ canvasContext: context, viewport }).promise;
          rendered.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        if (!cancelled) setImages(rendered);
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error && renderError.message
              ? renderError.message
              : 'We could not display this PDF.'
          );
        }
      } finally {
        if (doc) void doc.destroy();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

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

  if (error) {
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

  if (images.length === 0) {
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
      {images.map((src, index) => (
        <img
          key={index}
          src={src}
          alt={`${title} · page ${index + 1}`}
          className="mx-auto block w-full max-w-[820px] rounded-lg bg-white shadow-sm"
        />
      ))}
    </div>
  );
};

export default PdfDocumentViewer;
