import { useAuth } from "@/context/UserContext";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeatureCard from "@/components/FeatureCard";
import { Brain, Calendar, Map, DollarSign, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Landing = () => {
  const { isAuthenticated } = useAuth();
  const features = [
    {
      icon: Brain,
      title: "Real-Time AI Streaming",
      description:
        "Powered by Gemini 2.5 Pro with Groq fallback. Watch your personalized itinerary synthesize live in seconds with multi-stage progress.",
    },
    {
      icon: Calendar,
      title: "Interactive Day Timelines",
      description:
        "Rich vertical timelines with morning to night scheduling. Customize, reorder, edit, and add activities to any day on the fly.",
    },
    {
      icon: Map,
      title: "Interactive Leaflet Maps",
      description:
        "Visualize your destination with OpenStreetMap tiles, custom numbered activity markers, stay locations, and day-by-day travel routes.",
    },
    {
      icon: DollarSign,
      title: "Visual Budget Analytics",
      description:
        "Stay in control with interactive Recharts donut and bar breakdowns, per-person toggles, emergency reserves, and UPI payment guides.",
    },
    {
      icon: Share2,
      title: "Public Sharing & Export",
      description:
        "Generate public web links, copy formatted summaries ready for WhatsApp, export full JSON data, or print clean travel guide PDFs.",
    },
    {
      icon: Users,
      title: "Smart Group Personalization",
      description:
        "Solo, couple, family, or friends trip presets with adult and child count adjusters, pacing algorithms, and custom travel interests.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />

      {/* Features Section */}
      <section className="py-16 sm:py-24 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Everything You Need to
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Plan the Perfect Trip
              </span>
            </h2>
            <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              Powerful features designed to make travel planning effortless and enjoyable
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, index) => (
              <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <FeatureCard {...feature} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-24 px-4">
        <div className="container mx-auto">
          <div className="bg-gradient-sky rounded-3xl p-6 sm:p-12 md:p-16 text-center shadow-card">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
              Ready to Start Your Adventure?
            </h2>
            <p className="text-sm sm:text-lg md:text-xl text-white/90 mb-6 sm:mb-8 max-w-2xl mx-auto px-2">
              Join thousands of travelers who've discovered smarter trip planning with AI
            </p>
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              <Button variant="secondary" size="xl" className="shadow-hover w-full sm:w-auto">
                {isAuthenticated ? "Go to Dashboard" : "Start Planning Now"}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="text-sm text-muted-foreground">
                © 2025 TravelAI. Built with love for travelers.
              </p>
            </div>
            <div className="flex gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
