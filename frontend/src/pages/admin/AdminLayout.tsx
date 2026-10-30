import React, { useCallback, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  ExternalLink,
  Flag,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldCheck,
  UserRoundCog,
  Users,
} from 'lucide-react';
import AdminCommandMenu from '@/components/admin/AdminCommandMenu';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { api } from '@/services/api';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
};

/**
 * The console reads in the order an operator works: what happened, who exists,
 * then the two jobs that need a decision. Access comes last because it changes
 * rarely.
 */
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Monitor',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/audit', label: 'Audit', icon: ClipboardList },
    ],
  },
  {
    label: 'Directory',
    items: [
      { to: '/admin/accounts', label: 'Accounts', icon: Users },
      { to: '/admin/agencies', label: 'Agencies', icon: Building2 },
      { to: '/admin/applications', label: 'Applications', icon: Inbox },
    ],
  },
  {
    label: 'Safety & access',
    items: [
      { to: '/admin/reports', label: 'Reported content', icon: Flag },
      { to: '/admin/platform-admins', label: 'Platform admins', icon: UserRoundCog },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to || pathname === `${item.to}/`;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

type Crumb = { label: string; to?: string };

/**
 * The trail in the header. Record pages add a leaf; the section stops being a
 * link once you are standing on it.
 */
function crumbTrail(pathname: string): Crumb[] {
  if (pathname === '/admin' || pathname === '/admin/') {
    return [{ label: 'Overview' }];
  }

  if (pathname.startsWith('/admin/account')) {
    return [{ label: 'Console', to: '/admin' }, { label: 'Account' }];
  }

  const section = allNavItems.find((item) => isItemActive(pathname, item));
  if (!section) {
    return [{ label: 'Console', to: '/admin' }];
  }

  const trail: Crumb[] = [
    { label: 'Console', to: '/admin' },
    {
      label: section.label,
      to: pathname === section.to ? undefined : section.to,
    },
  ];

  if (pathname.startsWith('/admin/agencies/')) {
    trail.push({ label: 'Agency' });
  }

  return trail;
}

/** The mobile sheet closes after a jump; the desktop rail keeps its state. */
const CloseSheetOnNavigate: React.FC = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  // The sheet mounts this when it opens, so the first run records the current
  // path instead of treating it as a navigation.
  const lastPath = React.useRef(pathname);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, setOpenMobile]);
  return null;
};

/**
 * The platform console shell (PA1).
 *
 * This is a third, isolated realm: no trip navigation, no workspace switcher and
 * no cross-link into either product. The console is deliberately always dark —
 * an operator should know which realm they are in at a glance — so the whole
 * tree is scoped to `.dark` and reads from the same semantic tokens as the rest
 * of the product instead of carrying a parallel slate palette.
 */
const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = usePlatformAuth();
  const [commandOpen, setCommandOpen] = React.useState(false);

  // Applications are the one queue a visitor can add to without a session, so
  // the shell keeps a quiet count and updates it when the queue page decides.
  const [pendingApplications, setPendingApplications] = React.useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .listAgencyApplications({ status: 'pending', limit: 1 })
        .then((result) => {
          if (!cancelled) setPendingApplications(result.counts.pending);
        })
        .catch(() => {
          if (!cancelled) setPendingApplications(null);
        });
    };
    load();
    window.addEventListener('travelai:applications-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('travelai:applications-changed', load);
    };
  }, []);

  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || 'Administrator';

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  }, [logout, navigate]);

  const trail = crumbTrail(location.pathname);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <SidebarProvider>
        <a
          href="#admin-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-indigo-500 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          Skip to content
        </a>

        <Sidebar collapsible="icon">
          <CloseSheetOnNavigate />
          <SidebarHeader className="border-b border-sidebar-border">
            <Link
              to="/admin"
              className="flex items-center gap-2.5 rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white shadow-sm">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                  TravelAI
                </span>
                <span className="block truncate text-[11px] text-sidebar-foreground/60">
                  Platform console
                </span>
              </span>
            </Link>
            <Badge
              variant="outline"
              className="w-fit border-indigo-500/40 bg-indigo-500/10 text-[10px] font-semibold uppercase tracking-wide text-indigo-300 group-data-[collapsible=icon]:hidden"
            >
              Isolated realm
            </Badge>
          </SidebarHeader>

          <SidebarContent>
            <nav aria-label="Console sections">
              {navGroups.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={isItemActive(location.pathname, item)}
                            tooltip={item.label}
                            className="h-10"
                          >
                            <NavLink to={item.to} end={item.end}>
                              <item.icon aria-hidden />
                              <span className="group-data-[collapsible=icon]:hidden">
                                {item.label}
                              </span>
                            </NavLink>
                          </SidebarMenuButton>
                          {item.to === '/admin/applications' &&
                          pendingApplications !== null &&
                          pendingApplications > 0 ? (
                            <SidebarMenuBadge className="bg-indigo-500/15 text-indigo-300">
                              {pendingApplications > 99 ? '99+' : pendingApplications}
                            </SidebarMenuBadge>
                          ) : null}
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </nav>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Account menu for ${displayName}`}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left outline-none transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={avatarSrc(user?.avatarUrl)} alt="" />
                    <AvatarFallback className="bg-indigo-500/15 text-xs font-semibold text-indigo-300">
                      {initialsFor(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="block truncate text-sm font-medium text-sidebar-foreground">
                      {displayName}
                    </span>
                    <span className="block truncate text-[11px] text-sidebar-foreground/60">
                      {user?.email}
                    </span>
                  </span>
                  <ChevronsUpDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-semibold">{displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-indigo-400">
                    Super admin · platform realm
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/admin/account')}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Account security
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/" target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open the public site
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out of the console
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="bg-background">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="h-9 w-9" />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap gap-1.5 text-[13px] sm:gap-2">
                {trail.map((crumb, index) => {
                  const last = index === trail.length - 1;
                  return (
                    <React.Fragment key={`${crumb.label}-${index}`}>
                      {index > 0 ? (
                        <BreadcrumbSeparator className="hidden sm:block" />
                      ) : null}
                      <BreadcrumbItem
                        className={cn('min-w-0', !last && 'hidden sm:inline-flex')}
                      >
                        {crumb.to ? (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.to} className="truncate">
                              {crumb.label}
                            </Link>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="truncate font-medium">
                            {crumb.label}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="hidden border-indigo-500/40 bg-indigo-500/10 text-[10px] font-semibold uppercase tracking-wide text-indigo-300 sm:inline-flex"
              >
                Super admin
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCommandOpen(true)}
                aria-label="Jump to a page (Control or Command K)"
                className="h-9 gap-2 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:px-3"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline">
                  ⌘K
                </kbd>
              </Button>
            </div>
          </header>

          <div
            id="admin-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
          >
            <Outlet />
          </div>
        </SidebarInset>

        <AdminCommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          sections={navGroups.map((group) => ({
            label: group.label,
            items: group.items.map((item) => ({
              label: item.label,
              to: item.to,
              icon: item.icon,
            })),
          }))}
          onSignOut={() => void handleLogout()}
        />
      </SidebarProvider>
    </div>
  );
};

export default AdminLayout;
