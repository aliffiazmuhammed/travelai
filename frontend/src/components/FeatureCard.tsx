import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FeatureCard = ({ icon: Icon, title, description }: FeatureCardProps) => {
  return (
    <div className="group bg-card rounded-2xl p-8 shadow-card hover-lift border border-border/50 h-full flex flex-col">
      <div className="bg-gradient-sky w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-soft group-hover:shadow-card transition-smooth">
        <Icon className="h-7 w-7 text-white" />
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
};

export default FeatureCard;
