import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
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
import { useAuth } from '@/context/UserContext';
import { useAgency } from '@/context/AgencyContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/agency', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/agency/team', label: 'Team', icon: Users, end: false },
  { to: '/agency/settings', label: 'Settings', icon: Settings, end: false },
];

const futureItems = [
  { label: 'Trips', icon: Map, milestone: 'A2' },
  { label: 'Clients', icon: BriefcaseBusiness, milestone: 'A4' },
  { label: 'Templates', icon: FileText, milestone: 'A6' },
];

/**
 * The agency product shell (A1). This layout is intentionally separate from
 * the personal Navbar/Dashboard: agencies get their own tenant switcher,
 * navigation and future trip/client/template surfaces.
 */
const AgencyLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    agencies,
    activeAgency,
    activeAgencyId,
    setActiveAgency,
    loading,
    error,
  } = useAgency();

  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || 'You';

  const handleLogout = async () => {
    await logout();
    navigate('/');
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-900"
                disabled={loading && agencies.length === 0}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {activeAgency?.name ??
                      (loading ? 'Loading workspace...' : 'Choose agency')}
                  </span>
                  {activeAgency ? (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {agencyRoleLabel(activeAgency.role)} ·{' '}
                      {activeAgency.memberCount}{' '}
                      {activeAgency.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Your agencies</DropdownMenuLabel>
              {agencies.length === 0 ? (
                <DropdownMenuItem disabled>No agencies yet</DropdownMenuItem>
              ) : (
                agencies.map((agency) => (
                  <DropdownMenuItem
                    key={agency._id}
                    onSelect={() => setActiveAgency(agency._id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{agency.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        agencyRoleBadgeClass(agency.role)
                      )}
                    >
                      {agencyRoleLabel(agency.role)}
                    </Badge>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/agency/onboarding')}>
                <Building2 className="mr-2 h-4 w-4" />
                Create another agency
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 sm:inline-flex dark:text-slate-300"
            >
              <Link to="/dashboard">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Personal
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
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-semibold">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user?.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Personal workspace
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/profile')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
          {navItems.map((item) => (
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
            </NavLink>
          ))}
          {futureItems.map((item) => (
            <span
              key={item.label}
              title={`Agency ${item.label.toLowerCase()} arrive in ${item.milestone}`}
              className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 dark:text-slate-600"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              <Badge
                variant="outline"
                className="ml-0.5 border-slate-200 px-1.5 py-0 text-[9px] text-slate-400 dark:border-slate-800 dark:text-slate-600"
              >
                {item.milestone}
              </Badge>
            </span>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}
        {activeAgencyId ? (
          <Outlet />
        ) : (
          <Outlet context={{ loading }} />
        )}
      </main>
    </div>
  );
};

export default AgencyLayout;
