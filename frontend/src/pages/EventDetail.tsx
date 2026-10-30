import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EVENT_KIND_LABELS, eventPriceLabel, spotsLabel } from '@/lib/events';
import { applyPageMeta } from '@/lib/meta';
import { api, ApiError } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Compass,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
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

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<PublicEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '', website: '' });
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
        title: 'Event not found · TravelAI',
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
    const phone = form.phone.trim();
    const note = form.note.trim();

    if (name.length < 2) {
      setFormError('Tell the agency your name.');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (phone.length < 3) {
      setFormError('Enter a phone number the agency can reach you on.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await api.submitEventInterest(event._id, {
        name,
        email,
        phone,
        note: note || undefined,
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
                <Link to="/">Back to TravelAI</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const showCover = Boolean(event.coverUrl) && !coverFailed;
  const spots = spotsLabel(event.spotsLeft);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto max-w-5xl space-y-8 px-4 pt-24 pb-20">
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Explore
        </Link>

        <article className="overflow-hidden rounded-3xl border border-border/80 bg-card/80 shadow-card backdrop-blur-md">
          {showCover && (
            <div className="aspect-[21/9] w-full overflow-hidden bg-muted">
              <img
                src={event.coverUrl ?? undefined}
                alt={event.title}
                onError={() => setCoverFailed(true)}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <header className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                <Sparkles className="h-3 w-3" />
                {EVENT_KIND_LABELS[event.kind]}
              </span>
              {event.destination && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {event.destination}
                </span>
              )}
              {closedReason && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-bold text-destructive">
                  {event.closed ? 'Closed' : event.ended ? 'Finished' : 'Full'}
                </span>
              )}
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-4xl">
                {event.title}
              </h1>
              {event.summary && (
                <p className="text-sm leading-relaxed text-foreground/80">{event.summary}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
                <CalendarDays className="h-4 w-4" />
                {event.dates.label || event.dates.startDate}
              </span>
              {place && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
                  <MapPin className="h-4 w-4" />
                  {place}
                </span>
              )}
              {spots && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {spots}
                </span>
              )}
            </div>
          </header>
        </article>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-6">
            {event.highlights.length > 0 && (
              <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-6">
                <h2 className="flex items-center gap-2 text-base font-black text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  What's in it
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {event.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-6">
              <h2 className="text-base font-black text-foreground">The details</h2>
              <dl className="grid gap-4 text-xs sm:grid-cols-2">
                <div className="space-y-0.5">
                  <dt className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                    When
                  </dt>
                  <dd className="font-semibold text-foreground/85">
                    {event.dates.label || event.dates.startDate}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                    Where
                  </dt>
                  <dd className="font-semibold text-foreground/85">{place || 'Ask the agency'}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                    Price
                  </dt>
                  <dd className="font-semibold text-foreground/85">{eventPriceLabel(event)}</dd>
                </div>
                {event.capacity !== null && (
                  <div className="space-y-0.5">
                    <dt className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                      Group size
                    </dt>
                    <dd
                      className={cn(
                        'font-semibold',
                        event.spotsLeft === 0 ? 'text-destructive' : 'text-foreground/85'
                      )}
                    >
                      {spots ?? `${event.capacity} people`}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The price and what it covers are set by {event.agency.name}. Ask them when you
                write — nothing is charged on TravelAI.
              </p>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Hosted by
              </p>
              <Link
                to={`/agencies/${encodeURIComponent(event.agency.slug)}`}
                className="-m-2 flex min-w-0 items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-muted/60"
              >
                <AgencyLogoTile
                  name={event.agency.name}
                  logoUrl={event.agency.logoUrl}
                  className="h-12 w-12"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-bold text-foreground">
                    {event.agency.name}
                    {event.agency.verified && (
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Travel agency on TravelAI
                  </p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </section>

            <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-5">
              {submitted.kind !== 'idle' ? (
                <div className="space-y-2">
                  <h2 className="text-sm font-black text-foreground">
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
                  <h2 className="text-sm font-black text-foreground">Not taking names here</h2>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {closedReason} {event.agency.name} might have another date coming — you can
                    ask them directly.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-1 h-10 w-full rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Link to={`/agencies/${encodeURIComponent(event.agency.slug)}`}>
                      Ask {event.agency.name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-black text-foreground">Ask about a spot</h2>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Leave your details and {event.agency.name} will get back to you to confirm.
                      No account needed.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-name" className="text-[11px] font-bold">
                      Your name
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
                    <Input
                      id="event-interest-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(input) => setForm((prev) => ({ ...prev, phone: input.target.value }))}
                      maxLength={40}
                      autoComplete="tel"
                      disabled={submitting}
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="event-interest-note" className="text-[11px] font-bold">
                      Anything they should know? (optional)
                    </Label>
                    <Textarea
                      id="event-interest-note"
                      value={form.note}
                      onChange={(input) => setForm((prev) => ({ ...prev, note: input.target.value }))}
                      maxLength={500}
                      disabled={submitting}
                      placeholder="How many of you, and anything that would help them plan."
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
                    className="h-11 w-full rounded-2xl text-xs font-bold gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {submitting ? 'Sending…' : 'Ask about a spot'}
                  </Button>

                  <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    Your contact details go only to {event.agency.name}, so they can confirm your
                    spot. They never appear on TravelAI.
                  </p>
                </form>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default EventDetail;
