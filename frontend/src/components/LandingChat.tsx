import { Sparkles, Lock, Users, Brain, BadgeIndianRupee, CalendarDays, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const highlightCards: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CalendarDays,
    title: "The plan appears",
    body: "Day-by-day, with timings, stays and costs.",
  },
  {
    icon: MapPin,
    title: "On one map",
    body: "Every place for the day, in order.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Money sorted",
    body: "What you planned vs. what you spent — and who pays back whom.",
  },
];

/** A calm, self-contained mock of the trip chat so visitors can *see*
 * how the AI helper answers inside the group chat — without any tech words.
 */
const LandingChat = () => {
  return (
    <div className="mx-auto max-w-3xl w-full space-y-6">
      {/* Chat window */}
      <div className="rounded-3xl border border-border/70 bg-card shadow-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Wayanad trip · 4 members</p>
              <p className="text-[11px] text-muted-foreground">You · Riya · Sam · Aisha</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="hidden sm:inline">Messages are end-to-end encrypted.</span>
          </span>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-5 space-y-4 bg-background/40">
          {/* Friend message */}
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-bold shrink-0">
              R
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-card border border-border/60 px-4 py-2.5 shadow-xs">
              <p className="text-xs font-bold text-foreground mb-0.5">Riya</p>
              <p className="text-sm text-foreground/90 leading-relaxed">
                3 days in Wayanad in November, 2 couples, we love nature and good food. What can we actually do?
              </p>
            </div>
          </div>

          {/* AI reply */}
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-primary/5 border border-primary/20 px-4 py-2.5 shadow-xs">
              <p className="text-xs font-bold text-primary mb-1.5 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> TravelAI
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed">
                Here's a relaxed 3-day idea: a boat ride and tribal museum on day one, a tea-garden walk on day two,
                and sunrise at a viewpoint before you leave. Want me to build the full plan with stays and costs?
              </p>
            </div>
          </div>

          {/* Poll mock */}
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-bold shrink-0">
              S
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-card border border-border/60 px-4 py-2.5 shadow-xs">
              <p className="text-xs font-bold text-foreground mb-2">Sam started a poll</p>
              <p className="text-sm font-semibold text-foreground/90 mb-2">Our must-do for day 2?</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-accent/10 border border-accent/30 px-3 py-2">
                  <span className="text-xs font-semibold text-foreground/90">Tea garden walk</span>
                  <span className="text-[11px] font-bold text-accent shrink-0">3 / 4</span>
                </div>
                <div className="rounded-xl bg-muted/60 border border-border/60 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Zip line & indoor games</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input row mock */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex items-center gap-2 rounded-full bg-card border border-border/60 px-3 py-2 shadow-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-bold text-primary">Ask TravelAI</span>
            </div>
            <div className="flex-1 rounded-full bg-card border border-border/60 px-4 py-2 text-xs text-muted-foreground">
              Message the trip…
            </div>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="grid gap-3 sm:grid-cols-3">
        {highlightCards.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground block">{title}</span>
              {body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingChat;
