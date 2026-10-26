import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, MapPin } from "lucide-react";
import heroImage from "@/assets/hero-travel.jpg";
import { useAuth } from "@/context/UserContext";

const Hero = () => {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage} 
          alt="Beautiful travel destination" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background/95 dark:from-background/95 dark:via-background/80 dark:to-background/95" />
      </div>
      
          {/* Content */}
      <div className="container mx-auto px-4 z-10">
        <div className="max-w-4xl mx-auto text-center space-y-7 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-primary/10 backdrop-blur-sm border border-primary/25 rounded-full px-4 sm:px-6 py-2 shadow-soft">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-primary">
              Now with an AI helper inside your trip chat
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-semibold leading-tight tracking-tight text-foreground">
            Say where you want to go.
            <br />
            <span className="bg-gradient-to-r from-primary via-sky-500 to-accent bg-clip-text text-transparent">
              We'll plan the whole trip.
            </span>
          </h1>

          <p className="text-base sm:text-xl md:text-2xl text-foreground/80 dark:text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 font-medium">
            One message is all it takes. TravelAI writes a day-by-day plan with places, budget and a map — then keeps
            everyone in the group on the same page in chat.
          </p>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5 pt-4 w-full max-w-xs sm:max-w-none mx-auto">
            <Link to="/plan" className="w-full sm:w-auto">
              <Button variant="hero" size="xl" className="group shadow-md w-full sm:w-auto justify-center font-bold">
                Plan Your Trip
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform ml-1.5" />
              </Button>
            </Link>
            {isAuthenticated ? (
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="gap-2 shadow-xs w-full sm:w-auto justify-center font-semibold">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span>My Trips / Dashboard</span>
                </Button>
              </Link>
            ) : (
              <Link to="/auth" className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="shadow-xs w-full sm:w-auto justify-center font-semibold">
                  Sign Up Free
                </Button>
              </Link>
            )}
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-5 sm:pt-7 text-xs sm:text-sm text-foreground/75 dark:text-muted-foreground font-medium px-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span>No card needed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span>Works on your phone</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span>Chats stay private</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
