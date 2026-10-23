import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAgency } from '@/context/AgencyContext';
import TripPlanner from '@/pages/TripPlanner';

/**
 * Agency wizard mode. The personal wizard stays mounted unchanged at `/plan`;
 * this wrapper only injects the tenant id and runs inside the agency shell.
 */
const AgencyTripPlanner: React.FC = () => {
  const { activeAgency, activeAgencyId, loading } = useAgency();

  if (loading && !activeAgency) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agency workspace...
      </div>
    );
  }
  if (!activeAgencyId || !activeAgency) {
    return <Navigate to="/agency" replace />;
  }

  return (
    <TripPlanner
      agencyId={activeAgencyId}
      agencyName={activeAgency.name}
      embedded
    />
  );
};

export default AgencyTripPlanner;
