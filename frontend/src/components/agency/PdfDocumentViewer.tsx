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
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400',
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        Rendering the PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
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
          'flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400',
          className
        )}
      >
        <FileText className="h-5 w-5 text-slate-300 dark:text-slate-700" />
        No document to show yet.
      </div>
    );
  }

  return (
    <div
      className={cn(
        'max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100/60 p-3 dark:border-slate-800 dark:bg-slate-950/40',
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
