import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";

// ... existing imports

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const NavLinks = ({ mobile = false }) => (
    <>
      <Link
        to="/"
        className={`text-sm font-medium text-foreground/80 hover:text-foreground transition-smooth ${mobile ? 'text-lg py-2' : ''}`}
        onClick={() => mobile && setIsOpen(false)}
      >
        Home
      </Link>
      <Link
        to="/plan"
        className={`text-sm font-medium text-foreground/80 hover:text-foreground transition-smooth ${mobile ? 'text-lg py-2' : ''}`}
        onClick={() => mobile && setIsOpen(false)}
      >
        Plan Trip
      </Link>
      <Link
        to="/dashboard"
        className={`text-sm font-medium text-foreground/80 hover:text-foreground transition-smooth ${mobile ? 'text-lg py-2' : ''}`}
        onClick={() => mobile && setIsOpen(false)}
      >
        My Trips
      </Link>
    </>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border shadow-soft">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-gradient-sky p-2 rounded-lg shadow-soft group-hover:shadow-card transition-smooth">
              <Plane className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              TravelAI
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavLinks />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-sm font-medium">{user?.email}</span>
                  <Button variant="ghost" size="sm" onClick={logout}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/auth">
                    <Button variant="ghost" size="sm">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button variant="hero" size="sm">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <div className="flex flex-col gap-4 mt-8">
                    <NavLinks mobile />
                    <div className="h-px bg-border my-2" />
                    {isAuthenticated ? (
                      <div className="flex flex-col gap-4">
                        <span className="text-sm font-medium text-muted-foreground">{user?.email}</span>
                        <Button onClick={() => { logout(); setIsOpen(false); }}>
                          Logout
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <Link to="/auth" onClick={() => setIsOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start">Sign In</Button>
                        </Link>
                        <Link to="/auth" onClick={() => setIsOpen(false)}>
                          <Button variant="hero" className="w-full">Get Started</Button>
                        </Link>
                      </div>
                    )}
                  </div>
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
