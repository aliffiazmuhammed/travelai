import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { TravellerBreadcrumbs } from '@/components/traveller/TravellerBreadcrumbs';
import EnquiryThreadPane from '@/components/traveller/EnquiryThreadPane';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import {
  travellerEnquiryStatusLabel,
  travellerEnquiryStatusBadgeClass,
} from '@/lib/agency';
import { formatRelative } from '@/lib/date';
import { cn } from '@/lib/utils';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import type { AgencyEnquiry } from '@/types/agency';

const PAGE_SIZE = 20;

const FILTERS = ['all', 'replied', 'quote', 'open'] as const;
type EnquiryFilter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<EnquiryFilter, string> = {
  all: 'All',
  replied: 'Replied',
  quote: 'Quote received',
  open: 'In progress',
};

/** A filter saved under the old tab names still lands on its closest match. */
const FILTER_ALIASES: Record<string, EnquiryFilter> = { proposals: 'quote' };

function resolveFilter(value: string | null): EnquiryFilter {
  if (value === null) return 'all';
  if ((FILTERS as readonly string[]).includes(value)) return value as EnquiryFilter;
  return FILTER_ALIASES[value] ?? 'all';
}

/**
 * The four tabs answer the traveller's question, not the agency's pipeline:
 * a reply arrived, a quote arrived, or the thread is still waiting.
 */
function matchesFilter(enquiry: AgencyEnquiry, filter: EnquiryFilter): boolean {
  switch (filter) {
    case 'replied':
      return enquiry.status === 'replied';
    case 'quote':
      return (enquiry.proposals?.count ?? 0) > 0 || enquiry.status === 'quoted';
    case 'open':
      return enquiry.status === 'new';
    default:
      return true;
  }
}

/**
 * `/enquiries` (Milestone 9, rebuilt as an inbox).
 *
 * The traveller's own list of everything they asked an agency about, beside
 * the thread they pick. On a wide screen the list and the conversation share
 * one card; on a phone the thread takes over and a back button returns. The
 * open row and the filter live in the URL, so a refresh keeps your place.
 */
