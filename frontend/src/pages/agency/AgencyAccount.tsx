import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut, Save, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { toast } from 'sonner';
import AgencyPasswordChange from './AgencyPasswordChange';

/**
 * Agency account settings (PA0). Email is immutable and comes from the agency
 * identity; name edits and password changes call `/api/agency/auth/*` only.
 */
const AgencyAccount: React.FC = () => {
  const navigate = useNavigate();
  const { user, agency, updateProfile, logout } = useAgencyAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateProfile(name.trim());
      toast.success('Your agency profile has been updated.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not save your profile.'
      );
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/agency/login', { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agency account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This account opens {agency?.name ?? 'this workspace'} only. Your
          personal TravelAI account and password are separate.
        </p>
      </div>

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-teal-600" />
            Profile
          </CardTitle>
          <CardDescription>
            The name your teammates see inside the agency workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveName}>
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Input value={agency?.name ?? ''} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ''} readOnly disabled />
              <p className="text-xs text-slate-500">
                Agency email is fixed. Ask your TravelAI account manager if it
                needs to change.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency-account-name">Display name</Label>
              <Input
                id="agency-account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                placeholder="Your name"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save profile
              </Button>
              <Button type="button" variant="outline" onClick={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out of agency
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AgencyPasswordChange />
    </div>
  );
};

export default AgencyAccount;
