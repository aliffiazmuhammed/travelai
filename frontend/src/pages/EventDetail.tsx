import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import PhoneField from '@/components/PhoneField';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { TravellerBreadcrumbs } from '@/components/traveller/TravellerBreadcrumbs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EVENT_KIND_LABELS, eventPriceLabel, spotsLabel } from '@/lib/events';
import { applyPageMeta } from '@/lib/meta';
import { DEFAULT_PHONE_COUNTRY, toE164, validatePhone } from '@/lib/phone';
import { tripCoverUrl } from '@/lib/tripCover';
import { api, ApiError } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Compass,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  Tag,
  Tent,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { PublicEventDetail } from '@/types/events';

/**
 * Public event page (Milestone 10 E1/E2).
 *
 * Anonymous by design: the payload is the server's event projection and the
 * only write is the interest form, which records a contact card rather than an
 * account or a thread. A closed, finished or full event keeps its page — the
 * server only stops offering the form by sending `acceptingInterest: false`.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sent' }
  | { kind: 'already' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Party sizes the guest can pick; `7+` covers anything larger in one option. */
const PARTY_SIZES = ['1', '2', '3', '4', '5', '6', '7+'] as const;

const partyText = (value: string) =>
  value === '7+' ? '7 or more' : `${value} ${value === '1' ? 'person' : 'people'}`;

