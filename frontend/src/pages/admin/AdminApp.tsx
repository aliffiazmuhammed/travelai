import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, ShieldOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { usePlatformEnabled } from '@/hooks/usePlatformEnabled';
import AdminLayout from './AdminLayout';
import AdminPasswordChange from './AdminPasswordChange';

/**
 * `/admin/*` gate (PA1).
 *
 * The backend flag is authoritative. When it is off the shell never mounts and
 * no admin API is called. Access requires a `platform_token` session: a personal
 * or agency session alone is never enough. A bootstrapped super-admin with a
 * temporary password must set a new one before the console opens.
 *
 * Every state here is scoped to the console's dark theme so the gate never
 * flashes the light product underneath.
 */
const AdminApp: React.FC = () => {
  const enabled = usePlatformEnabled();
  const { isAuthenticated, loading, mustChangePassword } = usePlatformAuth();

  if (enabled === null || loading) {
    return (
      <div className="dark grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking platform access…
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="dark grid min-h-screen place-items-center bg-background px-4">
        <Card className="w-full max-w-md rounded-2xl border-border bg-card">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ShieldOff className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                Platform admin is not enabled
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                The internal operations console is switched off. Nothing else on
                TravelAI is affected.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  if (mustChangePassword) {
    return <AdminPasswordChange forced />;
  }

  return <AdminLayout />;
};

export default AdminApp;
