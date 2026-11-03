import React from 'react';
import {
  BedDouble,
  Bus,
  CalendarDays,
  Car,
  Check,
  Clock3,
  Lightbulb,
  MapPin,
  Plane,
  Ship,
  ShieldAlert,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { formatDate, formatDateShort } from '@/lib/date';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { AgencyExportDocument, AgencyExportDay } from '@/types/agency';

/**
 * The traveller's proposal as it was sent (M9 R9).
 *
 * This renders the snapshot the agency shared with the quote — not the live
 * trip. Editing the itinerary afterwards changes the trip, never what the
 * traveller was quoted against. Everything here is client-safe: no markup, no
 * internal cost, no conversation content.
 *
 * It is the document shared by the public proposal page and the preview dialog,
 * so it reads like the paper the agency sent: letterhead, one serif title, the
 * facts, what is included, then the days.
 */

interface LiveProposalDocumentProps {
  document: AgencyExportDocument;
  className?: string;
  /**
   * Optional panel under the summary strip — the share page drops its
   * acceptance actions in here so the document stays one piece of paper.
   */
  children?: React.ReactNode;
}

/** Pick a transport glyph from the day's own transport wording. */
const transportIcon = (labels: string[]) => {
  const text = labels.join(' ').toLowerCase();
  if (/flight|fly|plane|air\b|airport/.test(text)) return Plane;
  if (/ferry|boat|ship|cruise|backwater/.test(text)) return Ship;
  if (/car|drive|taxi|jeep|cab\b/.test(text)) return Car;
  return Bus;
};

export const LiveProposalDocument: React.FC<LiveProposalDocumentProps> = ({
  document,
  className,
  children,
}) => {
  const { trip, agency, quote, client, contact } = document;
  const dates =
    trip.startDate || trip.endDate
      ? [trip.startDate ? formatDate(trip.startDate) : null, trip.endDate ? formatDate(trip.endDate) : null]
          .filter(Boolean)
          .join(' – ')
      : null;
  const travellers = (client?.adults ?? 0) + (client?.children ?? 0);
  const duration =
    trip.durationDays || trip.nights
      ? [trip.durationDays ? `${trip.durationDays} day${trip.durationDays === 1 ? '' : 's'}` : null,
         trip.nights ? `${trip.nights} night${trip.nights === 1 ? '' : 's'}` : null]
          .filter(Boolean)
          .join(' / ')
      : null;

  const meta = [
    quote ? `Proposal ${quote.number} · version ${quote.version}` : null,
    trip.destination || null,
    dates,
    travellers > 0 ? `${travellers} traveller${travellers === 1 ? '' : 's'}` : null,
  ].filter(Boolean) as string[];

  const hasIncluded =
    Boolean(quote) &&
    (quote!.inclusions.length > 0 ||
      quote!.exclusions.length > 0 ||
      quote!.terms.length > 0 ||
      Boolean(quote!.total));

  return (
    <article
      className={cn(
        'space-y-8 rounded-2xl border border-border/70 bg-card p-5 sm:p-8',
        className
      )}
    >
      <header className="space-y-6">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyLogoTile
            name={agency.name}
            logoUrl={agency.logoUrl}
            className="h-14 w-14 rounded-xl text-lg sm:h-16 sm:w-16 sm:text-xl"
          />
          <div className="min-w-0 space-y-1">
            <p className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
              {agency.name}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Travel agency
            </p>
            {agency.address ? (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{agency.address}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {trip.title}
          </h2>
          {meta.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {meta.map((part, index) => (
                <React.Fragment key={`${part}-${index}`}>
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  <span>{part}</span>
                </React.Fragment>
              ))}
            </p>
          ) : null}
        </div>

        {dates || duration || travellers > 0 ? (
          <dl className="grid divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 text-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {dates ? (
              <div className="flex items-center gap-2.5 px-4 py-3">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <dt className="sr-only">Dates</dt>
                <dd className="font-medium text-foreground">{dates}</dd>
              </div>
            ) : null}
            {duration ? (
              <div className="flex items-center gap-2.5 px-4 py-3">
                <Clock3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <dt className="sr-only">Duration</dt>
                <dd className="font-medium text-foreground">{duration}</dd>
              </div>
            ) : null}
            {travellers > 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-3">
                <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <dt className="sr-only">Travellers</dt>
                <dd className="font-medium text-foreground">
                  {travellers} traveller{travellers === 1 ? '' : 's'}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </header>

      {children}

      {hasIncluded ? (
        <section className="space-y-3">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            What’s included
          </h3>
          <div className="overflow-hidden rounded-xl border border-border/70">
            {quote!.inclusions.length > 0 ? (
              <ul className="divide-y divide-border/50">
                {quote!.inclusions.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className="flex items-start gap-2 px-4 py-2.5 text-xs text-foreground"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {quote!.total ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border/70 bg-background/60 px-4 py-3">
                <span className="text-xs font-semibold text-foreground">Total</span>
                <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatMoney(quote!.total, quote!.currency)}
                  </span>
                  {quote!.perPerson ? (
                    <span className="text-[11px] text-muted-foreground">
                      {formatMoney(quote!.perPerson, quote!.currency)} per person
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>

          {quote!.exclusions.length > 0 || quote!.terms.length > 0 ? (
            <div className="grid gap-4 text-[11px] sm:grid-cols-2">
              {quote!.exclusions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Not included
                  </p>
                  <ul className="space-y-1">
                    {quote!.exclusions.map((line, index) => (
                      <li key={`${line}-${index}`} className="flex gap-1.5 text-muted-foreground">
                        <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {quote!.terms.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Terms
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {quote!.terms.map((line, index) => (
                      <li key={`${line}-${index}`} className="flex gap-1.5">
                        <span aria-hidden="true">·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {trip.days.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Your days
          </h3>
          <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
            {trip.days.map((day) => (
              <DayRow key={day.day} day={day} />
            ))}
          </div>
        </section>
      ) : null}

      {document.recommendations.length > 0 ||
      document.thingsToCarry.length > 0 ||
      document.cancellationPolicy.length > 0 ? (
        <section className="grid gap-4 border-t border-border/70 pt-5 text-xs sm:grid-cols-3">
          <ListBlock title="Good to know" items={document.recommendations} />
          <ListBlock title="What to carry" items={document.thingsToCarry} />
          <ListBlock title="Cancellation" items={document.cancellationPolicy} />
        </section>
      ) : null}

      {contact.phone || contact.email || contact.website ? (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{agency.name}</span>
          {contact.phone ? <span>{contact.phone}</span> : null}
          {contact.email ? <span>{contact.email}</span> : null}
          {contact.website ? <span>{contact.website}</span> : null}
        </footer>
      ) : null}
    </article>
  );
};

const DayRow: React.FC<{ day: AgencyExportDay }> = ({ day }) => {
  const TransportIcon = transportIcon(day.transport);
  const location =
    day.stay.find((stay) => stay.location)?.location ??
    day.activities.find((activity) => activity.location)?.location ??
    null;

  return (
    <div className="space-y-2.5 px-4 py-4">
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[8.5rem_1.25rem_minmax(0,1fr)_auto] sm:items-start">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-primary">Day {day.day}</span>
          {day.date ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {formatDateShort(day.date)}
            </span>
          ) : null}
          {day.permitRequired ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              Permit needed
            </span>
          ) : null}
        </div>

        <div className="hidden text-primary sm:block">
          {day.transport.length > 0 ? (
            <TransportIcon className="mt-0.5 h-4 w-4" aria-hidden="true" />
          ) : null}
        </div>

        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground">{day.title}</p>
          {day.summary ? (
            <p className="text-[11px] leading-5 text-muted-foreground">{day.summary}</p>
          ) : null}
        </div>

        {location ? (
          <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground sm:max-w-[13rem] sm:justify-end sm:truncate">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </p>
        ) : null}
      </div>

      {day.activities.length > 0 ? (
        <ul className="space-y-1 sm:pl-[10.75rem]">
          {day.activities.map((activity, index) => (
            <li
              key={`${activity.title}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
            >
              {activity.time ? (
                <span className="text-[10px] font-semibold tabular-nums text-primary">
                  {activity.time}
                </span>
              ) : null}
              <span className="text-[11px] font-medium text-foreground">{activity.title}</span>
              {activity.location ? (
                <span className="text-[10px] text-muted-foreground">{activity.location}</span>
              ) : null}
              {activity.description ? (
                <span className="w-full text-[11px] leading-5 text-muted-foreground">
                  {activity.description}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {day.stay.length > 0 || day.food.length > 0 || day.transport.length > 0 || day.tips.length > 0 ? (
        <div className="space-y-1 text-[11px] text-muted-foreground sm:pl-[10.75rem]">
          {day.stay.map((stay, index) => (
            <p key={`${stay.name}-${index}`} className="flex items-start gap-1.5">
              <BedDouble className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">{stay.name}</span>
                {stay.location ? ` · ${stay.location}` : ''}
                {stay.pricePerNight ? ` · ${stay.pricePerNight}` : ''}
              </span>
            </p>
          ))}
          {day.food.length > 0 ? (
            <p className="flex items-start gap-1.5">
              <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{day.food.join(' · ')}</span>
            </p>
          ) : null}
          {day.transport.length > 0 ? (
            <p className="flex items-start gap-1.5">
              <TransportIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{day.transport.join(' · ')}</span>
            </p>
          ) : null}
          {day.tips.length > 0 ? (
            <p className="flex items-start gap-1.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{day.tips.join(' · ')}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const ListBlock: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="leading-5">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LiveProposalDocument;
