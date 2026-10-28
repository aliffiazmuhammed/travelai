import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Building2,
  FileText,
  Gauge,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgency } from '@/context/AgencyContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';

const navItems = [
  { to: '/agency', label: 'Overview', icon: LayoutDashboard, end: true },
  // M9 D5: leads from the public directory. Every member may read the inbox.
  { to: '/agency/enquiries', label: 'Enquiries', icon: Inbox, end: false },
  { to: '/agency/trips', label: 'Trips', icon: Map, end: false },
  {
    to: '/agency/clients',
    label: 'Clients',
    icon: BriefcaseBusiness,
    end: false,
  },
  { to: '/agency/templates', label: 'Templates', icon: FileText, end: false },
  { to: '/agency/team', label: 'Team', icon: Users, end: false },
  // A8: usage and the append-only audit log (owner/admin only).
  { to: '/agency/operations', label: 'Operations', icon: Gauge, end: false, adminOnly: true },
  { to: '/agency/settings', label: 'Settings', icon: Settings, end: false },
];

/**
 * The agency product shell (PA0). This layout is intentionally separate from
 * the personal Navbar/Dashboard. An agency account belongs to exactly one
 * tenant, so there is a tenant badge instead of a switcher, and signing out
 * here leaves the personal session untouched.
 */
const AgencyLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, agency: sessionAgency, logout } = useAgencyAuth();
  const { activeAgency, activeAgencyId, loading, error, canManage } = useAgency();
  const [newLeads, setNewLeads] = useState(0);

  // D6: the nav badge is the cheapest possible nudge — it refetches on route
  // changes and stays silent when the summary fails (the inbox still works).
  useEffect(() => {
    if (!activeAgencyId) {
      setNewLeads(0);
      return;
    }
    let cancelled = false;
    void api
      .getAgencyEnquirySummary()
      .then((result) => {
        if (!cancelled) setNewLeads(result.summary.byStatus.new);
      })
      .catch(() => {
        /* badge only */
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId, location.pathname]);

  const visibleNavItems = navItems.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || canManage
  );

  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || 'You';
  const tenantName = activeAgency?.name ?? sessionAgency?.name ?? 'Agency workspace';
  const tenantSlug = sessionAgency?.slug;
  const role = activeAgency?.role ?? sessionAgency?.role;

  const handleLogout = async () => {
    await logout();
    navigate('/agency/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/agency" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-semibold">TravelAI</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">
                Agency
              </span>
            </span>
          </Link>

          <div className="mx-2 h-7 w-px bg-slate-200 dark:bg-slate-800" />

          {/* One tenant per account: this is a label, not a switcher. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {tenantName}
              </span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {loading && !activeAgency
                  ? 'Opening your workspace…'
                  : [tenantSlug ? `workspace: ${tenantSlug}` : null, role ? agencyRoleLabel(role) : null]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </span>
            {role ? (
              <Badge
                variant="outline"
                className={cn('hidden shrink-0 text-[10px] sm:inline-flex', agencyRoleBadgeClass(role))}
              >
                {agencyRoleLabel(role)}
              </Badge>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 sm:inline-flex dark:text-slate-300"
            >
              <Link to="/">
                <Home className="mr-1.5 h-4 w-4" />
                TravelAI home
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-900"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatarSrc(user?.avatarUrl)} alt="" />
                    <AvatarFallback className="bg-teal-100 text-xs font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                      {initialsFor(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-semibold">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user?.email}
                  </span>
                  {tenantSlug ? (
                    <span className="mt-1 block truncate text-[11px] text-teal-600 dark:text-teal-400">
                      Agency account · {tenantSlug}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/agency/settings')}>
                  <UserRound className="mr-2 h-4 w-4" />
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/')}>
                  <Home className="mr-2 h-4 w-4" />
                  TravelAI home
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out of agency
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.to === '/agency/enquiries' && newLeads > 0 ? (
                <span className="ml-0.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {newLeads > 99 ? '99+' : newLeads}
                </span>
              ) : null}
            </NavLink>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
};

export default AgencyLayout;
