import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Compass, MessageCircle, Sparkles } from 'lucide-react';
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
  'from-teal-100 via-white to-sky-100 dark:from-teal-950/60 dark:via-slate-900 dark:to-sky-950/40',
  'from-amber-100 via-white to-rose-100 dark:from-amber-950/50 dark:via-slate-900 dark:to-rose-950/40',
  'from-sky-100 via-white to-indigo-100 dark:from-sky-950/60 dark:via-slate-900 dark:to-indigo-950/40',
  'from-emerald-100 via-white to-teal-100 dark:from-emerald-950/50 dark:via-slate-900 dark:to-teal-950/40',
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
  /** Public profile only: opens the enquiry form for this package. */
  onEnquire?: () => void;
}> = ({ package: pkg, className, onEnquire }) => {
  const title = pkg.title.trim() || 'Trip package';
  const [failed, setFailed] = useState(false);

  // A cover can 404 after the package was unpublished; the tile is always a
  // safe fallback rather than a broken image.
  useEffect(() => {
    setFailed(false);
  }, [pkg.coverUrl]);

  const showCover = Boolean(pkg.coverUrl) && !failed;
  const price =
    pkg.pricePerPerson === null
      ? 'Price on request'
      : `From ${formatMoney(pkg.pricePerPerson, pkg.currency)} per person`;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xs',
        className
      )}
      aria-label={`${title} package`}
    >
      <div
        className={cn(
          'relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br',
          toneFor(title)
        )}
      >
        {showCover ? (
          <img
            src={pkg.coverUrl ?? undefined}
            alt=""
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Compass
              className="h-10 w-10 text-teal-600/40 dark:text-teal-300/30"
              aria-hidden="true"
            />
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/90 dark:text-slate-200">
          <CalendarDays className="h-3 w-3" />
          {nightsLabel(pkg.nights)}
        </span>
      </div>

      <div className="space-y-3 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
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

        <p className="border-t border-border/60 pt-3 text-sm font-bold text-foreground">
          {price}
        </p>

        {onEnquire ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-xl text-xs font-bold gap-1.5"
            onClick={onEnquire}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ask about this trip
          </Button>
        ) : null}
      </div>
    </article>
  );
};

export default AgencyPackageCard;
