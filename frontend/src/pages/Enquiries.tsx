import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { TravellerPageHeader } from '@/components/traveller/TravellerPageHeader';
import { TravellerSegmented } from '@/components/traveller/TravellerSegmented';
import EnquiryThreadPane from '@/components/traveller/EnquiryThreadPane';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import {
  travellerEnquiryStatusLabel,
  travellerEnquiryStatusBadgeClass,
  formatAgencyDate,
} from '@/lib/agency';
import { cn } from '@/lib/utils';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import type { AgencyEnquiry } from '@/types/agency';

const PAGE_SIZE = 20;

const FILTERS = ['all', 'unread', 'proposals', 'closed'] as const;
type EnquiryFilter = (typeof FILTERS)[number];

function isFilter(value: string | null): value is EnquiryFilter {
  return value !== null && (FILTERS as readonly string[]).includes(value);
}

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
 * `/enquiries` (Milestone 9, rebuilt as an inbox).
 *
 * The traveller's own list of everything they asked an agency about, beside
 * the thread they pick. On a wide screen the list and the conversation share
 * the page; on a phone the thread takes over and a back button returns. The
 * open row and the filter live in the URL, so a refresh keeps your place.
 */
const Enquiries: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const filterParam = searchParams.get('filter');
  const filter: EnquiryFilter = isFilter(filterParam) ? filterParam : 'all';

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

  const openEnquiry = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('open', id);
    setSearchParams(next, { replace: true });
  };

  const closeEnquiry = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  };

  const setFilter = (value: EnquiryFilter) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setSearchParams(next, { replace: true });
  };

  const unreadThreads = useMemo(
    () => enquiries.filter((enquiry) => enquiry.unread.traveller > 0).length,
    [enquiries]
  );
  const proposalTotal = useMemo(
    () =>
      enquiries.reduce(
        (sum, enquiry) => sum + (enquiry.proposals?.count ?? 0),
        0
      ),
    [enquiries]
  );
  const closedThreads = useMemo(
    () =>
      enquiries.filter(
        (enquiry) => enquiry.status === 'won' || enquiry.status === 'lost'
      ).length,
    [enquiries]
  );

  const visibleEnquiries = useMemo(
    () =>
      enquiries.filter((enquiry) => {
        if (filter === 'unread') return enquiry.unread.traveller > 0;
        if (filter === 'proposals') return (enquiry.proposals?.count ?? 0) > 0;
        if (filter === 'closed') {
          return enquiry.status === 'won' || enquiry.status === 'lost';
        }
        return true;
      }),
    [enquiries, filter]
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        <TravellerPageHeader
          eyebrow="Your conversations"
          icon={Inbox}
          title="Enquiries"
          description="Every trip you asked an agency about. Replies and proposals arrive in the conversation, so this is where you pick one back up."
          crumbs={[{ label: 'Enquiries' }]}
          meta={
            liveMode === 'live' ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                title="Replies appear here as they arrive"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live
              </span>
            ) : null
          }
          actions={
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-semibold gap-1.5"
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
                className="rounded-xl text-xs font-semibold gap-1.5"
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
            </>
          }
          className="mb-5"
        />

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-xs font-semibold text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl text-xs font-semibold"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </div>
        ) : null}

        <div
          className={cn(
            'grid gap-4',
            openId && 'lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]'
          )}
        >
          <section
            aria-label="Enquiry list"
            className={cn('min-w-0 space-y-3', openId && 'hidden lg:block')}
          >
            {!loading && enquiries.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TravellerSegmented<EnquiryFilter>
                  ariaLabel="Filter enquiries"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: total },
                    { value: 'unread', label: 'New replies', count: unreadThreads },
                    { value: 'proposals', label: 'Proposals', count: proposalTotal },
                    { value: 'closed', label: 'Closed', count: closedThreads },
                  ]}
                />
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {filteredCountLabel(filter, visibleEnquiries.length)}
                </span>
              </div>
            ) : null}

            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="h-28 animate-pulse rounded-2xl border border-border/60 bg-card"
                  />
                ))}
              </div>
            ) : enquiries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-card p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Inbox className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">No enquiries yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  Find an agency you like and ask about a trip. The conversation
                  and every reply will show up here.
                </p>
                <Button asChild size="sm" className="mt-4 rounded-xl text-xs font-semibold gap-1.5">
                  <Link to="/agencies">
                    Browse agencies
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : visibleEnquiries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-card p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Nothing in this view
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try another filter, or clear it to see every enquiry.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-xl text-xs font-semibold"
                  onClick={() => setFilter('all')}
                >
                  Show all enquiries
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEnquiries.map((enquiry) => {
                  const proposals = enquiry.proposals?.count ?? 0;
                  const selected = openId === enquiry.id;
                  return (
                    <article
                      key={enquiry.id}
                      role="button"
                      tabIndex={0}
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => openEnquiry(enquiry.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openEnquiry(enquiry.id);
                        }
                      }}
                      className={cn(
                        'cursor-pointer rounded-2xl border bg-card p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                        selected
                          ? 'border-primary/60 ring-1 ring-primary/20'
                          : 'border-border/70 hover:border-primary/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          {enquiry.agency ? (
                            <Link
                              to={`/agencies/${encodeURIComponent(enquiry.agency.slug)}`}
                              onClick={(event) => event.stopPropagation()}
                              className="block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {enquiry.agency.name}
                            </Link>
                          ) : (
                            <span className="block truncate text-sm font-semibold text-foreground">
                              An agency
                            </span>
                          )}
                          <p className="truncate text-[11px] font-medium text-foreground/75">
                            {enquiry.package ? enquiry.package.title : 'General enquiry'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                            travellerEnquiryStatusBadgeClass(enquiry.status, proposals > 0)
                          )}
                        >
                          {travellerEnquiryStatusLabel(enquiry.status, proposals > 0)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {datesSummary(enquiry)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {partySummary(enquiry)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {enquiry.unread.traveller > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground">
                              <MessageSquare className="h-2.5 w-2.5" />
                              {enquiry.unread.traveller} new
                            </span>
                          ) : enquiry.lastMessageAt ? (
                            <span>
                              Last message{' '}
                              {enquiry.lastMessageBy === 'agency' ? 'from them' : 'from you'}
                            </span>
                          ) : (
                            <span>No reply yet</span>
                          )}
                        </span>
                        {proposals > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            <FileText className="h-2.5 w-2.5" />
                            {proposals}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {nextCursor ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs font-semibold gap-1.5"
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
          </section>

          {openId ? (
            <section aria-label="Conversation" className="min-w-0">
              <EnquiryThreadPane
                key={openId}
                enquiryId={openId}
                onClose={closeEnquiry}
                onRead={() => void loadFirstPage(true)}
              />
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
};

function filteredCountLabel(filter: EnquiryFilter, visible: number): string {
  if (filter === 'all') return `${visible} ${visible === 1 ? 'thread' : 'threads'}`;
  if (filter === 'unread') return `${visible} with a new reply`;
  if (filter === 'proposals') return `${visible} with proposals`;
  return `${visible} closed`;
}

export default Enquiries;
