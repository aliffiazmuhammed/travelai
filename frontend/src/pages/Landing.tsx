import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeatureCard from "@/components/FeatureCard";
import LandingChat from "@/components/LandingChat";
import {
  Brain,
  Calendar,
  Map,
  BadgeIndianRupee,
  Share2,
  Users,
  MessageCircle,
  Sparkles,
  SlidersHorizontal,
  Smartphone,
  ListChecks,
  Lock,
  Compass,
  ArrowRight,
  UserPlus,
  Copy,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useGalleryEnabled } from "@/hooks/useGalleryEnabled";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: "A plan in one message",
    description:
      "Tell us where you're going, who's coming and what you like. You get a day-by-day plan with places, timings and cost.",
  },
  {
    icon: MessageCircle,
    title: "Ask TravelAI in the chat",
    description:
      "Type @TravelAI in your trip chat and ask anything — from 'is this enough time?' to 'pick dinner for the group'.",
  },
  {
    icon: Users,
    title: "Say it as a group",
    description:
      "Vote in chat on hotels, days or dinner spots. The plan everyone agrees on gets pinned so nobody has to scroll for it.",
  },
  {
    icon: Calendar,
    title: "Change any day",
    description:
      "Add, edit or reorder activities yourself. Move a day, save the change, and it updates for everyone.",
  },
  {
    icon: Map,
    title: "See the whole trip on a map",
    description:
      "Every place for the day, in order, with distance between them. No more juggling five apps.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Money without chaos",
    description:
      "See planned vs. actual spend, log what you paid, and know exactly who owes whom when the trip ends.",
  },
  {
    icon: Share2,
    title: "Share in one tap",
    description:
      "Send a link that anyone can open without an account, copy a WhatsApp summary, or download a clean PDF.",
  },
  {
    icon: SlidersHorizontal,
    title: "Tweak it anytime",
    description:
      "Test a different stay, change the day count, or ask TravelAI for a rainy-day alternative. Nothing is set in stone.",
  },
  {
    icon: Smartphone,
    title: "Works on phones and laptops",
    description:
      "The same trip looks good everywhere, because everyone keeps opening the same link.",
  },
];

const steps = [
  {
    icon: Sparkles,
    title: "Tell us about the trip",
    body: "Where, when, how many people, and what you love doing. A short message is enough.",
  },
  {
    icon: ListChecks,
    title: "Get a plan you can touch",
    body: "A day-by-day plan, a map, and costs appear together — and you can change any of it.",
  },
  {
    icon: Users,
    title: "Decide it together",
    body: "Friends join the trip chat to vote and ask questions, so you end up with a plan everyone likes.",
  },
];

const trustRows: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Your chats stay private",
    body: "Messages are end-to-end encrypted, meaning only people on your trip can read them.",
  },
  {
    icon: Calendar,
    title: "You stay in control",
    body: "Only you can change the trip's name, dates and privacy. Family and friends get the editing or viewing rights you give them.",
  },
];

const sharedTripPoints: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: UserPlus,
    title: "Ask to come along",
    body: "Send the owner a note. They decide who joins — once they say yes, you can follow the trip and comment.",
  },
  {
    icon: Copy,
    title: "Make it yours",
    body: "Take a copy of any shared trip and change whatever you like. The original stays exactly as it was.",
  },
  {
    icon: ShieldCheck,
    title: "Shared on purpose",
    body: "Only what the owner chose to publish is visible. No budgets, no expenses, no private chat.",
  },
];

