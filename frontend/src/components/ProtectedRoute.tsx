import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/UserContext';
import WaytowalkLoader from '@/components/brand/WaytowalkLoader';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <WaytowalkLoader size="md" caption="Checking your session…" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
