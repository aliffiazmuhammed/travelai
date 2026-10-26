import React from 'react';
import AdminPasswordChange from './AdminPasswordChange';

/**
 * `/admin/account` (PA1): the platform account's own security settings. The
 * same component handles the forced first-login flow; this route exposes it
 * afterwards so an admin is never stranded without a way to rotate their
 * platform password.
 */
const AdminAccount: React.FC = () => (
  <div className="max-w-xl space-y-6">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-slate-400">
        Security settings for your platform account only.
      </p>
    </div>
    <AdminPasswordChange />
  </div>
);

export default AdminAccount;
