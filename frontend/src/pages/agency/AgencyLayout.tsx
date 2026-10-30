import React, { useCallback, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  ChevronsUpDown,
  FileText,
  Gauge,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Map,
  Search,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import AgencyCommandMenu from '@/components/agency/AgencyCommandMenu';
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
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgency } from '@/context/AgencyContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  adminOnly?: boolean;
};

/**
 * The workspace reads in the order a team works: what needs an answer, what is
 * public, what is being planned, then the people and the admin corners.
 */
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Work',
    items: [
      { to: '/agency', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/agency/enquiries', label: 'Enquiries', icon: Inbox },
      { to: '/agency/events', label: 'Events', icon: CalendarRange },
      { to: '/agency/trips', label: 'Trips', icon: Map },
    ],
  },
  {
    label: 'Relationships',
    items: [{ to: '/agency/clients', label: 'Clients', icon: BriefcaseBusiness }],
  },
  {
    label: 'Studio',
    items: [{ to: '/agency/templates', label: 'Templates', icon: FileText }],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/agency/team', label: 'Team', icon: Users },
      { to: '/agency/operations', label: 'Operations', icon: Gauge, adminOnly: true },
      { to: '/agency/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

/** What a nav count means. The chips look alike, so the label carries the difference. */
function badgeHint(path: string, count: number): string {
  if (path === '/agency/enquiries') {
    return count === 1 ? '1 enquiry needs an answer' : `${count} enquiries need an answer`;
  }
  return count === 1
    ? '1 traveller is waiting for a spot'
    : `${count} travellers are waiting for a spot`;
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

type Crumb = { label: string; to?: string };

/**
 * The trail in the workspace header. Pages that open a record add a leaf here;
 * the section itself stops being a link once you are standing on it.
 */
function crumbTrail(pathname: string): Crumb[] {
  const section = allNavItems.find((item) => isItemActive(pathname, item));
  if (!section || pathname === '/agency' || pathname === '/agency/') {
    return [{ label: 'Overview' }];
  }

  const trail: Crumb[] = [
    { label: 'Workspace', to: '/agency' },
    {
      label: section.label,
      to: pathname === section.to ? undefined : section.to,
    },
  ];

  if (pathname.startsWith('/agency/trips/')) {
    trail.push({
      label: pathname === '/agency/trips/new' ? 'New trip' : 'Trip',
    });
  }

  return trail;
}

/** The sheet closes after a jump; the desktop rail keeps its state. */
const CloseSheetOnNavigate: React.FC = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  // The sheet mounts this component when it opens, so the first run records the
  // current path instead of treating it as a navigation (which closed the
  // drawer the instant it appeared).
  const lastPath = React.useRef(pathname);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, setOpenMobile]);
  return null;
};

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
  const {
    activeAgency,
    activeAgencyId,
    loading,
    error,
    canManage,
    enquiryNeedsAttention,
    refreshEnquiryBadge,
    eventNeedsAttention,
    refreshEventBadge,
  } = useAgency();

  // D6: the cheapest possible nudge. It refetches on route changes and stays
  // silent when the summary fails (the inbox still works). It counts replies
  // as well as fresh leads: an answer buried in an existing thread needs the
  // team just as much as a first contact. The count itself lives in the agency
  // context so the inbox can lower it the moment a thread is read.
  //
  // M10: the Events item answers the same question for travellers waiting on
  // a spot, so both counters refresh together and both fail quietly.
  //
  // M10-QA-14, intentional: this is a route-change refresh, not a live tier.
  // A new interest raised while the team sits still shows on the next agency
  // navigation; there is no events stream, and none is promised yet.
  const refreshBadge = useCallback(() => {
    void refreshEnquiryBadge().catch(() => {
      /* badge only */
    });
  }, [refreshEnquiryBadge]);

  const refreshBadges = useCallback(() => {
    refreshBadge();
    void refreshEventBadge().catch(() => {
      /* badge only */
    });
  }, [refreshBadge, refreshEventBadge]);

  useEffect(() => {
    refreshBadges();
  }, [location.pathname, refreshBadges]);

  // R6: outside the inbox the badge listens to the workspace stream, so a lead
  // that arrives while the team is on Trips still shows. The inbox page runs
  // its own stream and refreshes the same counter, so this one stays closed
  // there rather than opening a second connection.
  const onInbox = location.pathname.startsWith('/agency/enquiries');
  useEnquiryLiveRefresh(refreshBadge, {
    enabled: Boolean(activeAgencyId) && !onInbox,
    channel: 'agency',
    streamKey: activeAgencyId ?? undefined,
  });

  const navBadges: Record<string, number> = {
    '/agency/enquiries': enquiryNeedsAttention,
    '/agency/events': eventNeedsAttention,
  };

  const navGroupsVisible = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || canManage),
    }))
    .filter((group) => group.items.length > 0);

  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || 'You';
  const tenantName = activeAgency?.name ?? sessionAgency?.name ?? 'Agency workspace';
  const tenantSlug = sessionAgency?.slug;
  const role = activeAgency?.role ?? sessionAgency?.role;
  const canPlan = role === 'owner' || role === 'admin' || role === 'planner';

  const trail = crumbTrail(location.pathname);
  const [commandOpen, setCommandOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/agency/login', { replace: true });
  };

  return (
    <SidebarProvider>
      <a
        href="#agency-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:bg-slate-900 dark:focus:text-slate-50"
      >
        Skip to content
      </a>

      <Sidebar collapsible="icon">
        <CloseSheetOnNavigate />
        <SidebarHeader className="border-b border-sidebar-border">
          <Link
            to="/agency"
            className="flex items-center gap-2.5 rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                {tenantName}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/60">
                {loading && !activeAgency
                  ? 'Opening your workspace…'
                  : tenantSlug
                    ? `workspace: ${tenantSlug}`
                    : 'Agency workspace'}
              </span>
            </span>
          </Link>
          {role ? (
            <Badge
              variant="outline"
              className={cn(
                'w-fit text-[10px] group-data-[collapsible=icon]:hidden',
                agencyRoleBadgeClass(role)
              )}
            >
              {agencyRoleLabel(role)}
            </Badge>
          ) : null}
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label="Agency sections">
            {navGroupsVisible.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const count = navBadges[item.to] ?? 0;
                      const hint = count > 0 ? badgeHint(item.to, count) : null;
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={isItemActive(location.pathname, item)}
                            tooltip={item.label}
                            className="h-10"
                          >
                            <NavLink
                              to={item.to}
                              end={item.end}
                              title={hint ?? undefined}
                              aria-label={hint ? `${item.label}, ${hint}` : undefined}
                            >
                              <item.icon aria-hidden />
                              <span className="group-data-[collapsible=icon]:hidden">
                                {item.label}
                              </span>
                              {count > 0 ? (
                                <SidebarMenuBadge
                                  title={hint ?? undefined}
                                  className="rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white"
                                >
                                  {count > 99 ? '99+' : count}
                                </SidebarMenuBadge>
                              ) : null}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
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
                  <AvatarFallback className="bg-teal-100 text-xs font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
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
                <span className="block truncate text-xs text-slate-500">{user?.email}</span>
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
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-slate-50 dark:bg-slate-950">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-6">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCommandOpen(true)}
              aria-label="Search the workspace (Control or Command K)"
              className="h-9 gap-2 rounded-full border-slate-200 bg-white/70 px-2.5 text-xs font-medium text-slate-500 hover:text-slate-900 sm:px-3 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-500 sm:inline dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                ⌘K
              </kbd>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 dark:text-slate-300 md:inline-flex"
            >
              <Link to="/">
                <Home className="mr-1.5 h-4 w-4" aria-hidden />
                TravelAI home
              </Link>
            </Button>
          </div>
        </header>

        <div
          id="agency-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
        >
          {error ? (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            >
              {error}
            </div>
          ) : null}
          <Outlet />
        </div>
      </SidebarInset>

      <AgencyCommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        sections={navGroupsVisible.map((group) => ({
          label: group.label,
          items: group.items.map((item) => ({
            label: item.label,
            to: item.to,
            icon: item.icon,
          })),
        }))}
        canPlan={canPlan}
        onSignOut={() => void handleLogout()}
      />
    </SidebarProvider>
  );
};

export default AgencyLayout;
