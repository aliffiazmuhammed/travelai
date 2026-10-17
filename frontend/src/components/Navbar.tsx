import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Plane, Sun, Moon, Sparkles, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/UserContext";
import { cn } from "@/lib/utils";

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

  const navItems = [
    { label: "Home", path: "/" },
    { label: "Plan Trip", path: "/plan" },
    { label: "My Trips", path: "/dashboard" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/85 backdrop-blur-xl border-b border-border/70 shadow-xs">
      <div className="container mx-auto px-4 py-3.5">
        <div className="flex items-center justify-between">
          {/* Logo & Brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group select-none min-h-[44px]"
            aria-label="TravelAI Home"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-primary text-white flex items-center justify-center shadow-md shadow-sky-500/25 group-hover:scale-105 transition-all">
              <Plane className="h-5 w-5 fill-white/20 stroke-[2.2]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                TravelAI
              </span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
                AI 2.5
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/70">
            {navItems.map((item) => {
              const isActive =
                item.path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all min-h-[36px] flex items-center",
                    isActive
                      ? "bg-card text-primary shadow-xs border border-border/40"
                      : "text-foreground/75 hover:text-foreground hover:bg-card/60"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-500" />
              )}
            </Button>

            {/* Desktop Auth Controls */}
            <div className="hidden md:flex items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-2 pl-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/60 border border-border/60 text-xs font-semibold text-foreground/90 max-w-[180px] truncate">
                    <User className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{user?.email}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="rounded-xl text-xs font-semibold h-10 px-3 text-muted-foreground hover:text-destructive gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/auth">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-xs font-bold h-10 px-4"
                    >
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button
                      variant="hero"
                      size="sm"
                      className="rounded-xl text-xs font-bold h-10 px-4 shadow-sm"
                    >
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Sheet Drawer Menu */}
            <div className="md:hidden">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl h-10 w-10"
                    aria-label="Open mobile navigation menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] p-6 space-y-6">
                  <div className="flex items-center gap-2.5 pt-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-primary text-white flex items-center justify-center shadow-md shadow-sky-500/25">
                      <Plane className="h-5 w-5" />
                    </div>
                    <span className="text-lg font-black text-foreground">
                      TravelAI
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    {navItems.map((item) => {
                      const isActive =
                        item.path === "/"
                          ? location.pathname === "/"
                          : location.pathname.startsWith(item.path);

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-sm font-bold min-h-[44px] flex items-center transition-all",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-foreground hover:bg-muted"
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>

                  <div className="h-px bg-border/60" />

                  {isAuthenticated ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-2xl bg-muted/50 text-xs font-semibold text-muted-foreground truncate">
                        {user?.email}
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          logout();
                          setIsOpen(false);
                        }}
                        className="w-full rounded-2xl h-11 text-xs font-bold text-destructive hover:bg-destructive/10"
                      >
                        Logout
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <Link to="/auth" onClick={() => setIsOpen(false)}>
                        <Button
                          variant="outline"
                          className="w-full rounded-2xl h-11 text-xs font-bold"
                        >
                          Sign In
                        </Button>
                      </Link>
                      <Link to="/auth" onClick={() => setIsOpen(false)}>
                        <Button
                          variant="hero"
                          className="w-full rounded-2xl h-11 text-xs font-bold shadow-sm"
                        >
                          Get Started Free
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
    </nav>
  );
};

export default Navbar;
