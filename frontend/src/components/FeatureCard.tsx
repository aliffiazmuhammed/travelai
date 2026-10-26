import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FeatureCard = ({ icon: Icon, title, description }: FeatureCardProps) => {
  return (
    <div className="group bg-card rounded-3xl p-6 sm:p-8 shadow-card border border-border/70 h-full flex flex-col">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
        <Icon className="h-7 w-7 stroke-[2.2]" />
      </div>
      <h3 className="text-xl font-bold mb-3 text-foreground tracking-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-sm">{description}</p>
    </div>
  );
};

export default FeatureCard;
