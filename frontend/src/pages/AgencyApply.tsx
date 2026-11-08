import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import PhoneField from "@/components/PhoneField";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/services/api";
import { applyPageMeta } from "@/lib/meta";
import { DEFAULT_PHONE_COUNTRY, toE164, validatePhone } from "@/lib/phone";
import { tripCoverUrl } from "@/lib/tripCover";
import { usePlatformEnabled } from "@/hooks/usePlatformEnabled";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Compass,
  Loader2,
  Map,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

/**
 * PA6: the public "join as a travel agency" form.
 *
 * Nothing is created here. A platform admin reads the application and decides;
 * approval runs the same provisioning the console uses and hands back a one-time
 * password for the admin to pass on. There is no mailer in the stack, so the
 * page promises a human reply rather than an automated one.
 *
 * The guidelines checkbox is a client-side gate only: the application payload
 * carries no consent field, so nothing here is stored as a consent record.
 */

const BENEFITS = [
  {
    icon: Users,
    tile: "bg-primary/10 text-primary",
    title: "A profile travellers can find",
    body: "Showcase your agency, your style and the destinations you specialise in.",
  },
  {
    icon: Map,
    tile: "bg-accent/10 text-accent",
    title: "Packages that show what you do",
    body: "List your trips, itineraries and special experiences with rich photos and details.",
  },
  {
    icon: MessageCircle,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Enquiries with a real thread",
    body: "Get genuine traveller enquiries and manage conversations in one place.",
  },
];

