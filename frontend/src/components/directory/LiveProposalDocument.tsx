import React from 'react';
import {
  BedDouble,
  Bus,
  CalendarDays,
  Lightbulb,
  MapPin,
  ShieldAlert,
  Utensils,
} from 'lucide-react';
import { formatDate } from '@/lib/date';
import { formatMoney } from '@/lib/currency';
import type { AgencyExportDocument, AgencyExportDay } from '@/types/agency';

/**
 * The traveller's proposal as it was sent (M9 R9).
 *
 * This renders the snapshot the agency shared with the quote — not the live
 * trip. Editing the itinerary afterwards changes the trip, never what the
 * traveller was quoted against. Everything here is client-safe: no markup, no
 * internal cost, no conversation content.
 */

interface LiveProposalDocumentProps {
  document: AgencyExportDocument;
  className?: string;
}

export const LiveProposalDocument: React.FC<LiveProposalDocumentProps> = ({
  document,
  className,
}) => {
  const { trip, agency, quote, contact } = document;
  const dates =
    trip.startDate || trip.endDate
      ? [trip.startDate ? formatDate(trip.startDate) : null, trip.endDate ? formatDate(trip.endDate) : null]
          .filter(Boolean)
          .join(' – ')
      : null;

  return (
    <article
      className={
        'space-y-6 rounded-3xl border border-border/70 bg-card p-4 sm:p-6 ' +
        (className ?? '')
      }
    >
      <header className="space-y-2 border-b border-border/70 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
          {agency.name}
        </p>
        <h2 className="text-xl font-black tracking-tight text-foreground">
          {trip.title}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {trip.destination ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {trip.destination}
            </span>
          ) : null}
          {dates ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {dates}
            </span>
          ) : null}
          <span>
            {trip.durationDays} day{trip.durationDays === 1 ? '' : 's'} ·{' '}
            {trip.nights} night{trip.nights === 1 ? '' : 's'}
          </span>
          {trip.groupType ? <span className="capitalize">{trip.groupType}</span> : null}
        </div>
        {quote ? (
          <p className="text-[11px] text-muted-foreground">
            {quote.number} · v{quote.version} ·{' '}
            {formatMoney(quote.total, quote.currency)} total
            {quote.validUntil ? ` · price held until ${formatDate(quote.validUntil)}` : ''}
          </p>
        ) : null}
      </header>

      <div className="space-y-5">
        {trip.days.map((day) => (
          <DayBlock key={day.day} day={day} />
        ))}
      </div>

      <div className="grid gap-4 border-t border-border/70 pt-4 text-xs sm:grid-cols-3">
        <ListBlock title="Good to know" items={document.recommendations} />
        <ListBlock title="What to carry" items={document.thingsToCarry} />
        <ListBlock title="Cancellation" items={document.cancellationPolicy} />
      </div>

      {contact.phone || contact.email || contact.website ? (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{agency.name}</span>
          {contact.phone ? <span>{contact.phone}</span> : null}
          {contact.email ? <span>{contact.email}</span> : null}
          {contact.website ? <span>{contact.website}</span> : null}
        </footer>
      ) : null}
    </article>
  );
};

const DayBlock: React.FC<{ day: AgencyExportDay }> = ({ day }) => (
  <section className="space-y-2.5">
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
        Day {day.day}
      </span>
      <h3 className="text-sm font-bold text-foreground">{day.title}</h3>
      {day.date ? (
        <span className="text-[10px] text-muted-foreground">{formatDate(day.date)}</span>
      ) : null}
      {day.permitRequired ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="h-3 w-3" />
          Permit needed
        </span>
      ) : null}
    </div>

    {day.summary ? (
      <p className="text-xs leading-relaxed text-muted-foreground">{day.summary}</p>
    ) : null}

    {day.activities.length > 0 ? (
      <ul className="space-y-1.5">
        {day.activities.map((activity, index) => (
          <li
            key={`${activity.title}-${index}`}
            className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              {activity.time ? (
                <span className="text-[10px] font-bold text-primary">{activity.time}</span>
              ) : null}
              <span className="text-xs font-semibold text-foreground">{activity.title}</span>
              {activity.location ? (
                <span className="text-[10px] text-muted-foreground">{activity.location}</span>
              ) : null}
            </div>
            {activity.description ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {activity.description}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null}

    <div className="grid gap-2 text-[11px] sm:grid-cols-2">
      {day.stay.length > 0 ? (
        <div className="space-y-1">
          {day.stay.map((stay, index) => (
            <p key={`${stay.name}-${index}`} className="flex items-start gap-1.5 text-muted-foreground">
              <BedDouble className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground">{stay.name}</span>
                {stay.location ? ` · ${stay.location}` : ''}
                {stay.pricePerNight ? ` · ${stay.pricePerNight}` : ''}
              </span>
            </p>
          ))}
        </div>
      ) : null}
      {day.food.length > 0 ? (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{day.food.join(' · ')}</span>
        </p>
      ) : null}
      {day.transport.length > 0 ? (
        <p className="flex items-start gap-1.5 text-muted-foreground sm:col-span-2">
          <Bus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{day.transport.join(' · ')}</span>
        </p>
      ) : null}
      {day.tips.length > 0 ? (
        <div className="flex items-start gap-1.5 text-muted-foreground sm:col-span-2">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{day.tips.join(' · ')}</span>
        </div>
      ) : null}
    </div>
  </section>
);

const ListBlock: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
};

export default LiveProposalDocument;