const DetailCell = ({
  icon: Icon,
  label,
  value,
  sub,
  divided,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string | null;
  /** Draws the hairline between columns once the grid is side by side. */
  divided?: boolean;
}) => (
  <div className={cn('min-w-0', divided && 'sm:border-l sm:border-border/60 sm:pl-5')}>
    <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd>
    {sub && (
      <dd className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
        {sub}
      </dd>
    )}
  </div>
);

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<PublicEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [partySize, setPartySize] = useState<string>('1');
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '', website: '' });
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitState>({ kind: 'idle' });

  useEffect(() => {
    if (!eventId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const data = await api.getPublicEvent(eventId);
        if (cancelled) return;
        setEvent(data.event);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load the public event:', err);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiError && err.message
              ? err.message
              : 'This event could not be loaded right now.'
          );
        }
        setEvent(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Meta tags wait for the real title so a share preview never says "Loading".
  useEffect(() => {
    if (loading) return;

    if (event) {
      return applyPageMeta({
        title: `${event.title} · ${event.agency.name}`,
        description:
          event.summary ||
          `${EVENT_KIND_LABELS[event.kind]} in ${event.destination || 'India'} on ${event.dates.label}, run by ${event.agency.name}.`,
        ogType: 'article',
      });
    }

    if (notFound) {
      return applyPageMeta({
        title: 'Event not found · waytowalk',
        description:
          'This event is no longer public. It may have been unpublished, or its agency may no longer be listed.',
        ogType: 'website',
      });
    }
  }, [loading, event, notFound]);

  const place = useMemo(
    () => (event ? [event.destination, event.venue].filter(Boolean).join(' · ') : ''),
    [event]
  );

  /**
   * The hero is destination photography rather than the event's upload, so the
   * page reads like the place being visited. Without a destination the agency
   * name picks a neutral frame — never an invented location.
   */
  const heroSrc = useMemo(() => {
    if (!event) return '';
    const text = [event.destination, event.venue].filter(Boolean).join(' ') || event.agency.name;
    return tripCoverUrl(text, 1600);
  }, [event]);

  useEffect(() => {
    setCoverFailed(false);
  }, [heroSrc]);

  /** Nights, then days, from the real dates. `null` when they are unusable. */
  const durationLabel = useMemo(() => {
    if (!event) return null;
    const start = new Date(event.dates.startDate);
    const end = new Date(event.dates.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const nights = Math.round((endDay - startDay) / 86_400_000);
    if (nights <= 0) return null;

    const days = nights + 1;
    return `${days} days · ${nights} ${nights === 1 ? 'night' : 'nights'}`;
  }, [event]);

  const closedReason = useMemo(() => {
    if (!event || event.acceptingInterest) return null;
    if (event.closed) return 'This event has closed.';
    if (event.ended) return 'This event has already happened.';
    if (event.spotsLeft === 0) return 'Every spot is taken.';
    return 'This event is not taking new names right now.';
  }, [event]);

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!event || submitting) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phoneError = validatePhone(phoneCountry, form.phone);
    const phone = toE164(phoneCountry, form.phone);
    const note = form.note.trim();

    if (name.length < 2) {
      setFormError('Tell the agency your name.');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (!phone || phoneError) {
      setFormError(phoneError ?? 'Enter a phone number the agency can reach you on.');
      return;
    }

    // The roster has one free-text note, so the party size travels with it.
    const noteWithParty = [`Party of ${partyText(partySize)}`, note]
      .filter(Boolean)
      .join('. ')
      .slice(0, 500);

    setFormError(null);
    setSubmitting(true);
    try {
      await api.submitEventInterest(event._id, {
        name,
        email,
        phone,
        note: noteWithParty || undefined,
        website: form.website || undefined,
      });
      setSubmitted({ kind: 'sent' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (/already on the list/i.test(err.message)) {
          setSubmitted({ kind: 'already' });
        } else {
          setFormError(err.message);
        }
      } else {
        console.error('Failed to send the event interest:', err);
        setFormError(
          err instanceof ApiError && err.message
            ? err.message
            : 'That could not be sent right now. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-foreground">Opening this event…</h3>
            <p className="text-xs text-muted-foreground">Dates, spots and who's running it</p>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || error || !event) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-xl">
          <div className="rounded-3xl border border-border/80 bg-card/80 p-8 text-center shadow-card backdrop-blur-md space-y-6 sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-foreground">
                {notFound ? "This event isn't here anymore" : 'Something went wrong'}
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {notFound
                  ? 'The agency may have taken it down, or it never went live. Other trips and events are still worth a look.'
                  : error || 'This event could not be loaded right now.'}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button asChild variant="hero" className="h-11 rounded-2xl px-6 text-xs font-bold gap-2">
                <Link to="/explore">
                  <Compass className="h-4 w-4" />
                  See what else is on
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-2xl px-6 text-xs font-bold">
                <Link to="/">Back to waytowalk</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const spots = spotsLabel(event.spotsLeft);
  const dateLabel = event.dates.label || event.dates.startDate;
  const hasPrice = event.pricePerPerson !== null;
  const kindLabel = EVENT_KIND_LABELS[event.kind];
  const aboutLabel = event.kind === 'other' ? 'About this event' : `About this ${kindLabel.toLowerCase()}`;
  const statusLabel = event.closed
    ? 'Closed'
    : event.ended
      ? 'Finished'
      : event.spotsLeft === 0
        ? 'Full'
        : 'Closed';

  const KindIcon: LucideIcon =
    event.kind === 'camp'
      ? Tent
      : event.kind === 'retreat'
        ? Sparkles
        : event.kind === 'group_trip'
          ? Users
          : CalendarDays;

  const whereMain = event.destination || event.venue || 'Ask the agency';
  const whereSub = event.destination && event.venue ? event.venue : null;
  const showAbout = Boolean(event.summary) || event.highlights.length > 0;

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto max-w-6xl space-y-6 px-4 pt-24 pb-20">
        <TravellerBreadcrumbs
          items={[{ label: 'Explore', to: '/explore' }, { label: event.title }]}
        />

        <article className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card">
          <div className="relative h-[220px] w-full overflow-hidden bg-muted sm:h-[340px]">
            {coverFailed ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-card to-muted text-primary/50">
                <KindIcon className="h-12 w-12" aria-hidden="true" />
              </div>
            ) : (
              <img
                src={heroSrc}
                alt={event.destination ? `${event.title} in ${event.destination}` : event.title}
                decoding="async"
                onError={() => setCoverFailed(true)}
                className="h-full w-full object-cover"
              />
            )}

            <div className="absolute left-4 top-4 flex max-w-[calc(100%_-_2rem)] flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-xs backdrop-blur">
                <KindIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {kindLabel}
              </span>
              {spots && event.spotsLeft !== null && event.spotsLeft > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-background/90 px-3 py-1.5 text-[11px] font-semibold text-accent shadow-xs backdrop-blur">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {spots}
                </span>
              )}
              {event.spotsLeft === null && event.capacity !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-xs backdrop-blur">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Up to {event.capacity} people
                </span>
              )}
              {closedReason && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1.5 text-[11px] font-bold text-destructive shadow-xs backdrop-blur">
                  {statusLabel}
                </span>
              )}
            </div>
          </div>

          <header className="space-y-4 px-5 py-6 sm:px-8 sm:py-7">
            <h1 className="max-w-3xl break-words font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {event.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
              <AgencyLogoTile
                name={event.agency.name}
                logoUrl={event.agency.logoUrl}
                className="h-7 w-7 rounded-lg text-[11px]"
              />
              <span>Run by</span>
              <Link
                to={`/agencies/${encodeURIComponent(event.agency.slug)}`}
                className="inline-flex min-w-0 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
              >
                <span className="break-words">{event.agency.name}</span>
                {event.agency.verified && (
                  <>
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Verified agency</span>
                  </>
                )}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-muted-foreground">
              {place && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-words">{place}</span>
                </span>
              )}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="break-words">{dateLabel}</span>
              </span>
            </div>
          </header>
        </article>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-6">
            {showAbout && (
              <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-6 shadow-xs sm:p-7">
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {aboutLabel}
                </h2>
                {event.summary && (
                  <p className="text-sm leading-relaxed text-foreground/80">{event.summary}</p>
                )}
                {event.highlights.length > 0 && (
                  <ul className="flex flex-wrap gap-2.5 pt-1">
                    {event.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-xs font-semibold text-foreground/80"
                      >
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 break-words">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-6 shadow-xs sm:p-7">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                The details
              </h2>
              <dl
                className={cn(
                  'grid gap-5 border-t border-border/60 pt-5',
                  hasPrice ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                )}
              >
                <DetailCell
                  icon={CalendarDays}
                  label="When"
                  value={dateLabel}
                  sub={durationLabel}
                />
                <DetailCell
                  icon={MapPin}
                  label="Where"
                  value={whereMain}
                  sub={whereSub}
                  divided
                />
                {hasPrice && (
                  <DetailCell
                    icon={Tag}
                    label="Price"
                    value={eventPriceLabel(event)}
                    divided
                  />
                )}
              </dl>
              <p className="flex items-start gap-1.5 border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                Details and what's included are set by {event.agency.name}. Ask them when you
                write — nothing is charged on waytowalk.
              </p>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs">
              {submitted.kind !== 'idle' ? (
                <div className="space-y-2">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                    {submitted.kind === 'sent'
                      ? "You're on the list"
                      : "You're already on the list"}
                  </h2>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {submitted.kind === 'sent'
                      ? `Your details have gone to ${event.agency.name}. They'll call or write to confirm your spot — nothing is booked until they do.`
                      : `${event.agency.name} already has your details for this event and will be in touch about your spot.`}
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-1 h-10 w-full rounded-xl text-xs font-bold"
                  >
                    <Link to="/explore">Back to Explore</Link>
                  </Button>
                </div>
              ) : closedReason ? (
                <div className="space-y-2">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                    Not taking names here
                  </h2>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {closedReason} {event.agency.name} might have another date coming — you can
                    ask them directly.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-1 h-10 w-full rounded-xl text-xs font-bold"
                  >
                    <Link to={`/agencies/${encodeURIComponent(event.agency.slug)}`}>
                      Ask {event.agency.name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                      Ask about a spot
                    </h2>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Leave your details and {event.agency.name} will get back to you to confirm.
                      No account needed.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-name" className="text-[11px] font-bold">
                      Name
                    </Label>
                    <Input
                      id="event-interest-name"
                      value={form.name}
                      onChange={(input) => setForm((prev) => ({ ...prev, name: input.target.value }))}
                      maxLength={120}
                      autoComplete="name"
                      disabled={submitting}
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-email" className="text-[11px] font-bold">
                      Email
                    </Label>
                    <Input
                      id="event-interest-email"
                      type="email"
                      value={form.email}
                      onChange={(input) => setForm((prev) => ({ ...prev, email: input.target.value }))}
                      maxLength={160}
                      autoComplete="email"
                      disabled={submitting}
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-phone" className="text-[11px] font-bold">
                      Phone
                    </Label>
                    <PhoneField
                      id="event-interest-phone"
                      value={form.phone}
                      countryIso={phoneCountry}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, phone: value }))}
                      onCountryChange={setPhoneCountry}
                      maxLength={20}
                      disabled={submitting}
                      inputClassName="h-10 rounded-xl text-xs"
                      selectClassName="h-10 w-[6rem] shrink-0 rounded-xl border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-party" className="text-[11px] font-bold">
                      How many of you?
                    </Label>
                    <select
                      id="event-interest-party"
                      value={partySize}
                      onChange={(input) => setPartySize(input.target.value)}
                      disabled={submitting}
                      className="h-10 w-full rounded-xl border border-input bg-card px-3 text-xs font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {PARTY_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {partyText(size)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-note" className="text-[11px] font-bold">
                      Add a note (optional)
                    </Label>
                    <Textarea
                      id="event-interest-note"
                      value={form.note}
                      onChange={(input) => setForm((prev) => ({ ...prev, note: input.target.value }))}
                      maxLength={500}
                      disabled={submitting}
                      placeholder="Anything that would help them plan"
                      className="min-h-[76px] resize-none rounded-xl text-xs"
                    />
                  </div>

                  {/* Honeypot: invisible to people, irresistible to bots. */}
                  <div className="sr-only" aria-hidden="true">
                    <label htmlFor="event-interest-website">Website</label>
                    <Input
                      id="event-interest-website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(input) =>
                        setForm((prev) => ({ ...prev, website: input.target.value }))
                      }
                    />
                  </div>

                  {formError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] font-semibold text-destructive"
                    >
                      {formError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="hero"
                    disabled={submitting}
                    className="h-11 w-full rounded-xl text-xs font-bold"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      'Ask about a spot'
                    )}
                  </Button>

                  <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                    The agency replies to you directly. Your contact details are never shown on
                    waytowalk.
                  </p>
                </form>
              )}
            </section>

            <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to={`/agencies/${encodeURIComponent(event.agency.slug)}`}
                  className="-m-1 flex min-w-0 items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-muted/60"
                >
                  <AgencyLogoTile
                    name={event.agency.name}
                    logoUrl={event.agency.logoUrl}
                    className="h-11 w-11"
                  />
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
                      <span className="truncate">{event.agency.name}</span>
                      {event.agency.verified && (
                        <>
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="sr-only">Verified agency</span>
                        </>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Travel agency on waytowalk
                    </p>
                  </div>
                </Link>
                <Link
                  to={`/agencies/${encodeURIComponent(event.agency.slug)}`}
                  className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[11px] font-bold text-primary transition-all hover:gap-1.5"
                >
                  View agency
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default EventDetail;