const AgencyApply = () => {
  const platformEnabled = usePlatformEnabled();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    note: "",
    website: "",
  });
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    return applyPageMeta({
      title: "Join as a travel agency · waytowalk",
      description:
        "Bring your trips to waytowalk: a public profile, one inbox for enquiries, and proposals that travel well. Apply to join and we'll get back to you.",
      ogType: "website",
    });
  }, []);

  const update = (key: keyof typeof form) => (
    input: { target: { value: string } }
  ) => setForm((previous) => ({ ...previous, [key]: input.target.value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      setFormError("We need your agency name, a phone number and an email to reply to.");
      return;
    }
    const phone = toE164(phoneCountry, form.phone);
    const phoneError = validatePhone(phoneCountry, form.phone);
    if (!phone || phoneError) {
      setFormError(phoneError ?? "Enter a valid phone number with its country code.");
      return;
    }
    if (!consent) {
      setFormError("Please agree to the community guidelines before you send this.");
      return;
    }

    setSubmitting(true);
    try {
      await api.submitAgencyApplication({
        name: form.name,
        phone,
        email: form.email,
        note: form.note || undefined,
        website: form.website || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setClosed(true);
        return;
      }
      setFormError(
        err instanceof ApiError && err.message
          ? err.message
          : "That didn't send. Please try again in a moment."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const applicationsClosed = closed || platformEnabled === false;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 px-4 pb-20 pt-24">
        <TravellerBreadcrumbs
          items={[{ label: "Agencies", to: "/agencies" }, { label: "Apply to join" }]}
        />

        <div className="mt-6 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-x-12 lg:gap-y-8">
          <div className="order-1 min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              For agencies
            </p>
            <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.06] tracking-tight text-foreground sm:text-5xl">
              You plan the trips. We'll bring the travellers.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Join the waytowalk directory and get discovered by travellers who
              are looking for real experiences, not just itineraries.
            </p>
          </div>

          <div className="order-3 min-w-0 space-y-7 lg:col-start-1 lg:row-start-2">
            <ul className="space-y-5">
              {BENEFITS.map(({ icon: Icon, tile, title, body }) => (
                <li key={title} className="flex items-start gap-4">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tile}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="max-w-lg space-y-2 border-t border-border/60 pt-5">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                Every application is read by a person, usually within two working
                days.
              </p>
              <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
                If it looks like a fit, we set up your agency workspace and send
                your sign-in details by phone or email.
              </p>
            </div>

            <div className="relative aspect-[16/7] w-full overflow-hidden rounded-3xl border border-border/70 shadow-sm">
              <img
                src={tripCoverUrl("munnar", 1200)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-transparent"
              />
            </div>
          </div>

          <section className="order-2 rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-24 lg:self-start">
            {submitted ? (
              <div className="space-y-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Application received
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Thanks, {form.name.trim() || "there"}. A real person reads every
                    application. If it's a fit, we'll set up your workspace and get
                    in touch on{" "}
                    {toE164(phoneCountry, form.phone) || "the number you gave us"} or{" "}
                    {form.email.trim() || "your email"} with your sign-in details.
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    asChild
                    variant="hero"
                    className="h-11 w-full gap-1.5 rounded-xl text-xs font-bold"
                  >
                    <Link to="/explore">
                      <Compass className="h-4 w-4" aria-hidden="true" />
                      See what travellers are planning
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full rounded-xl text-xs font-bold"
                  >
                    <Link to="/agencies">Back to the directory</Link>
                  </Button>
                </div>
              </div>
            ) : applicationsClosed ? (
              <div className="space-y-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  New agencies join by invitation right now
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Applications are paused while we finish onboarding the agencies
                  already in line. If you already have a workspace, sign in and
                  pick up where you left off.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 w-full rounded-xl text-xs font-bold"
                >
                  <Link to="/agency/login">Agency sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Apply to join
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Tell us about your agency. It only takes a few minutes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-name" className="text-[11px] font-bold">
                    Agency name
                  </Label>
                  <Input
                    id="apply-name"
                    value={form.name}
                    onChange={update("name")}
                    maxLength={80}
                    autoComplete="organization"
                    placeholder="e.g. Himalayan Trails"
                    disabled={submitting}
                    className="h-11 rounded-xl text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-phone" className="text-[11px] font-bold">
                    Phone
                  </Label>
                  <PhoneField
                    id="apply-phone"
                    value={form.phone}
                    countryIso={phoneCountry}
                    onValueChange={(value) =>
                      setForm((previous) => ({ ...previous, phone: value }))
                    }
                    onCountryChange={setPhoneCountry}
                    maxLength={20}
                    disabled={submitting}
                    inputClassName="h-11 rounded-xl text-sm"
                    selectClassName="h-11 w-[6.5rem] shrink-0 rounded-xl border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-email" className="text-[11px] font-bold">
                    Work email
                  </Label>
                  <Input
                    id="apply-email"
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    maxLength={160}
                    autoComplete="email"
                    placeholder="you@youragency.com"
                    disabled={submitting}
                    className="h-11 rounded-xl text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-note" className="text-[11px] font-bold">
                    What are you known for? (optional)
                  </Label>
                  <Textarea
                    id="apply-note"
                    value={form.note}
                    onChange={update("note")}
                    maxLength={600}
                    placeholder="A ridge trek in Ladakh, slow weekends in Coorg, scuba in the Andamans — whatever you're known for."
                    disabled={submitting}
                    className="min-h-[104px] resize-none rounded-xl text-xs"
                  />
                  <p className="text-right text-[10px] text-muted-foreground">
                    {form.note.length}/600
                  </p>
                </div>

                {/* Honeypot: invisible to people, irresistible to bots. */}
                <div className="sr-only" aria-hidden="true">
                  <label htmlFor="apply-website">Website</label>
                  <Input
                    id="apply-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={update("website")}
                  />
                </div>

                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="apply-consent"
                    checked={consent}
                    onCheckedChange={(next) => setConsent(next === true)}
                    disabled={submitting}
                    className="mt-0.5 rounded-[4px]"
                  />
                  <Label
                    htmlFor="apply-consent"
                    className="text-[11px] font-medium leading-5 text-muted-foreground"
                  >
                    I agree to the{" "}
                    <Link
                      to="/guidelines"
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-primary hover:underline"
                    >
                      community guidelines
                    </Link>
                    .
                  </Label>
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
                  className="h-12 w-full gap-2 rounded-xl text-xs font-bold"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? "Sending…" : "Submit application"}
                </Button>

                <p className="text-[10px] leading-4 text-muted-foreground">
                  We only use these details to review your application and set up
                  your workspace. No account is created until a person approves it.
                </p>

                <div className="border-t border-border/60 pt-4 text-center text-[11px] text-muted-foreground">
                  Already listed?{" "}
                  <Link
                    to="/agency/login"
                    className="font-semibold text-primary hover:underline"
                  >
                    Sign in to your workspace
                  </Link>
                  .
                </div>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default AgencyApply;
