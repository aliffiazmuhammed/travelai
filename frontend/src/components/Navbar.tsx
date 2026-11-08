import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Sun, Moon, LogOut, UserCircle2, Globe2, FileText, Search, Home, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import TravellerCommandMenu, { commandIconFor } from "@/components/traveller/TravellerCommandMenu";
import { useAuth } from "@/context/UserContext";
import { useGalleryEnabled } from "@/hooks/useGalleryEnabled";
import { useAgencyDirectoryEnabled } from "@/hooks/useAgencyDirectoryEnabled";
import { useEventsEnabled } from "@/hooks/useEventsEnabled";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import { ENQUIRY_BADGE_EVENT } from "@/lib/enquiryBadge";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

/**
 * The one count that needs a home outside the inbox (M9 R6). Unread agency
 * replies win; with an empty inbox a live proposal still gets a nudge, because
 * the traveller has to open `/proposals` to answer it.
 */
const EnquiryBadge = ({ unread, proposals }: { unread: number; proposals: number }) => {
  const count = unread > 0 ? unread : proposals;
  if (count === 0) return null;
  const label = unread > 0 ? `${unread} unread replies` : `${proposals} new proposals`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
        unread > 0
          ? "bg-primary text-primary-foreground"
          : "bg-indigo-600 text-white"
      )}
    >
      {unread > 0 ? null : <FileText className="h-2.5 w-2.5" />}
      {count > 99 ? "99+" : count}
    </span>
  );
};

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // The navbar sits on every personal page, so the badge is a cheap read on
  // navigation rather than a second live stream (the pages that own one open
  // their own).
  const [enquiryBadge, setEnquiryBadge] = useState({ unread: 0, proposals: 0 });

  // F14: the chip shows the display name (or the email local part without one).
  const displayName =
    user?.name?.trim() || user?.label || user?.email?.split("@")[0] || "Traveler";

  // Synchronize Dark Mode on mount
  useEffect(() => {
    const isDarkSaved =
      localStorage.getItem("travelai_theme") === "dark" ||
      (!("travelai_theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    setIsDark(isDarkSaved);
    if (isDarkSaved) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // M9 R6/R7: refetch the badge counters when the page changes, and when a
  // page announces the counters moved without navigating (a thread marked read,
  // a proposal answered) — so the pill never lags behind the visitor.
  useEffect(() => {
    if (!isAuthenticated) {
      setEnquiryBadge({ unread: 0, proposals: 0 });
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void api
        .getMyEnquirySummary()
        .then((result) => {
          if (!cancelled) {
            setEnquiryBadge({
              unread: result.summary.unread,
              proposals: result.summary.liveProposals,
            });
          }
        })
        .catch(() => {
          /* badge only */
        });
    };
    refresh();
    window.addEventListener(ENQUIRY_BADGE_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ENQUIRY_BADGE_EVENT, refresh);
    };
  }, [isAuthenticated, location.pathname]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("travelai_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("travelai_theme", "light");
    }
  };

  // ⌘K / Ctrl+K opens the jump menu from anywhere the navbar is mounted.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // PA0: the personal navbar never links into the agency realm. Agency is a
  // separate front door (`/agency/login?workspace=<slug>`); a personal session
  // cannot open it and the same email may hold both accounts.
  //
  // Milestone 8 G3: Explore is a content gate, not a feature flag. It appears
  // only once the gallery holds at least 5 published trips, so the link is never
  // offered to an empty room. Direct `/explore` links keep working regardless.
  const galleryEnabled = useGalleryEnabled();
  // Milestone 10 E1: Explore also carries upcoming agency events, so a live
  // event is enough to offer the link even while the gallery is still thin.
  const eventsEnabled = useEventsEnabled();
  const exploreEnabled = galleryEnabled === true || eventsEnabled === true;
  // Milestone 9 D3: the same content gate for agencies — five published
  // profiles before the link is offered, while `/agencies` stays reachable.
  const directoryEnabled = useAgencyDirectoryEnabled();
  const onHome = location.pathname === "/";
  // Discovery leads: trips to join, events and agencies before the planner.
  const navItems = [
    ...(exploreEnabled ? [{ label: "Explore", path: "/explore" }] : []),
    ...(directoryEnabled === true ? [{ label: "Agencies", path: "/agencies" }] : []),
    ...(isAuthenticated ? [{ label: "My trips", path: "/dashboard" }] : []),
    // M9: replies live in conversations, so the list of sent enquiries needs a
    // door of its own — signed-in only, because anonymous enquiries are never
    // attributed to an account.
    ...(isAuthenticated ? [{ label: "Enquiries", path: "/enquiries" }] : []),
  ];
  const howItWorks = { label: "How it works", path: "/#how-it-works" };
  const desktopLinks = [...navItems, ...(onHome ? [howItWorks] : [])];

  const commandSections = [
    {
      label: "Go to",
      items: [
        { label: "Home", to: "/", icon: Home },
        ...navItems.map((item) => ({
          label: item.label,
          to: item.path,
          icon: commandIconFor(item.path),
        })),
      ],
    },
    ...(isAuthenticated
      ? [
          {
            label: "Your account",
            items: [
              { label: "Proposals", to: "/proposals", icon: FileText },
              { label: "Profile", to: "/profile", icon: UserCircle2 },
            ],
          },
        ]
      : []),
  ];

  const linkClass = (path: string) => {
    const isActive =
      path !== "/" && !path.includes("#") && location.pathname.startsWith(path);
    return cn(
      "relative flex min-h-[44px] items-center gap-1 text-sm font-semibold transition-colors",
      isActive
        ? "text-foreground after:absolute after:inset-x-0 after:-bottom-[10px] after:h-0.5 after:rounded-full after:bg-primary"
        : "text-foreground/70 hover:text-foreground"
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/70 bg-card/85 shadow-xs backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Wordmark */}
          <Link
            to="/"
            className="flex shrink-0 items-center rounded-md select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="waytowalk home"
          >
            <img
              src={isDark ? "/brand/waytowalk-logo-reverse.svg" : "/brand/waytowalk-logo-name.svg"}
              alt=""
              width="148"
              height="30"
              className="h-[30px] w-[148px]"
            />
          </Link>

          {/* Plain links with an active underline */}
          <div className="hidden items-center gap-7 md:flex">
            {desktopLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  linkClass(item.path),
                  item.path === howItWorks.path && "hidden lg:flex"
                )}
              >
                {item.label}
                {item.path === "/enquiries" ? (
                  <EnquiryBadge
                    unread={enquiryBadge.unread}
                    proposals={enquiryBadge.proposals}
                  />
                ) : null}
              </Link>
            ))}
          </div>

          {/* Right Action Controls */}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCommandOpen(true)}
              className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
              title="Search pages and actions (Control or Command K)"
              aria-label="Search pages and actions (Control or Command K)"
            >
              <Search className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-foreground/70" />
              )}
            </Button>

            {/* Desktop Auth Controls */}
            <div className="hidden items-center gap-1 md:flex">
              {isAuthenticated ? (
                <>
                  {user?.handle && (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
                      title="Your travel page"
                    >
                      <Link
                        to={`/travelers/${encodeURIComponent(user.handle)}`}
                        aria-label="Your travel page"
                      >
                        <Globe2 className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  <Link
                    to="/profile"
                    className="flex min-h-[40px] items-center gap-2 rounded-full px-1.5 py-1 text-xs font-semibold text-foreground/90 transition-colors hover:bg-muted"
                    title="Your profile"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      {avatarSrc(user?.avatarUrl) && (
                        <AvatarImage src={avatarSrc(user?.avatarUrl)} alt={displayName} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                        {initialsFor(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[140px] truncate lg:inline">
                      {displayName}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    className="h-10 w-10 rounded-xl text-muted-foreground hover:text-destructive"
                    title="Log out"
                    aria-label="Log out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    to="/auth"
                    className="inline-flex min-h-[40px] items-center px-3 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  <Button
                    asChild
                    className="ml-1 h-10 rounded-full px-5 text-xs font-bold shadow-sm"
                  >
                    <Link to="/plan">
                      Plan a trip
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile sheet */}
            <div className="md:hidden">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    aria-label="Open mobile navigation menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] space-y-6 p-6">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Explore waytowalk, plan a trip, or open your account.
                  </SheetDescription>
                  <div className="pt-2">
                    <img
                      src={isDark ? "/brand/waytowalk-logo-reverse.svg" : "/brand/waytowalk-logo-name.svg"}
                      alt="waytowalk"
                      width="148"
                      height="30"
                      className="h-[30px] w-[148px]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setCommandOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-muted/50 px-3 py-3 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Search className="h-4 w-4" />
                    Search or jump to…
                    <kbd className="ml-auto rounded border border-border bg-card px-1.5 py-0.5 font-sans text-[10px] font-medium">
                      ⌘K
                    </kbd>
                  </button>

                  <div className="flex flex-col gap-1 pt-1">
                    {desktopLinks.map((item) => {
                      const isActive =
                        !item.path.includes("#") &&
                        location.pathname.startsWith(item.path);

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "flex min-h-[44px] items-center rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-foreground hover:bg-muted"
                          )}
                        >
                          {item.label}
                          {item.path === "/enquiries" ? (
                            <EnquiryBadge
                              unread={enquiryBadge.unread}
                              proposals={enquiryBadge.proposals}
                            />
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>

                  <div className="h-px bg-border/60" />

                  {isAuthenticated ? (
                    <div className="space-y-3">
                      <Link
                        to="/profile"
                        onClick={() => setIsOpen(false)}
                        className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted/50 p-3 transition-colors hover:bg-muted"
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          {avatarSrc(user?.avatarUrl) && (
                            <AvatarImage src={avatarSrc(user?.avatarUrl)} alt={displayName} />
                          )}
                          <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                            {initialsFor(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-foreground">
                            {displayName}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {user?.email}
                          </div>
                        </div>
                        <UserCircle2 className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                      <Link to="/plan" onClick={() => setIsOpen(false)}>
                        <Button className="h-11 w-full rounded-2xl text-xs font-bold">
                          Plan a trip
                        </Button>
                      </Link>
                      {user?.handle && (
                        <Link
                          to={`/travelers/${encodeURIComponent(user.handle)}`}
                          onClick={() => setIsOpen(false)}
                        >
                          <Button
                            variant="outline"
                            className="h-11 w-full rounded-2xl text-xs font-bold gap-2"
                          >
                            <Globe2 className="h-4 w-4" />
                            Your travel page
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          logout();
                          setIsOpen(false);
                        }}
                        className="h-11 w-full rounded-2xl text-xs font-bold text-destructive hover:bg-destructive/10"
                      >
                        Log out
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <Link to="/auth" onClick={() => setIsOpen(false)}>
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-2xl text-xs font-bold"
                        >
                          Sign in
                        </Button>
                      </Link>
                      <Link to="/plan" onClick={() => setIsOpen(false)}>
                        <Button className="h-11 w-full rounded-2xl text-xs font-bold shadow-sm">
                          Plan a trip
                        </Button>
                      </Link>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      <TravellerCommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        sections={commandSections}
        isAuthenticated={isAuthenticated}
        isDark={isDark}
        travelHandle={user?.handle}
        onToggleTheme={toggleTheme}
        onSignOut={logout}
      />
    </nav>
  );
};

export default Navbar;
