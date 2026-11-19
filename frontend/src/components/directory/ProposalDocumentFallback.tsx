import { ExternalLink } from 'lucide-react';

/**
 * Escape hatch for the sandboxed `srcdoc` proposal preview.
 *
 * A strict CSP or an embedder can leave the iframe blank. The HTML is already
 * on the page as inert document source, so opening it as a local blob in a new
 * tab gives the traveller the same content without depending on frame policy.
 * Scripts stay blocked because the blob document inherits this page's CSP.
 */
export function ProposalDocumentFallback({
  html,
  title,
}: {
  html: string;
  title: string;
}) {
  const openDocument = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    // Give the new tab time to start loading before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
      Preview blank?{' '}
      <button
        type="button"
        onClick={openDocument}
        className="inline-flex items-center gap-1 rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Open the {title} document in a new tab
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </button>
      .
    </p>
  );
}
