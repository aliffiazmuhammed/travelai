import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import PdfDocumentViewer from "@/components/agency/PdfDocumentViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { api } from "@/services/api";
import { formatMoney } from "@/lib/currency";
import { formatDate, formatDateOnly } from "@/lib/date";
import type { AgencyProposalView } from "@/types/agency";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";

/**
 * Public proposal share (A7). No account, no session: the token in the URL is
 * the only capability. The document below is the exact export staff generated
 * — it renders inside a fully sandboxed iframe, and every figure on this page
 * comes from the client-safe quote projection (no markup, no internal notes).
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
  const expiryLabel = proposal?.expiresAt
    ? formatDate(proposal.expiresAt)
    : null;

  const statusBadge = () => {
    if (proposal?.declined) {
      return (
        <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          Declined
        </Badge>
      );
    }
    if (!quote) return null;
    switch (quote.status) {
      case "accepted":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Accepted
          </Badge>
        );
      case "sent":
        return (
          <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            Awaiting your acceptance
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Expired
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            Cancelled
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[450px] space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Preparing your proposal…
              </h3>
              <p className="text-xs text-muted-foreground">
                Rendering the document your agent prepared
              </p>
            </div>
          </div>
        ) : error || !proposal ? (
          <div className="p-8 sm:p-12 text-center rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card max-w-lg mx-auto my-12 space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Proposal Not Available
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error ||
                  "The link you followed may be invalid, expired or withdrawn."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <TravellerBreadcrumbs items={[{ label: "Your proposal" }]} />

            {/* Header: agency, trip and quote identity */}
            <div className="p-5 rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    {proposal.agency.name || "Your travel agency"}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {proposal.trip.title}
                  </h1>
                  {quote ? (
                    <p className="text-xs text-muted-foreground">
                      Proposal {quote.number} · version {quote.version} ·{" "}
                      {proposal.templateName}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {proposal.templateName}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                  {statusBadge()}
                  {expiryLabel ? (
                    <p className="text-[11px] text-muted-foreground">
                      Link valid until {expiryLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Accept / accepted / declined banner */}
              {proposal.accepted ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-100/80 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold">
                      You have accepted this proposal.
                    </span>
                    {proposal.acceptedAt ? (
                      <p className="text-[11px] opacity-80">
                        Accepted on{" "}
                        {formatDate(proposal.acceptedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : proposal.declined ? (
                <div className="p-3 rounded-2xl bg-rose-100/70 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
                  <p className="text-xs font-bold">
                    You declined this proposal.
                  </p>
                  <p className="text-[11px] opacity-80">
                    Ask {proposal.agency.name || "your agent"} for an updated
                    one if you change your mind.
                  </p>
                </div>
              ) : proposal.canAccept ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-primary/10 border border-primary/20">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground">
                      Ready when you are
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {confirming
                        ? "Acceptance is final — it confirms the trip and locks this quote."
                        : "Accept this proposal to confirm your trip with the agency."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={confirming ? "hero" : "outline"}
                    onClick={handleAccept}
                    disabled={accepting}
                    className="rounded-xl h-9 px-4 text-xs font-bold gap-1.5 shrink-0"
                  >
                    {accepting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : confirming ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : null}
                    <span>
                      {confirming ? "Confirm acceptance" : "Accept proposal"}
                    </span>
                  </Button>
                </div>
              ) : quote?.status === "expired" || quote?.status === "cancelled" ? (
                <div className="p-3 rounded-2xl bg-amber-100/70 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300">
                  <p className="text-xs font-bold">
                    This proposal can no longer be accepted.
                  </p>
                  <p className="text-[11px] opacity-80">
                    Please contact {proposal.agency.name || "your agent"} for an
                    updated proposal.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Client-safe quote summary */}
            {quote ? (
              <div className="p-5 rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Quote summary
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-bold">Item</th>
                        <th className="py-2 pr-3 font-bold text-right">Qty</th>
                        <th className="py-2 pr-3 font-bold text-right">
                          Unit price
                        </th>
                        <th className="py-2 font-bold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lineItems.map((item, index) => (
                        <tr
                          key={`${item.label}-${index}`}
                          className="border-b border-border/50"
                        >
                          <td className="py-2 pr-3">
                            <span className="font-semibold text-foreground">
                              {item.label}
                            </span>
                            {item.description ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {item.description}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-right text-foreground">
                            {item.quantity}
                          </td>
                          <td className="py-2 pr-3 text-right text-foreground">
                            {formatMoney(item.unitPrice, quote.currency)}
                          </td>
                          <td className="py-2 text-right font-semibold text-foreground">
                            {formatMoney(item.total, quote.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-end gap-1.5 text-xs">
                  <div className="sm:w-64 space-y-1.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="text-foreground">
                        {formatMoney(quote.subtotal, quote.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax ({quote.taxPct}%)</span>
                      <span className="text-foreground">
                        {formatMoney(quote.taxAmount, quote.currency)}
                      </span>
                    </div>
                    {quote.discount > 0 ? (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Discount</span>
                        <span className="text-foreground">
                          −{formatMoney(quote.discount, quote.currency)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                      <span>Total</span>
                      <span>{formatMoney(quote.total, quote.currency)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Per person</span>
                      <span>{formatMoney(quote.perPerson, quote.currency)}</span>
                    </div>
                    {quote.validUntil ? (
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Quote valid until</span>
                        <span>
                          {formatDateOnly(quote.validUntil)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {(quote.inclusions.length > 0 ||
                  quote.exclusions.length > 0 ||
                  quote.terms.length > 0) && (
                  <div className="grid gap-4 sm:grid-cols-3 pt-2">
                    {quote.inclusions.length > 0 ? (
                      <div className="space-y-1.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Included
                        </h3>
                        <ul className="space-y-1 text-[11px] text-muted-foreground">
                          {quote.inclusions.map((line, index) => (
                            <li key={index} className="flex gap-1.5">
                              <span className="text-emerald-500">✓</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {quote.exclusions.length > 0 ? (
                      <div className="space-y-1.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Not included
                        </h3>
                        <ul className="space-y-1 text-[11px] text-muted-foreground">
                          {quote.exclusions.map((line, index) => (
                            <li key={index} className="flex gap-1.5">
                              <span className="text-rose-500">✕</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {quote.terms.length > 0 ? (
                      <div className="space-y-1.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Terms
                        </h3>
                        <ul className="space-y-1 text-[11px] text-muted-foreground">
                          {quote.terms.map((line, index) => (
                            <li key={index} className="flex gap-1.5">
                              <span className="text-slate-400">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {/* The exact document staff generated */}
            <div className="p-5 rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Your proposal document
                  </h2>
                  {proposal.pdf ? (
                    <span className="text-[11px] text-muted-foreground">
                      · {proposal.pageCount} page{proposal.pageCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {proposal.pdf ? (
                  <a
                    href={api.getAgencyProposalPdfUrl(token!)}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </a>
                ) : null}
              </div>
              {proposal.documentMode === "pdf" ? (
                pdfError ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-16 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                    <AlertCircle className="h-5 w-5" />
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
                  className="h-[75vh] w-full rounded-2xl border border-slate-200 bg-white"
                />
              )}
            </div>

            {/* Privacy note */}
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-100/70 border border-slate-200 text-[11px] text-muted-foreground dark:bg-slate-900/40 dark:border-slate-800">
              <ShieldCheck className="w-4 h-4 shrink-0 text-primary mt-0.5" />
              <span>
                This page shows only what {proposal.agency.name || "your agency"}{" "}
                prepared for you. Your link is private — treat it like a key to
                this proposal.
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProposalShare;
