import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { applyPageMeta } from "@/lib/meta";
import { Compass, Sparkles, Home, ArrowLeft } from "lucide-react";

const NotFound: React.FC = () => {
  const location = useLocation();
  const attemptedPath = location.pathname;
  const displayPath =
    attemptedPath.length > 64
      ? `${attemptedPath.slice(0, 40)}…${attemptedPath.slice(-18)}`
      : attemptedPath;

  useEffect(() => {
    console.warn("404: Non-existent route accessed:", location.pathname);
    return applyPageMeta({
      title: "Page not found · waytowalk",
      description:
        "The page you followed does not exist. Head back to waytowalk or start planning a trip.",
      robots: "noindex, nofollow",
    });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex-1 container mx-auto px-4 flex items-center justify-center pt-24 pb-16">
        <div className="relative w-full max-w-lg p-8 sm:p-12 rounded-3xl bg-card/85 backdrop-blur-md border border-border/80 shadow-2xl text-center space-y-6">
          {/* Subtle Glow circles */}
          <div className="absolute -top-16 -left-16 w-36 h-36 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

          {/* Animated Central Icon */}
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Compass className="w-10 h-10 animate-fade-in" />
            </div>
            <span className="absolute -top-1 -right-1 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-md">
              404
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Lost in the Clouds
            </h1>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
              It looks like your compass took an unexpected detour. This path
              doesn&rsquo;t exist on our travel map:
            </p>
            <code
              title={attemptedPath}
              className="mx-auto block max-w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground"
            >
              {displayPath}
            </code>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            <Button
              asChild
              variant="outline"
              className="h-11 w-full gap-2 rounded-xl px-5 text-xs font-semibold sm:w-auto"
            >
              <Link to="/">
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Back to Home</span>
              </Link>
            </Button>

            <Button
              asChild
              variant="hero"
              className="h-11 w-full gap-2 rounded-xl px-6 text-xs font-bold shadow-sm sm:w-auto"
            >
              <Link to="/plan">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Plan an Adventure</span>
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