const Landing = () => {
  const galleryEnabled = useGalleryEnabled();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />

      {/* How it works */}
      <section className="py-16 sm:py-20 px-4" aria-labelledby="how-it-works">
        <div className="container mx-auto">
          <div className="text-center mb-10 sm:mb-14 space-y-3">
            <h2 id="how-it-works" className="font-display text-2xl sm:text-4xl font-semibold tracking-tight">
              Three steps, and you're packed
            </h2>
            <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
              No forms, no spreadsheets, no group chats full of confusion.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-3xl border border-border/70 bg-card p-6 sm:p-7 shadow-card space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-wider text-primary/80">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                <span className="absolute right-5 bottom-4 text-5xl font-black text-primary/5 select-none" aria-hidden="true">
                  {index + 1}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Meet the AI helper — shows the actual chat, not tech words */}
      <section className="py-16 sm:py-24 px-4 bg-muted/30 border-y border-border/60" aria-labelledby="meet-travelai">
        <div className="container mx-auto">
          <div className="text-center mb-10 sm:mb-14 space-y-3">
            <h2 id="meet-travelai" className="font-display text-2xl sm:text-4xl font-semibold tracking-tight">
              Meet TravelAI,
              <span className="block text-primary">
                the helper in your trip chat
              </span>
            </h2>
            <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
              Type @TravelAI in your trip chat and it answers using your trip details, so the whole group can read and
              decide together.
            </p>
          </div>
          <LandingChat />
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 px-4" aria-labelledby="features">
        <div className="container mx-auto">
          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <h2 id="features" className="font-display text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight">
              Everything you need,
              <span className="block text-primary">
                minus the confusion
              </span>
            </h2>
            <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              If something feels like work, TravelAI does it for you. If it feels like fun, that part is yours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, index) => (
              <div key={feature.title} className="animate-fade-in" style={{ animationDelay: `${(index % 3) * 0.1}s` }}>
                <FeatureCard {...feature} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join a shared trip — the gallery story, shown only once the gallery
          has enough trips to be a good first impression (same gate as the nav) */}
      {galleryEnabled && (
        <section
          className="py-16 sm:py-24 px-4 bg-muted/30 border-y border-border/60"
          aria-labelledby="join-a-trip"
        >
          <div className="container mx-auto">
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary">
                <Compass className="h-3.5 w-3.5" />
                Shared trips
              </span>
              <h2 id="join-a-trip" className="font-display text-2xl sm:text-4xl font-semibold tracking-tight">
                Somebody already planned it
                <span className="block text-primary">Join in, or take a copy</span>
              </h2>
              <p className="text-sm sm:text-lg text-muted-foreground px-2">
                Browse the trips people chose to share. Ask the owner to come along, or make one your own and change it
                however you like — the original stays as it was.
              </p>
              <div className="pt-2">
                <Link to="/explore">
                  <Button
                    size="xl"
                    className="rounded-2xl font-bold text-base gap-2 shadow-lg hover:scale-[1.02] transition-transform w-full sm:w-auto"
                  >
                    Browse shared trips
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <ul className="mt-10 sm:mt-12 grid gap-4 sm:gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
              {sharedTripPoints.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs space-y-2"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Plain-language trust band */}
      <section className="py-12 sm:py-16 px-4" aria-labelledby="privacy">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto grid gap-4 sm:grid-cols-2">
            {trustRows.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-24 px-4">
        <div className="container mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-primary p-8 sm:p-14 md:p-16 text-center shadow-2xl text-white">
            <div className="relative z-10 max-w-3xl mx-auto space-y-4 sm:space-y-6">
              <h2 className="font-display text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white drop-shadow-sm">
                Ready for your next trip?
              </h2>
              <p className="text-sm sm:text-lg md:text-xl text-sky-100 font-medium max-w-2xl mx-auto px-2">
                Type it out, watch the plan come together, and share it with whoever's coming.
              </p>
              <div className="pt-2 sm:pt-4">
                <Link to="/plan">
                  <Button
                    size="xl"
                    className="bg-white text-sky-950 hover:bg-white/90 shadow-xl font-bold text-base sm:text-lg rounded-2xl px-8 sm:px-10 h-12 sm:h-14 hover:scale-[1.02] transition-transform w-full sm:w-auto"
                  >
                    Start Planning Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="text-sm text-muted-foreground">
                © 2026 TravelAI. Built with love for travelers.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
