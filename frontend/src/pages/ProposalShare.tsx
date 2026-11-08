import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import PdfDocumentViewer from "@/components/agency/PdfDocumentViewer";
import { AgencyLogoTile } from "@/components/directory/AgencyLogoTile";
import LiveProposalDocument from "@/components/directory/LiveProposalDocument";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { formatMoney } from "@/lib/currency";
import { formatDate, formatDateOnly } from "@/lib/date";
import type { AgencyProposalView } from "@/types/agency";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

/**
 * Public proposal share (A7). No account, no session: the token in the URL is
 * the only capability. Every figure on this page comes from the client-safe
 * quote projection (no markup, no internal notes); a live proposal renders the
 * itinerary snapshot the agency sent, and a pinned share renders its export.
 */
const ProposalShare: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [proposal, setProposal] = useState<AgencyProposalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No proposal token provided.");
      setLoading(false);
      return;
    }
    const fetchProposal = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAgencyProposal(token);
        setProposal(data.proposal);
      } catch (err: any) {
        console.error("Failed to load proposal:", err);
        // The backend answers every unusable token with the same generic 404,
        // so the client mirrors that: never reveal whether a link was revoked,
        // expired or never existed.
        setError(
          err?.status === 404
            ? "This proposal could not be found. The link may have expired or been withdrawn."
            : err.message ||
                "This proposal could not be found. The link may have expired or been withdrawn."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchProposal();
  }, [token]);

  useEffect(() => {
    if (!token || proposal?.documentMode !== "pdf") return;
    let cancelled = false;
    setPdfBlob(null);
    setPdfError(null);
    api
      .getAgencyProposalPdfBlob(token)
      .then((blob) => {
        if (!cancelled) setPdfBlob(blob);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setPdfError(
            err?.message ||
              "This proposal document could not be loaded. Download it instead."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, proposal?.documentMode]);

  const handleAccept = async () => {
    if (!token || !proposal || !proposal.canAccept) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      setAccepting(true);
      const data = await api.acceptAgencyProposal(token);
      setProposal((current) =>
        current
          ? {
              ...current,
              canAccept: false,
              accepted: true,
              acceptedAt: data.acceptance.acceptedAt,
              quote: data.acceptance.quote,
            }
          : current
      );
      setConfirming(false);
    } catch (err: any) {
      console.error("Failed to accept proposal:", err);
      setError(err.message || "The proposal could not be accepted right now.");
      setConfirming(false);
    } finally {
      setAccepting(false);
    }
  };

  const quote = proposal?.quote ?? null;
  const agencyName = proposal?.agency.name?.trim() || "your agency";
  const liveDocument =
    proposal && proposal.documentMode === "live" ? proposal.itinerary : null;

  const statusBadge = () => {
    if (!proposal) return null;
    if (proposal.declined) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
          <X className="h-3 w-3" aria-hidden="true" />
          Declined
        </span>
      );
    }
    if (!quote) return null;
    switch (quote.status) {
      case "accepted":
        return (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Accepted
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Awaiting your acceptance
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            Expired
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  // The one answer this surface offers: accept, in two steps. The panel sits
  // inside the document card so the page reads as one piece of paper.
  const answerPanel = proposal ? (
    proposal.accepted ? (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3.5 text-accent">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">You have accepted this proposal.</p>
          {proposal.acceptedAt ? (
            <p className="text-[11px] opacity-80">
              Accepted on {formatDate(proposal.acceptedAt)}
            </p>
          ) : null}
        </div>
      </div>
    ) : proposal.declined ? (
      <div className="rounded-xl border border-border/70 bg-muted/60 px-4 py-3.5">
        <p className="text-xs font-semibold text-foreground">
          You declined this proposal.
        </p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          Ask {agencyName} for an updated one if you change your mind.
        </p>
      </div>
    ) : proposal.canAccept ? (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Send className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="font-display text-lg font-semibold tracking-tight text-foreground">
                Ready when you are
              </p>
              <p className="max-w-md text-[11px] leading-5 text-muted-foreground">
                Review the details and accept when you’re happy to go ahead.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="h-9 gap-1.5 px-4 text-xs font-semibold"
            >
              {accepting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : confirming ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : null}
              {confirming ? "Confirm acceptance" : "Accept proposal"}
            </Button>
            <p className="text-[10px] leading-4 text-muted-foreground">
              {confirming
                ? "Acceptance is final — it confirms the trip and locks this quote."
                : "Acceptance is final — it confirms the trip with the agency."}
            </p>
          </div>
        </div>
      </div>
    ) : quote?.status === "expired" || quote?.status === "cancelled" ? (
      <div className="rounded-xl border border-border/70 bg-muted/60 px-4 py-3.5">
        <p className="text-xs font-semibold text-foreground">
          This proposal can no longer be accepted.
        </p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          Please contact {agencyName} for an updated proposal.
        </p>
      </div>
    ) : null
  ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Slim share header: the wordmark and who prepared this page. */}
      <header className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3.5">
          <Link
            to="/"
            aria-label="waytowalk home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/brand/waytowalk-logo-name.svg" alt="waytowalk" width="140" height="28" className="h-7 w-[140px] dark:hidden" />
            <img src="/brand/waytowalk-logo-reverse.svg" alt="waytowalk" width="140" height="28" className="hidden h-7 w-[140px] dark:block" />
          </Link>
          <p className="truncate text-[11px] text-muted-foreground">
            Prepared by{" "}
            <span className="font-semibold text-foreground">
              {proposal?.agency.name?.trim() || "your agency"}
            </span>
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:pt-10">
        {loading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold text-foreground">
                Preparing your proposal…
              </p>
              <p className="text-[11px] text-muted-foreground">
                Rendering the document your agent prepared
              </p>
            </div>
          </div>
        ) : error || !proposal ? (
          <div className="mx-auto my-12 max-w-lg space-y-5 rounded-2xl border border-border/70 bg-card p-8 text-center shadow-card sm:p-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Proposal not available
              </h1>
              <p className="text-xs leading-5 text-muted-foreground">
                {error ||
                  "The link you followed may be invalid, expired or withdrawn."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {liveDocument ? (
              <LiveProposalDocument document={liveDocument}>
                {answerPanel}
              </LiveProposalDocument>
            ) : (
              <article className="space-y-6 rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-4">
                    <AgencyLogoTile
                      name={proposal.agency.name || "Agency"}
                      className="h-14 w-14 rounded-xl text-lg sm:h-16 sm:w-16"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                        {proposal.agency.name || "Your travel agency"}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Travel agency
                      </p>
                    </div>
                  </div>
                  {statusBadge()}
                </div>

                <div className="space-y-2">
                  <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                    {proposal.trip.title}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {quote
                      ? `Proposal ${quote.number} · version ${quote.version}`
                      : proposal.templateName}
                  </p>
                </div>

                {answerPanel}

                {quote ? (
                  <section className="space-y-3">
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                      What’s included
                    </h2>
                    <div className="overflow-hidden rounded-xl border border-border/70">
                      {quote.lineItems.length > 0 ? (
                        <>
                          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-border/70 bg-background/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                            <span>Item</span>
                            <span>Notes</span>
                            <span className="text-right">Amount</span>
                          </div>
                          <ul className="divide-y divide-border/50">
                            {quote.lineItems.map((item, index) => (
                              <li
                                key={`${item.label}-${index}`}
                                className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-baseline sm:gap-4"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-foreground">
                                    {item.label}
                                  </p>
                                  {item.quantity !== 1 ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      {item.quantity} ×{" "}
                                      {formatMoney(item.unitPrice, quote.currency)}
                                    </p>
                                  ) : null}
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  {item.description ?? ""}
                                </p>
                                <p className="text-xs font-semibold tabular-nums text-foreground sm:text-right">
                                  {formatMoney(item.total, quote.currency)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <div className="flex items-baseline justify-between gap-4 border-t border-border/70 bg-background/60 px-4 py-3">
                        <span className="text-xs font-semibold text-foreground">
                          Total
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatMoney(quote.total, quote.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-[11px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                      {quote.taxAmount > 0 ? (
                        <span>
                          Includes tax
                          {quote.taxPct ? ` (${quote.taxPct}%)` : ""}{" "}
                          {formatMoney(quote.taxAmount, quote.currency)}
                        </span>
                      ) : null}
                      {quote.discount > 0 ? (
                        <span>
                          Discount −{formatMoney(quote.discount, quote.currency)}
                        </span>
                      ) : null}
                      {quote.perPerson > 0 ? (
                        <span>
                          {formatMoney(quote.perPerson, quote.currency)} per person
                        </span>
                      ) : null}
                      {quote.validUntil ? (
                        <span>
                          Price held until {formatDateOnly(quote.validUntil)}
                        </span>
                      ) : null}
                    </div>

                    {quote.inclusions.length > 0 ||
                    quote.exclusions.length > 0 ||
                    quote.terms.length > 0 ? (
                      <div className="grid gap-4 border-t border-border/60 pt-4 text-[11px] sm:grid-cols-3">
                        <QuoteList title="Included" items={quote.inclusions} tone="accent" />
                        <QuoteList title="Not included" items={quote.exclusions} tone="muted" />
                        <QuoteList title="Terms" items={quote.terms} tone="muted" />
                      </div>
                    ) : null}

                    <a
                      href="#proposal-document"
                      className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                      Open the full document
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </section>
                ) : null}
              </article>
            )}

            {proposal.documentMode !== "live" ? (
              <section
                id="proposal-document"
                className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-foreground">
                      The document {proposal.agency.name || "your agency"} sent
                    </h2>
                    {proposal.pageCount > 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        · {proposal.pageCount} page
                        {proposal.pageCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {proposal.pdf && token ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <a href={api.getAgencyProposalPdfUrl(token)}>
                        <Download className="h-3.5 w-3.5" />
                        Download PDF
                      </a>
                    </Button>
                  ) : null}
                </div>

                {proposal.documentMode === "pdf" ? (
                  pdfError ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center text-xs text-destructive">
                      <AlertCircle className="h-5 w-5" aria-hidden="true" />
                      {pdfError}
                    </div>
                  ) : (
                    <PdfDocumentViewer
                      source={pdfBlob}
                      title={proposal.trip.title}
                      className="h-[75vh]"
                    />
                  )
                ) : (
                  <iframe
                    title={`${proposal.trip.title} proposal`}
                    srcDoc={proposal.html}
                    sandbox=""
                    className="h-[75vh] w-full rounded-xl border border-border/70 bg-card"
                  />
                )}
              </section>
            ) : null}

            <p className="flex items-start gap-2 border-t border-border/60 pt-4 text-[11px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                This page shows only what {agencyName} prepared for you. Your link
                is private — treat it like a key to this proposal.
              </span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

const QuoteList: React.FC<{
  title: string;
  items: string[];
  tone: "accent" | "muted";
}> = ({ title, items, tone }) => {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {items.map((line, index) => (
          <li key={`${line}-${index}`} className="flex gap-1.5 leading-5">
            {tone === "accent" ? (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">·</span>
            )}
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProposalShare;
