import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/UserContext";
import { AgencyAuthProvider } from "./context/AgencyAuthContext";
import { PlatformAuthProvider } from "./context/PlatformAuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { queryClient } from "./lib/queryClient";

// Lazy-loaded route pages for production code-splitting
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const TripPlanner = lazy(() => import("./pages/TripPlanner"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SharedTrip = lazy(() => import("./pages/SharedTrip"));
const TravelerProfile = lazy(() => import("./pages/TravelerProfile"));
const Guidelines = lazy(() => import("./pages/Guidelines"));
const Explore = lazy(() => import("./pages/Explore"));
const GalleryTrip = lazy(() => import("./pages/GalleryTrip"));
const Agencies = lazy(() => import("./pages/Agencies"));
const AgencyProfile = lazy(() => import("./pages/AgencyProfile"));
const ProposalShare = lazy(() => import("./pages/ProposalShare"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const Profile = lazy(() => import("./pages/Profile"));
const AgencyApp = lazy(() => import("./pages/agency/AgencyApp"));
const AgencyLogin = lazy(() => import("./pages/agency/AgencyLogin"));
const AgencyOverview = lazy(() => import("./pages/agency/AgencyOverview"));
const AgencyOnboarding = lazy(() => import("./pages/agency/AgencyOnboarding"));
const AgencyTeam = lazy(() => import("./pages/agency/AgencyTeam"));
const AgencySettings = lazy(() => import("./pages/agency/AgencySettings"));
const AgencyClients = lazy(() => import("./pages/agency/AgencyClients"));
const AgencyEnquiries = lazy(() => import("./pages/agency/AgencyEnquiries"));
const AgencyTemplates = lazy(() => import("./pages/agency/AgencyTemplates"));
const AgencyTrips = lazy(() => import("./pages/agency/AgencyTrips"));
const AgencyTripPlanner = lazy(() => import("./pages/agency/AgencyTripPlanner"));
const AgencyOperations = lazy(() => import("./pages/agency/AgencyOperations"));
const AgencyInviteAccept = lazy(() => import("./pages/agency/AgencyInviteAccept"));
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminAccount = lazy(() => import("./pages/admin/AdminAccount"));
const AdminAccounts = lazy(() => import("./pages/admin/AdminAccounts"));
const AdminAgencies = lazy(() => import("./pages/admin/AdminAgencies"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminPlatformAdmins = lazy(() => import("./pages/admin/AdminPlatformAdmins"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="w-9 h-9 border-3 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
      <p className="text-sm font-medium text-muted-foreground animate-pulse">
        Opening TravelAI…
      </p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/plan"
                  element={
                    <ProtectedRoute>
                      <TripPlanner />
                    </ProtectedRoute>
                  }
                />
                <Route path="/shared/:shareId" element={<SharedTrip />} />
                {/* Milestone 8 G2: public traveler identity — no session needed. */}
                <Route path="/travelers/:handle" element={<TravelerProfile />} />
                <Route path="/guidelines" element={<Guidelines />} />
                {/* Milestone 8 G3: anonymous gallery. The nav entry waits for a
                    content threshold; these routes stay reachable by URL. */}
                <Route path="/explore" element={<Explore />} />
                <Route path="/explore/:tripId" element={<GalleryTrip />} />
                {/* Milestone 9 D3: anonymous agency directory. The nav entry
                    waits for five published profiles; these routes do not. */}
                <Route path="/agencies" element={<Agencies />} />
                <Route path="/agencies/:slug" element={<AgencyProfile />} />
                <Route path="/proposal/:token" element={<ProposalShare />} />
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                {/* PA0: agency pages use the separate `agency_token` realm. A
                    personal session is never accepted as an agency session. */}
                <Route
                  path="/agency/login"
                  element={
                    <AgencyAuthProvider>
                      <AgencyLogin />
                    </AgencyAuthProvider>
                  }
                />
                <Route
                  path="/agency/invite/:token"
                  element={
                    <AgencyAuthProvider>
                      <AgencyInviteAccept />
                    </AgencyAuthProvider>
                  }
                />
                <Route
                  path="/agency"
                  element={
                    <AgencyAuthProvider>
                      <AgencyApp />
                    </AgencyAuthProvider>
                  }
                >
                  <Route index element={<AgencyOverview />} />
                  <Route path="onboarding" element={<AgencyOnboarding />} />
                  <Route path="trips" element={<AgencyTrips />} />
                  <Route path="trips/new" element={<AgencyTripPlanner />} />
                  <Route path="trips/:tripId" element={<AgencyTrips />} />
                  <Route path="clients" element={<AgencyClients />} />
                  <Route path="enquiries" element={<AgencyEnquiries />} />
                  <Route path="templates" element={<AgencyTemplates />} />
                  <Route path="team" element={<AgencyTeam />} />
                  <Route path="operations" element={<AgencyOperations />} />
                  <Route path="settings" element={<AgencySettings />} />
                </Route>
                {/* PA1: the platform realm is a third, fully separate front
                    door. `/admin` never accepts a personal or agency session. */}
                <Route
                  path="/admin/login"
                  element={
                    <PlatformAuthProvider>
                      <AdminLogin />
                    </PlatformAuthProvider>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <PlatformAuthProvider>
                      <AdminApp />
                    </PlatformAuthProvider>
                  }
                >
                  <Route index element={<AdminOverview />} />
                  <Route path="account" element={<AdminAccount />} />
                  <Route path="accounts" element={<AdminAccounts />} />
                  <Route
                    path="agencies"
                    element={<AdminAgencies />}
                  />
                  <Route path="reports" element={<AdminReports />} />
                  <Route
                    path="audit"
                    element={<AdminAudit />}
                  />
                  <Route path="platform-admins" element={<AdminPlatformAdmins />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