const Enquiries: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const filterParam = searchParams.get('filter');
  const filter: EnquiryFilter = resolveFilter(filterParam);

  const [enquiries, setEnquiries] = useState<AgencyEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
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

  // Stable identity: the open thread calls this after clearing its unread count.
  const refreshAfterRead = useCallback(() => {
    void loadFirstPage(true);
  }, [loadFirstPage]);

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

  // Counts read the rows on screen; `All` keeps the server's total so paging
  // does not look like enquiries disappearing.
  const counts = useMemo(() => {
    const tally = (predicate: (enquiry: AgencyEnquiry) => boolean) =>
      enquiries.filter(predicate).length;
    return {
      all: total,
      replied: tally((enquiry) => matchesFilter(enquiry, 'replied')),
      quote: tally((enquiry) => matchesFilter(enquiry, 'quote')),
      open: tally((enquiry) => matchesFilter(enquiry, 'open')),
    } satisfies Record<EnquiryFilter, number>;
  }, [enquiries, total]);

  const visibleEnquiries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enquiries.filter((enquiry) => {
      if (!matchesFilter(enquiry, filter)) return false;
      if (!needle) return true;
      const haystack = [
        enquiry.agency?.name,
        enquiry.package?.title,
        enquiry.contact?.name,
        enquiry.message,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [enquiries, filter, query]);

  const clearViews = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main
        className={cn(
          'container mx-auto max-w-6xl px-4 pb-16 pt-24',
          openId && 'lg:flex lg:h-[100dvh] lg:flex-col lg:pb-6'
        )}
      >
        <header className="space-y-3">
          <TravellerBreadcrumbs items={[{ label: 'Enquiries' }]} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Your enquiries
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Replies from agencies land here.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {liveMode === 'live' ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent"
                  title="Replies appear here as they arrive"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Live
                </span>
              ) : null}
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-[11px] font-semibold"
              >
                <Link to="/proposals">
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Compare proposals
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-[11px] font-semibold"
                onClick={() => setReloadKey((key) => key + 1)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-xs font-semibold text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full text-[11px] font-semibold"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </div>
        ) : null}

        <div
          className={cn(
            'mt-5 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
            openId && 'lg:min-h-0 lg:flex-1'
          )}
        >
          <div
            className={cn(
              'grid min-w-0 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]',
              openId && 'lg:h-full'
            )}
          >
            <section
              aria-label="Enquiry list"
              className={cn(
                'flex min-w-0 flex-col lg:border-r lg:border-border/70',
                openId && 'hidden lg:flex lg:min-h-0'
              )}
            >
              <div className="shrink-0 space-y-3 border-b border-border/70 px-3 py-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search enquiries, agencies or destinations…"
                    aria-label="Search enquiries"
                    className="h-9 rounded-full border-border/70 bg-background pl-9 text-xs"
                  />
                </div>

                {!loading && enquiries.length > 0 ? (
                  <div
                    role="group"
                    aria-label="Filter enquiries"
                    className="flex flex-wrap items-center gap-1"
                  >
                    {FILTERS.map((value) => {
                      const active = value === filter;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setFilter(value)}
                          className={cn(
                            'inline-flex min-h-[28px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active
                              ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {FILTER_LABELS[value]}
                          <span className="text-[10px] tabular-nums opacity-80">
                            {counts[value]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div
                className={cn(
                  'min-h-0 overflow-y-auto overscroll-contain',
                  openId ? 'flex-1' : 'max-h-[62vh]'
                )}
              >
                {loading ? (
                  <div className="space-y-2 p-3">
                    {[0, 1, 2, 3].map((row) => (
                      <div
                        key={row}
                        className="h-24 animate-pulse rounded-xl border border-border/60 bg-muted/40"
                      />
                    ))}
                  </div>
                ) : enquiries.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      No enquiries yet
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                      Find an agency you like and ask about a trip. The conversation
                      and every reply will show up here.
                    </p>
                    <Button
                      asChild
                      size="sm"
                      className="mt-4 h-8 rounded-full text-[11px] font-semibold"
                    >
                      <Link to="/agencies">
                        Browse agencies
                        <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ) : visibleEnquiries.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      Nothing in this view
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try another filter or search term, or clear both to see every
                      enquiry.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 h-8 rounded-full text-[11px] font-semibold"
                      onClick={clearViews}
                    >
                      Show all enquiries
                    </Button>
                  </div>
                ) : (
                  <div>
                    {visibleEnquiries.map((enquiry) => {
                      const proposals = enquiry.proposals?.count ?? 0;
                      const selected = openId === enquiry.id;
                      const agencyName = enquiry.agency?.name ?? 'An agency';
                      const stamp = enquiry.lastMessageAt || enquiry.createdAt;
                      const unread = enquiry.unread.traveller;
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
                            'group cursor-pointer border-b border-border/60 px-3 py-3 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                            selected
                              ? 'bg-primary/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <AgencyLogoTile
                              name={agencyName}
                              className="mt-0.5 h-10 w-10 rounded-xl text-sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                {enquiry.agency ? (
                                  <Link
                                    to={`/agencies/${encodeURIComponent(enquiry.agency.slug)}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="min-w-0 truncate text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                                  >
                                    {enquiry.agency.name}
                                  </Link>
                                ) : (
                                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                                    An agency
                                  </span>
                                )}
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {stamp ? formatRelative(stamp) : ''}
                                </span>
                              </div>
                              <p className="truncate text-[11px] font-medium text-foreground/75">
                                {enquiry.package ? enquiry.package.title : 'General enquiry'}
                              </p>
                              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                                {enquiry.message}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {unread > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                      <MessageSquare className="h-2.5 w-2.5" aria-hidden />
                                      {unread} new
                                    </span>
                                  ) : null}
                                  {proposals > 0 ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                                      title={`${proposals} ${proposals === 1 ? 'proposal' : 'proposals'}`}
                                    >
                                      <FileText className="h-2.5 w-2.5" aria-hidden />
                                      {proposals}
                                    </span>
                                  ) : null}
                                </span>
                                <span
                                  className={cn(
                                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                    travellerEnquiryStatusBadgeClass(
                                      enquiry.status,
                                      proposals > 0
                                    )
                                  )}
                                >
                                  {travellerEnquiryStatusLabel(
                                    enquiry.status,
                                    proposals > 0
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                    {nextCursor ? (
                      <div className="flex justify-center p-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full text-[11px] font-semibold"
                          onClick={() => void loadMore()}
                          disabled={loadingMore}
                        >
                          {loadingMore ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Load older enquiries
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            {openId ? (
              <section
                aria-label="Conversation"
                className="flex min-w-0 flex-col border-t border-border/70 lg:min-h-0 lg:border-t-0"
              >
                <EnquiryThreadPane
                  key={openId}
                  enquiryId={openId}
                  onClose={closeEnquiry}
                  onRead={refreshAfterRead}
                  className="min-h-0 flex-1"
                />
              </section>
            ) : (
              <div className="hidden flex-col items-center justify-center px-8 py-16 text-center lg:flex">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Pick an enquiry
                </p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                  Open a row to read the conversation, the agency&rsquo;s replies and
                  any proposal. Nothing is sent until you write back.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Enquiries;
