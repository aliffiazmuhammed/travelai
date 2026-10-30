import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarPlus,
  Home,
  LogOut,
  Sparkles,
  UserRound,
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

export type AgencyCommandSection = {
  label: string;
  items: Array<{ label: string; to: string; icon: React.ElementType }>;
};

interface AgencyCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: AgencyCommandSection[];
  canPlan: boolean;
  onSignOut: () => void;
}

/**
 * The workspace jump menu (⌘K or Ctrl+K). It mirrors the sidebar and adds the
 * two actions people look for first — planning a trip and leaving the workspace.
 * Items are static, so it stays instant and never waits on a network call.
 */
const AgencyCommandMenu: React.FC<AgencyCommandMenuProps> = ({
  open,
  onOpenChange,
  sections,
  canPlan,
  onSignOut,
}) => {
  const navigate = useNavigate();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

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
                key={item.to}
                value={`${section.label} ${item.label}`}
                onSelect={() => go(item.to)}
              >
                <item.icon className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
                {item.label}
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-300" aria-hidden />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {canPlan ? (
            <CommandItem
              value="plan a trip with ai new trip"
              onSelect={() => go('/agency/trips/new')}
            >
              <Sparkles className="mr-2 h-4 w-4 text-teal-600" aria-hidden />
              Plan a trip with AI
            </CommandItem>
          ) : null}
          {canPlan ? (
            <CommandItem
              value="new event create event"
              onSelect={() => go('/agency/events?new=1')}
            >
              <CalendarPlus className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
              New event
            </CommandItem>
          ) : null}
          {canPlan ? (
            <CommandItem
              value="new client add client"
              onSelect={() => go('/agency/clients?new=1')}
            >
              <UserRound className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
              New client
            </CommandItem>
          ) : null}
          <CommandItem value="workspace home travelai" onSelect={() => go('/')}>
            <Home className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
            TravelAI home
          </CommandItem>
          <CommandItem
            value="sign out of agency"
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
            Sign out of agency
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3" aria-hidden />
          Agency workspace
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-sans text-[10px] dark:border-slate-700 dark:bg-slate-800">
            Esc
          </kbd>
          to close
        </span>
      </div>
    </CommandDialog>
  );
};

export default AgencyCommandMenu;
