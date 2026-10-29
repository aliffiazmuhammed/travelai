import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Users,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/services/api';
import {
  TRAVELLER_ENQUIRY_STATUS_LABELS,
  travellerEnquiryStatusBadgeClass,
  formatAgencyDate,
} from '@/lib/agency';
import { cn } from '@/lib/utils';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import type { AgencyEnquiry } from '@/types/agency';

const PAGE_SIZE = 20;

function datesSummary(enquiry: AgencyEnquiry): string {
  if (enquiry.dates.flexible && !enquiry.dates.start) return 'Flexible dates';
  if (!enquiry.dates.start) return 'No dates given';
  const start = formatAgencyDate(enquiry.dates.start);
  return enquiry.dates.end
    ? `${start} – ${formatAgencyDate(enquiry.dates.end)}`
    : `From ${start}`;
}

function partySummary(enquiry: AgencyEnquiry): string {
  const { adults, children } = enquiry.party;
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  }
  return parts.join(' · ');
}

/**
 * `/enquiries` (Milestone 9).
 *
 * The traveller's own list of everything they asked an agency about, in one
 * place: which agency, which package, the dates and party, whether a reply or a
 * proposal is waiting, and the way into the conversation. Anonymous submissions
 * are never attributed to a session, so only rows sent while signed in appear.
 */
const Enquiries: React.FC = () => {
  const [enquiries, setEnquiries] = useState<AgencyEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Newer reads win: a quiet refresh can start while the first page is still in
  // flight, and an older response must never overwrite a fresher list.
  const requestSeq = useRef(0);

  /**
   * `quiet` is the live/poll path: it refreshes in place without the spinner
   * and, on failure, leaves the rows already on screen alone.
   */
  const loadFirstPage = useCallback(async (quiet: boolean) => {
    const seq = ++requestSeq.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const page = await api.getMyEnquiries({ limit: PAGE_SIZE });
      if (seq !== requestSeq.current) return;
      setEnquiries(page.enquiries || []);
      setTotal(page.total ?? 0);
      setNextCursor(page.hasMore ? page.nextCursor : null);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current || quiet) return;
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Your enquiries could not be loaded right now.'
      );
    } finally {
      // Clear the spinner even when a fresher quiet read already won the race.
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage(false);
  }, [loadFirstPage, reloadKey]);

  // Live replies on frames; 20s polling while the tier is off (R2).
  const liveMode = useEnquiryLiveRefresh(
    useCallback(() => loadFirstPage(true), [loadFirstPage])
  );

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const page = await api.getMyEnquiries({ limit: PAGE_SIZE, cursor: nextCursor });
      if (seq !== requestSeq.current) return;
      setEnquiries((previous) => [...previous, ...(page.enquiries || [])]);
      setNextCursor(page.hasMore ? page.nextCursor : null);
    } catch {
      if (seq === requestSeq.current) {
        setError('Older enquiries could not be loaded. Try again.');
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const unreadThreads = enquiries.filter(
    (enquiry) => enquiry.unread.traveller > 0
  ).length;
  const proposalTotal = enquiries.reduce(
    (sum, enquiry) => sum + (enquiry.proposals?.count ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navbar />
      <main className="container mx-auto max-w-5xl px-4 pb-20 pt-24">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Your conversations
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
              <Inbox className="h-5 w-5 text-primary" />
              Enquiries
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every trip you asked an agency about. Replies and proposals arrive
              in the conversation, so this is where you pick one back up.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {liveMode === 'live' ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
                title="Replies appear here as they arrive"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            ) : null}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              <Link to="/proposals">
                <FileText className="h-3.5 w-3.5" />
                Compare proposals
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-bold gap-1.5"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {!loading && enquiries.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 font-bold text-foreground">
              {total} {total === 1 ? 'enquiry' : 'enquiries'}
            </span>
            {unreadThreads > 0 ? (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                {unreadThreads} with a new reply
              </span>
            ) : null}
            {proposalTotal > 0 ? (
              <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 font-bold text-foreground">
                {proposalTotal} {proposalTotal === 1 ? 'proposal' : 'proposals'}
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <Card className="mb-4 rounded-3xl border-destructive/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-xs font-semibold text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl text-xs font-bold"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gathering your enquiries…
          </div>
        ) : enquiries.length === 0 ? (
          <Card className="rounded-3xl border-dashed border-border/80">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Inbox className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">No enquiries yet</p>
                <p className="mx-auto max-w-md text-xs text-muted-foreground">
                  Find an agency you like and ask about a trip. The conversation
                  and every reply will show up here.
                </p>
              </div>
              <Button asChild size="sm" className="rounded-xl text-xs font-bold gap-1.5">
                <Link to="/agencies">
                  Browse agencies
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {enquiries.map((enquiry) => {
              const proposals = enquiry.proposals?.count ?? 0;
              return (
                <Card
                  key={enquiry.id}
                  className="rounded-3xl border-border/70 transition-colors hover:border-primary/40"
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        {enquiry.agency ? (
                          <Link
                            to={`/agencies/${encodeURIComponent(enquiry.agency.slug)}`}
                            className="truncate text-base font-bold text-foreground hover:text-primary hover:underline"
                          >
                            {enquiry.agency.name}
                          </Link>
                        ) : (
                          <span className="text-base font-bold text-foreground">
                            An agency
                          </span>
                        )}
                        <p className="text-xs font-semibold text-foreground/80">
                          {enquiry.package ? enquiry.package.title : 'General enquiry'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                            travellerEnquiryStatusBadgeClass(enquiry.status)
                          )}
                        >
                          {TRAVELLER_ENQUIRY_STATUS_LABELS[enquiry.status]}
                        </span>
                        {enquiry.unread.traveller > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {enquiry.unread.traveller} new
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3" />
                        {datesSummary(enquiry)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        {partySummary(enquiry)}
                      </span>
                      <span>
                        Sent{' '}
                        {enquiry.createdAt ? formatAgencyDate(enquiry.createdAt) : 'recently'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {enquiry.lastMessageAt
                            ? `Last message ${
                                enquiry.lastMessageBy === 'agency'
                                  ? 'from the agency'
                                  : 'from you'
                              } · ${formatAgencyDate(enquiry.lastMessageAt)}`
                            : 'No reply yet'}
                        </span>
                        {proposals > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            <FileText className="h-2.5 w-2.5" />
                            {proposals} {proposals === 1 ? 'proposal' : 'proposals'}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {proposals > 0 ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl text-[11px] font-bold gap-1 px-2.5"
                          >
                            <Link to="/proposals">View proposals</Link>
                          </Button>
                        ) : null}
                        <Button
                          asChild
                          size="sm"
                          className="h-8 rounded-xl text-[11px] font-bold gap-1.5 px-3"
                        >
                          <Link to={`/enquiry/${enquiry.id}`}>
                            <MessageSquare className="h-3 w-3" />
                            Open conversation
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {nextCursor ? (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold gap-1.5"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Load older enquiries
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

export default Enquiries;
