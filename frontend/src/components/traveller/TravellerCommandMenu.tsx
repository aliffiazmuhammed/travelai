import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Compass,
  FileText,
  Globe2,
  Inbox,
  LogOut,
  Map,
  Moon,
  Plane,
  Sparkles,
  Sun,
  UserCircle2,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

export interface TravellerCommandSection {
  label: string;
  items: Array<{ label: string; to: string; icon: React.ElementType }>;
}

interface TravellerCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: TravellerCommandSection[];
  isAuthenticated: boolean;
  isDark: boolean;
  travelHandle?: string;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

/**
 * The traveller jump menu (⌘K or Ctrl+K). It mirrors the top navbar and adds
 * the handful of actions people look for first: plan a trip, flip the theme,
 * open their public page, or sign out. Static, so it answers instantly.
 */
const TravellerCommandMenu: React.FC<TravellerCommandMenuProps> = ({
  open,
  onOpenChange,
  sections,
  isAuthenticated,
  isDark,
  travelHandle,
  onToggleTheme,
  onSignOut,
}) => {
  const navigate = useNavigate();

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page or action…" />
      <CommandList>
        <CommandEmpty>Nothing matches that search.</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.label} heading={section.label}>
            {section.items.map((item) => (
              <CommandItem
                key={`${section.label}-${item.to}`}
                value={`${section.label} ${item.label}`}
                onSelect={() => go(item.to)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                {item.label}
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="plan a trip with ai new trip"
            onSelect={() => go('/plan')}
          >
            <Sparkles className="mr-2 h-4 w-4 text-primary" aria-hidden />
            Plan a trip with AI
          </CommandItem>
          <CommandItem
            value="toggle dark light theme appearance"
            onSelect={() => {
              onToggleTheme();
              onOpenChange(false);
            }}
          >
            {isDark ? (
              <Sun className="mr-2 h-4 w-4 text-amber-400" aria-hidden />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-indigo-500" aria-hidden />
            )}
            Switch to {isDark ? 'light' : 'dark'} theme
          </CommandItem>
          {isAuthenticated && travelHandle ? (
            <CommandItem
              value="your public travel page profile"
              onSelect={() => go(`/travelers/${encodeURIComponent(travelHandle)}`)}
            >
              <Globe2 className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
              Your travel page
            </CommandItem>
          ) : null}
          <CommandItem value="travelai home landing" onSelect={() => go('/')}>
            <Plane className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            TravelAI home
          </CommandItem>
          {isAuthenticated ? (
            <CommandItem
              value="sign out log out"
              onSelect={() => {
                onOpenChange(false);
                onSignOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
              Sign out
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Map className="h-3 w-3" aria-hidden />
          TravelAI
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]">
            Esc
          </kbd>
          to close
        </span>
      </div>
    </CommandDialog>
  );
};

/** Icons for the page links the navbar hands over. */
export const commandIconFor = (path: string): React.ElementType => {
  if (path === '/') return Plane;
  if (path.startsWith('/explore')) return Compass;
  if (path.startsWith('/agencies')) return Building2;
  if (path.startsWith('/plan')) return Sparkles;
  if (path.startsWith('/dashboard')) return Map;
  if (path.startsWith('/enquiries')) return Inbox;
  if (path.startsWith('/proposals')) return FileText;
  if (path.startsWith('/profile')) return UserCircle2;
  return ArrowRight;
};

export default TravellerCommandMenu;
