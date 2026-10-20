import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/UserContext";
import { avatarSrc, initialsFor } from "@/lib/avatar";

/**
 * Profile editing (Milestone 7, F14).
 *
 * Three independent forms on one page: the photo, the display name, and the
 * password. Each saves on its own so a failed upload cannot block a name change
 * (and vice versa), and every success swaps the shared auth user, so the navbar
 * chip and the chat composer update without a reload.
 */

/** Mirrors the server cap (`AVATAR_MAX_MB`, 2 MB default) for instant feedback. */
const AVATAR_MAX_MB = 2;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const Profile = () => {
  const {
    user,
    loading,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    changePassword,
  } = useAuth();

  // Photo
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Name
  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Keep the field in sync with the session (including after a save).
  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  // Release the local preview object URL when it changes/unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const label = user.name?.trim() || user.label || user.email.split("@")[0] || "Traveler";
  const photo = previewUrl ?? avatarSrc(user.avatarUrl);
  const savedName = user.name ?? "";
  const nameChanged = name.trim() !== savedName.trim();

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failure.
    event.target.value = "";
    if (!file) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error("Choose a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
      toast.error(`Photos must be smaller than ${AVATAR_MAX_MB} MB.`);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setPhotoBusy(true);
    try {
      await uploadAvatar(file);
      toast.success("Profile photo updated.");
    } catch (error: any) {
      toast.error(error?.message || "We could not save that photo. Please try again.");
    } finally {
      setPhotoBusy(false);
      // The effect above revokes the object URL; the stored URL (or initials)
      // takes over as soon as the preview is dropped.
      setPreviewUrl(null);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await removeAvatar();
      setPreviewUrl(null);
      toast.success("Profile photo removed.");
    } catch (error: any) {
      toast.error(error?.message || "We could not remove that photo. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSaveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setNameError(null);
    if (name.trim().length > 40) {
      setNameError("Names must be 40 characters or fewer.");
      return;
    }
    setNameBusy(true);
    try {
      await updateProfile(name.trim());
      toast.success(name.trim() ? "Name saved." : "Name cleared — your email name is shown again.");
    } catch (error: any) {
      setNameError(error?.message || "We could not save your name. Please try again.");
    } finally {
      setNameBusy(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError("Your new password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The two new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("Your new password must be different from the current one.");
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated.");
    } catch (error: any) {
      setPasswordError(error?.message || "We could not update your password. Please try again.");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 pt-24 pb-16 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Your profile
          </h1>
          <p className="text-sm text-muted-foreground">
            This is how you appear to everyone on your trips.
          </p>
        </div>

        {/* Photo + name ------------------------------------------------------ */}
        <Card className="rounded-3xl border-border/70">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCircle2 className="h-4 w-4 text-primary" />
              Photo and name
            </CardTitle>
            <CardDescription>
              Shown in trip chat, polls, the member list and the live roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Avatar className="h-20 w-20 ring-2 ring-primary/20">
                {photo && <AvatarImage src={photo} alt={label} />}
                <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                  {initialsFor(label)}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePickPhoto}
                    disabled={photoBusy}
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    {photoBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {user.avatarUrl ? "Change photo" : "Add photo"}
                  </Button>
                  {user.avatarUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      disabled={photoBusy}
                      className="rounded-xl text-xs font-bold gap-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  JPEG, PNG or WebP, up to {AVATAR_MAX_MB} MB. Without a photo your initials
                  are shown.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_TYPES.join(",")}
                  onChange={handlePhotoSelected}
                  className="hidden"
                  aria-label="Upload a profile photo"
                />
              </div>
            </div>

            <Separator />

            <form onSubmit={handleSaveName} className="space-y-2">
              <Label htmlFor="display-name" className="text-xs font-bold">
                Display name
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="display-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={40}
                  placeholder={label}
                  autoComplete="name"
                  className="rounded-xl"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={nameBusy || !nameChanged}
                  className="rounded-xl text-xs font-bold h-10 px-4"
                >
                  {nameBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
              {nameError ? (
                <p className="text-[11px] font-semibold text-destructive">{nameError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Up to 40 characters. Leave it empty to go back to your email name
                  ({user.email.split("@")[0]}).
                </p>
              )}
            </form>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Email</Label>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate">{user.email}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your email is how you sign in. Changing it needs a verification step that is
                not available yet.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Password ---------------------------------------------------------- */}
        <Card className="rounded-3xl border-border/70">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Password
            </CardTitle>
            <CardDescription>
              Enter your current password, then choose a new one (at least 6 characters).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password" className="text-xs font-bold">
                  Current password
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-xs font-bold">
                    New password
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className="rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-xs font-bold">
                    Confirm new password
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className="rounded-xl"
                    required
                  />
                </div>
              </div>

              {passwordError && (
                <p className="text-[11px] font-semibold text-destructive">{passwordError}</p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={passwordBusy}
                  className="rounded-xl text-xs font-bold h-10 px-4"
                >
                  {passwordBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Update password
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  You stay signed in here. Other devices that are already signed in keep
                  working until their session expires.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
