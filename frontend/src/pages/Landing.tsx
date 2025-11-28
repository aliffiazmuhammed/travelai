import { useAuth } from "@/context/UserContext";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeatureCard from "@/components/FeatureCard";
import { Brain, Calendar, Map, DollarSign, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Landing = () => {
  const { isAuthenticated } = useAuth();
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Planning",
      description: "Our advanced AI understands your preferences and creates personalized itineraries tailored just for you."
    },
    {
      icon: Calendar,
      title: "Day-by-Day Itineraries",
      description: "Get detailed daily plans with optimal timing, travel routes, and activity suggestions."
    },
    // {
    //   icon: Map,
    //   title: "Interactive Maps",
    //   description: "Visualize your journey with integrated maps showing all destinations and routes."
    // },
    {
      icon: DollarSign,
      title: "Budget Optimization",
      description: "Stay within your budget with smart recommendations for accommodations, dining, and activities."
    },
    // {
    //   icon: Star,
    //   title: "Personalized Suggestions",
    //   description: "Choose your interests and let AI find hidden gems that match your travel style."
    // },
    // {
    //   icon: Users,
    //   title: "Collaborative Planning",
    //   description: "Plan trips with friends and family. Share itineraries and make decisions together."
    // }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />

      {/* Features Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Everything You Need to
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Plan the Perfect Trip
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to make travel planning effortless and enjoyable
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <FeatureCard {...feature} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto">
          <div className="bg-gradient-sky rounded-3xl p-12 md:p-16 text-center shadow-card">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to Start Your Adventure?
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Join thousands of travelers who've discovered smarter trip planning with AI
            </p>
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              <Button variant="secondary" size="xl" className="shadow-hover">
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
