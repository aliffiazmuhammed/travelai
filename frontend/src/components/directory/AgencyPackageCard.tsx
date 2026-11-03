import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Compass, MessageCircle, Route, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * One published trip package, as travellers see it (M9 D4).
 *
 * Presentational only: the builder feeds it the live draft (with the tenant's
 * authenticated cover resolved to an object URL), and the public profile feeds
 * it the snapshot with a public cover URL. The snapshot is the whole story —
 * there is no link back to the source trip anywhere on the card.
 */
export interface AgencyPackageCardModel {
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  /** Already resolved for rendering; falls back to a deterministic tile. */
  coverUrl?: string | null;
  highlights?: string[];
  inclusions?: string[];
}

const TONES = [
  'from-teal-600 via-teal-500 to-sky-600',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-sky-600 via-indigo-500 to-violet-600',
  'from-emerald-600 via-teal-500 to-cyan-600',
] as const;

function toneFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

function nightsLabel(nights: number): string {
  if (nights <= 0) return 'Day trip';
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

export const AgencyPackageCard: React.FC<{
  package: AgencyPackageCardModel;
  className?: string;
  /** Public profile only: opens the day-by-day plan for this package. */
  onOpen?: () => void;
  /** Public profile only: opens the enquiry form for this package. */
  onEnquire?: () => void;
}> = ({ package: pkg, className, onOpen, onEnquire }) => {
  const title = pkg.title.trim() || 'Trip package';
  const [failed, setFailed] = useState(false);

  // A cover can 404 after the package was unpublished; the tile is always a
  // safe fallback rather than a broken image.
  useEffect(() => {
    setFailed(false);
  }, [pkg.coverUrl]);

  const showCover = Boolean(pkg.coverUrl) && !failed;

  const cover = (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br">
      {showCover ? (
        <>
          <img
            src={pkg.coverUrl ?? undefined}
            alt=""
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-transparent"
          />
        </>
      ) : (
        <div
          className={cn(
            'relative grid h-full w-full place-items-center bg-gradient-to-br',
            toneFor(title)
          )}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.35),transparent_45%)]"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-10 -right-6 h-32 w-32 rounded-full border border-white/20"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-4 -right-16 h-40 w-40 rounded-full border border-white/15"
          />
          <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
            <Compass className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
        </div>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm backdrop-blur dark:bg-slate-900/90 dark:text-slate-200">
        <CalendarDays className="h-3 w-3" />
        {nightsLabel(pkg.nights)}
      </span>
    </div>
  );

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg dark:hover:border-teal-900',
        className
      )}
      aria-label={`${title} package`}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          aria-label={`Open the day-by-day plan for ${title}`}
        >
          {cover}
        </button>
      ) : (
        cover
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-black leading-snug tracking-tight text-foreground">
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="text-left transition-colors hover:text-teal-700 dark:hover:text-teal-300"
              >
                {title}
              </button>
            ) : (
              title
            )}
          </h3>
          {pkg.summary.trim() ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {pkg.summary.trim()}
            </p>
          ) : null}
        </div>

        {pkg.highlights && pkg.highlights.length > 0 ? (
          <section aria-label="Package highlights">
            <h4 className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3 w-3 text-teal-600" />
              Highlights
            </h4>
            <ul className="mt-1.5 space-y-1">
              {pkg.highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-300"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                  {highlight}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pkg.inclusions && pkg.inclusions.length > 0 ? (
          <section aria-label="Package inclusions">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              What's included
            </h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pkg.inclusions.map((inclusion) => (
                <Badge
                  key={inclusion}
                  variant="secondary"
                  className="bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
                >
                  {inclusion}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex items-baseline gap-1.5 border-t border-border/60 pt-3">
          {pkg.pricePerPerson === null ? (
            <span className="text-sm font-bold text-foreground">
              Price on request
            </span>
          ) : (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                From
              </span>
              <span className="text-lg font-black text-foreground">
                {formatMoney(pkg.pricePerPerson, pkg.currency)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                per person
              </span>
            </>
          )}
        </div>

        {onOpen || onEnquire ? (
          <div className="mt-auto space-y-2">
            {onOpen ? (
              <Button
                type="button"
                size="sm"
                variant="hero"
                className="w-full rounded-xl text-xs font-bold gap-1.5"
                onClick={onOpen}
              >
                <Route className="h-3.5 w-3.5" />
                View the day-by-day plan
              </Button>
            ) : null}

            {onEnquire ? (
              <Button
                type="button"
                size="sm"
                variant={onOpen ? 'outline' : 'hero'}
                className="w-full rounded-xl text-xs font-bold gap-1.5"
                onClick={onEnquire}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Ask about this trip
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default AgencyPackageCard;
