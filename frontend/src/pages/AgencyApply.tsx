import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { TravellerPageHeader } from "@/components/traveller/TravellerPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/services/api";
import { applyPageMeta } from "@/lib/meta";
import { usePlatformEnabled } from "@/hooks/usePlatformEnabled";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Compass,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/**
 * PA6: the public "join as a travel agency" form.
 *
 * Nothing is created here. A platform admin reads the application and decides;
 * approval runs the same provisioning the console uses and hands back a one-time
 * password for the admin to pass on. There is no mailer in the stack, so the
 * page promises a human reply rather than an automated one.
 */

const PITCH = [
  {
    icon: Compass,
    title: "Get found by the right travellers",
    body: "A public profile with your destinations, specialties and languages, sitting next to the trips you run.",
  },
  {
    icon: MessageSquare,
    title: "Keep enquiries out of your DMs",
    body: "Every enquiry lands in one inbox with the traveller's dates and budget, so nothing gets lost in a chat thread.",
  },
  {
    icon: BadgeCheck,
    title: "Quotes that look like you",
    body: "Build an itinerary, price it, and send a branded proposal the traveller can accept right there.",
  },
];

const NEXT_STEPS = [
  "We read every application ourselves — no queue that never moves.",
  "If it looks like a fit, we set up your agency workspace and owner account.",
  "You get your sign-in details by phone or email from a real person.",
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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    return applyPageMeta({
      title: "Join as a travel agency · TravelAI",
      description:
        "Bring your trips to TravelAI: a public profile, one inbox for enquiries, and proposals that travel well. Apply to join and we'll get back to you.",
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

    setSubmitting(true);
    try {
      await api.submitAgencyApplication({
        name: form.name,
        phone: form.phone,
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
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl space-y-8">
        <TravellerPageHeader
          tone="hero"
          eyebrow="For travel agencies"
          icon={Building2}
          title="You plan the trips. We'll bring the travellers."
          description="If you run trips people remember, TravelAI gives you a home for them: a profile travellers can find, one inbox for enquiries, and proposals that look the way your trips feel."
          crumbs={[{ label: "Agencies", to: "/agencies" }, { label: "Apply to join" }]}
          actions={
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs font-bold gap-1.5"
            >
              <Link to="/agencies">
                <ArrowLeft className="h-3.5 w-3.5" />
                Browse the directory
              </Link>
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                What you get when you join
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-1">
                {PITCH.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-border/70 bg-card/70 p-6">
              <h2 className="flex items-center gap-2 text-sm font-black text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                What happens after you apply
              </h2>
              <ol className="mt-3 space-y-2">
                {NEXT_STEPS.map((step, index) => (
                  <li key={step} className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                Already have a workspace?{" "}
                <Link to="/agency/login" className="font-semibold text-primary hover:underline">
                  Sign in instead
                </Link>
                .
              </p>
            </section>
          </div>

          <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-card lg:sticky lg:top-24 lg:self-start">
            {submitted ? (
              <div className="space-y-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                </span>
                <div className="space-y-1">
                  <h2 className="text-base font-black text-foreground">
                    Application received
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Thanks, {form.name.trim() || "there"}. A real person reads every
                    application. If it's a fit, we'll set up your workspace and get
                    in touch on {form.phone.trim() || "the number you gave us"} or{" "}
                    {form.email.trim() || "your email"} with your sign-in details.
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    asChild
                    variant="hero"
                    className="h-11 w-full rounded-2xl text-xs font-bold gap-1.5"
                  >
                    <Link to="/explore">
                      <Compass className="h-4 w-4" />
                      See what travellers are planning
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full rounded-2xl text-xs font-bold"
                  >
                    <Link to="/agencies">Back to the directory</Link>
                  </Button>
                </div>
              </div>
            ) : applicationsClosed ? (
              <div className="space-y-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Building2 className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-base font-black text-foreground">
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
                  className="h-11 w-full rounded-2xl text-xs font-bold"
                >
                  <Link to="/agency/login">Agency sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-black text-foreground">
                    Tell us about your agency
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Four fields, two minutes. We'll ask the rest when we talk.
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
                    placeholder="The name travellers will see"
                    disabled={submitting}
                    className="h-10 rounded-xl text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-phone" className="text-[11px] font-bold">
                    Phone
                  </Label>
                  <Input
                    id="apply-phone"
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    maxLength={40}
                    autoComplete="tel"
                    placeholder="Where we can reach you"
                    disabled={submitting}
                    className="h-10 rounded-xl text-xs"
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
                    placeholder="This becomes your sign-in"
                    disabled={submitting}
                    className="h-10 rounded-xl text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="apply-note" className="text-[11px] font-bold">
                    The trips you run (optional)
                  </Label>
                  <Textarea
                    id="apply-note"
                    value={form.note}
                    onChange={update("note")}
                    maxLength={600}
                    placeholder="A ridge trek in Ladakh, slow weekends in Coorg, scuba in the Andamans — whatever you're known for."
                    disabled={submitting}
                    className="min-h-[88px] resize-none rounded-xl text-xs"
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
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {submitting ? "Sending…" : "Send my application"}
                </Button>

                <p className="text-[10px] leading-4 text-muted-foreground">
                  We only use these details to review your application and set up
                  your workspace. No account is created until a person approves it.
                </p>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default AgencyApply;
