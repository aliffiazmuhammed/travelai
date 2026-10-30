import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CalendarRange, MapPin } from 'lucide-react';
import { EVENT_KIND_LABELS, eventPriceLabel, spotsLabel } from '@/lib/events';
import { cn } from '@/lib/utils';
import type { PublicEventSummary } from '@/types/events';

/**
 * One public event, as a traveller sees it on Explore or an agency page.
 *
 * Presentational only and anonymous-safe: the cover is the public
 * `/api/events/:id/cover` path (no token needed), and every figure shown comes
 * from the server projection. A card whose cover 404s falls back to a tile
 * rather than a broken image.
 */
export const PublicEventCard = ({
  event,
  showAgency = false,
  className,
}: {
  event: PublicEventSummary;
  /** Off on the agency's own page, where every card has the same host. */
  showAgency?: boolean;
  className?: string;
}) => {
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [event.coverUrl]);

  const showCover = Boolean(event.coverUrl) && !coverFailed;
  const spots = spotsLabel(event.spotsLeft);
  const place = [event.destination, event.venue].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xs transition-shadow hover:shadow-md',
        className
      )}
      aria-label={event.title}
    >
      <Link to={`/explore/events/${event._id}`} className="block">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary/15 via-card to-muted">
          {showCover ? (
            <img
              src={event.coverUrl ?? undefined}
              alt={event.title}
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-primary/60">
              <CalendarRange className="h-10 w-10" />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-bold text-foreground backdrop-blur">
            {EVENT_KIND_LABELS[event.kind]}
          </span>
        </div>
      </Link>

      <div className="space-y-3 p-5">
        <Link to={`/explore/events/${event._id}`} className="block">
          <h3 className="text-base font-black leading-snug text-foreground transition-colors group-hover:text-primary">
            {event.title}
          </h3>
        </Link>

        {event.summary && (
          <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
            {event.summary}
          </p>
        )}

        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <p className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
            <CalendarDays className="h-3.5 w-3.5" />
            {event.dates.label || event.dates.startDate}
          </p>
          {place && (
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{place}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-[11px]">
          <span className="font-bold text-foreground">{eventPriceLabel(event)}</span>
          {spots && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-semibold',
                event.spotsLeft === 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {spots}
            </span>
          )}
        </div>

        {showAgency && (
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
            <span className="truncate font-semibold text-muted-foreground">
              {event.agency.name}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-bold text-primary transition-all group-hover:gap-1.5">
              See the details
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </article>
  );
};
