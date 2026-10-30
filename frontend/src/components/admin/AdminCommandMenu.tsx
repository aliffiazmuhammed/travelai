import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ExternalLink,
  KeyRound,
  LogOut,
  UserRoundCog,
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

export type AdminCommandSection = {
  label: string;
  items: Array<{ label: string; to: string; icon: React.ElementType }>;
};

interface AdminCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: AdminCommandSection[];
  onSignOut: () => void;
}

/**
 * The console jump menu (⌘K / Ctrl+K). It mirrors the sidebar and adds the two
 * jobs an operator starts from anywhere — provisioning a tenant and adding a
 * super-admin. Items are static, so it opens without touching the network.
 */
const AdminCommandMenu: React.FC<AdminCommandMenuProps> = ({
  open,
  onOpenChange,
  sections,
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
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="dark rounded-2xl border-border"
    >
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
            value="provision a new agency tenant"
            onSelect={() => go('/admin/agencies?provision=1')}
          >
            <Building2 className="mr-2 h-4 w-4 text-indigo-400" aria-hidden />
            Provision an agency
          </CommandItem>
          <CommandItem
            value="add platform admin super admin"
            onSelect={() => go('/admin/platform-admins?new=1')}
          >
            <UserRoundCog className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            Add a platform admin
          </CommandItem>
          <CommandItem value="account security password" onSelect={() => go('/admin/account')}>
            <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            Account security
          </CommandItem>
          <CommandItem
            value="view public site travelai"
            onSelect={() => {
              onOpenChange(false);
              window.open('/', '_blank', 'noopener,noreferrer');
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            Open the public site
          </CommandItem>
          <CommandItem
            value="sign out of the console"
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            Sign out of the console
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>Platform console · isolated realm</span>
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

export default AdminCommandMenu;
