import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRoundCog,
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
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/accounts', label: 'Accounts', icon: Users },
  { to: '/admin/agencies', label: 'Agencies', icon: Building2 },
  { to: '/admin/audit', label: 'Audit', icon: ClipboardList },
  {
    to: '/admin/platform-admins',
    label: 'Platform admins',
    icon: UserRoundCog,
  },
];

/**
 * Platform console shell (PA1).
 *
 * Separate from the personal and agency layouts: there is no trip navigation,
 * no workspace switcher and no cross-link into either product. PA4 fills the
 * last placeholder section, so every navigation item now has a real screen.
 */
const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = usePlatformAuth();

  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || 'Administrator';

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/60 px-4 py-5 lg:block">
          <div className="flex items-center gap-2.5 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">TravelAI</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-indigo-400">
                Platform
              </span>
            </span>
          </div>

          <nav className="mt-7 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-200'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <p className="mt-8 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
            Internal operations console. Every action here is written to the
            platform audit trail.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2 lg:hidden">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-white">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">Platform</span>
              </div>

              <div className="hidden min-w-0 lg:block">
                <span className="block text-sm font-semibold">Operations console</span>
                <span className="block text-[11px] text-slate-500">
                  Platform realm · super admin
                </span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="hidden border-indigo-800 bg-indigo-950/40 text-[10px] uppercase tracking-wide text-indigo-300 sm:inline-flex"
                >
                  Super admin
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-slate-800"
                      aria-label="Admin account menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={avatarSrc(user?.avatarUrl)} alt="" />
                        <AvatarFallback className="bg-indigo-950 text-xs font-semibold text-indigo-300">
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
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/admin/account')}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Account security
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleLogout()}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <nav className="flex gap-1 overflow-x-auto border-t border-slate-900 px-3 py-2 lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      isActive
                        ? 'bg-indigo-500/15 text-indigo-200'
                        : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
