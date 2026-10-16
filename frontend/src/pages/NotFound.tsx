import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Compass, Sparkles, Home, ArrowLeft } from "lucide-react";

const NotFound: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: Non-existent route accessed:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 flex items-center justify-center pt-24 pb-16">
        <div className="relative w-full max-w-lg p-8 sm:p-12 rounded-3xl bg-card/85 backdrop-blur-md border border-border/80 shadow-2xl text-center space-y-6">
          {/* Subtle Glow circles */}
          <div className="absolute -top-16 -left-16 w-36 h-36 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

          {/* Animated Central Icon */}
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Compass className="w-10 h-10 animate-spin [animation-duration:12s]" />
            </div>
            <span className="absolute -top-1 -right-1 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-black text-xs shadow-md">
              404
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              Lost in the Clouds
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              It looks like your compass took an unexpected detour. The path{" "}
              <code className="px-1.5 py-0.5 rounded-md bg-muted text-foreground font-mono text-[11px]">
                {location.pathname}
              </code>{" "}
              doesn't exist on our travel map.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/" className="w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto rounded-xl h-11 px-5 text-xs font-semibold gap-2"
              >
                <Home className="w-4 h-4" />
                <span>Back to Home</span>
              </Button>
            </Link>

            <Link to="/plan" className="w-full sm:w-auto">
              <Button
                type="button"
                variant="hero"
                className="w-full sm:w-auto rounded-xl h-11 px-6 text-xs font-bold gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Plan an Adventure</span>
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
