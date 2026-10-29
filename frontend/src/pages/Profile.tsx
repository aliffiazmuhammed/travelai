import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Ban,
  ArrowUpRight,
  Camera,
  ExternalLink,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
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
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/UserContext";
import { api } from "@/services/api";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import {
  TRAVELLER_ENQUIRY_STATUS_LABELS,
  travellerEnquiryStatusBadgeClass,
  formatAgencyDate,
} from "@/lib/agency";
import { cn } from "@/lib/utils";
import type { AgencyEnquiry } from "@/types/agency";
import type { BlockedAccount } from "@/types/gallery";

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

function handleAvailabilityMessage(result: {
  available: boolean;
  reason?: "invalid" | "reserved" | "taken";
}): string {
  if (result.available) return "That handle is available.";
  if (result.reason === "taken") return "That handle is already taken.";
  if (result.reason === "reserved") return "That word is reserved. Please choose another.";
  return "Use 3–24 lowercase letters, numbers or underscores.";
}

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

  // Public traveler identity (Milestone 8 G2)
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availability, setAvailability] = useState<{
    handle: string;
    available: boolean;
    reason?: "invalid" | "reserved" | "taken";
  } | null>(null);

  // Block list (Milestone 8 G5) — who cannot request to join my trips.
  const [blocks, setBlocks] = useState<BlockedAccount[]>([]);
  const [blocksBusy, setBlocksBusy] = useState<string | null>(null);

  // Sent enquiries (Milestone 9). Anonymous submissions cannot be listed, so
  // this card only ever shows rows the signed-in session was attributed to. It
  // is a preview; the full list lives at `/enquiries`.
  const [myEnquiries, setMyEnquiries] = useState<AgencyEnquiry[]>([]);
  const [myEnquiriesTotal, setMyEnquiriesTotal] = useState(0);

  // Keep the field in sync with the session (including after a save).
  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  useEffect(() => {
    setHandle(user?.handle ?? "");
    setBio(user?.bio ?? "");
  }, [user?.handle, user?.bio]);

  // G5: load the personal block list once the session is known. Non-fatal on
  // failure — the card simply stays hidden.
  useEffect(() => {
    if (!user?._id) return;

    let cancelled = false;
    api
      .getBlocks()
      .then((result) => {
        if (!cancelled) setBlocks(result.blocks || []);
      })
      .catch(() => {
        if (!cancelled) setBlocks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  // M9: sent enquiries, three most recent. Non-fatal on failure — the card stays
  // hidden rather than turning the profile page into an error.
  useEffect(() => {
    if (!user?._id) return;

    let cancelled = false;
    api
      .getMyEnquiries({ limit: 3 })
      .then((page) => {
        if (cancelled) return;
        setMyEnquiries(page.enquiries || []);
        setMyEnquiriesTotal(page.total ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setMyEnquiries([]);
        setMyEnquiriesTotal(0);
      });

    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  const handleUnblock = async (block: BlockedAccount) => {    setBlocksBusy(block.userId);
    try {
      await api.unblockUser(block.userId);
      setBlocks((previous) =>
        previous.filter((row) => row.userId !== block.userId)
      );
      toast.success(`${block.label} can request to join your trips again.`);
    } catch (err: any) {
      toast.error(err?.message || "That account could not be unblocked.");
    } finally {
      setBlocksBusy(null);
    }
  };

  // Release the local preview object URL when it changes/unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const normalizedHandle = handle.trim().replace(/^@+/, "").toLowerCase();
  const savedHandle = (user?.handle ?? "").toLowerCase();
  const handleChanged = normalizedHandle !== savedHandle;
  const bioChanged = bio.trim() !== (user?.bio ?? "").trim();
  const identityChanged = handleChanged || bioChanged;

  // The same normalization the server applies; only a changed handle is checked.
  useEffect(() => {
    if (!normalizedHandle || normalizedHandle === savedHandle) {
      setAvailability(null);
      setAvailabilityBusy(false);
      return;
    }
    let cancelled = false;
    setAvailabilityBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.checkHandleAvailability(normalizedHandle);
        if (!cancelled) setAvailability(result);
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setAvailabilityBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedHandle, savedHandle]);

  const availabilityMessage = !normalizedHandle || !handleChanged
    ? null
    : availabilityBusy
      ? "Checking availability…"
      : availability
        ? handleAvailabilityMessage(availability)
        : null;
  const handleAvailable =
    !availabilityBusy && Boolean(availability?.available) && handleChanged;

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
      await updateProfile({ name: name.trim() });
      toast.success(name.trim() ? "Name saved." : "Name cleared — your email name is shown again.");
    } catch (error: any) {
      setNameError(error?.message || "We could not save your name. Please try again.");
    } finally {
      setNameBusy(false);
    }
  };

  const handleSaveIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    setIdentityError(null);

    if (normalizedHandle) {
      if (normalizedHandle.length < 3 || normalizedHandle.length > 24) {
        setIdentityError("Handles must be 3–24 characters.");
        return;
      }
      if (!/^[a-z0-9_]+$/.test(normalizedHandle)) {
        setIdentityError(
          "Handles can use lowercase letters, numbers and underscores only."
        );
        return;
      }
      if (
        availability &&
        !availability.available &&
        availability.handle === normalizedHandle
      ) {
        setIdentityError(handleAvailabilityMessage(availability));
        return;
      }
    }
    if (bio.trim().length > 280) {
      setIdentityError("Bios must be 280 characters or fewer.");
      return;
    }

    setIdentityBusy(true);
    try {
      await updateProfile({ handle: normalizedHandle, bio: bio.trim() });
      toast.success(
        normalizedHandle ? "Traveler profile saved." : "Public handle removed."
      );
    } catch (error: any) {
      setIdentityError(
        error?.message || "We could not save your traveler profile. Please try again."
      );
    } finally {
      setIdentityBusy(false);
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

        {/* Public traveler profile ------------------------------------------- */}
        <Card className="rounded-3xl border-border/70">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              Public traveler profile
            </CardTitle>
            <CardDescription>
              Your handle and bio appear on every trip you publish to the gallery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveIdentity} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="traveler-handle" className="text-xs font-bold">
                  Handle
                </Label>
                <div className="flex items-center rounded-xl border border-border/60 bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                  <span className="pl-3 text-sm font-semibold text-muted-foreground">@</span>
                  <Input
                    id="traveler-handle"
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    maxLength={25}
                    placeholder="ada_travels"
                    autoComplete="username"
                    className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                {availabilityMessage ? (
                  <p
                    className={`text-[11px] font-semibold ${
                      availabilityBusy
                        ? "text-muted-foreground"
                        : handleAvailable
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                    }`}
                  >
                    {availabilityMessage}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    3–24 lowercase letters, numbers or underscores. This becomes the
                    address of your public page.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="traveler-bio" className="text-xs font-bold">
                  Bio
                </Label>
                <Textarea
                  id="traveler-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="A sentence about how you travel."
                  className="rounded-xl resize-none"
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {bio.length}/280
                </p>
              </div>

              {identityError && (
                <p className="text-[11px] font-semibold text-destructive">{identityError}</p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={identityBusy || !identityChanged}
                  className="rounded-xl text-xs font-bold h-10 px-4"
                >
                  {identityBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save traveler profile
                </Button>
                {user.handle && (
                  <Link
                    to={`/travelers/${user.handle}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    View public profile
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                {user.handle
                  ? "Your public page lists only published, upcoming trips. Unpublish them before removing the handle."
                  : "You need a handle before publishing a trip. Leaving it empty removes it."}
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Blocked travellers (Milestone 8 G5) ------------------------------- */}
        {blocks.length > 0 && (
          <Card className="rounded-3xl border-border/70">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ban className="h-4 w-4 text-primary" />
                Blocked travellers
              </CardTitle>
              <CardDescription>
                These accounts cannot send you join requests on any of your
                published trips. They are never told about the block.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {blocks.map((block) => (
                  <div
                    key={block.userId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        {avatarSrc(block.avatarUrl) && (
                          <AvatarImage src={avatarSrc(block.avatarUrl)} alt={block.label} />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {block.label.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">
                          {block.label}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {block.handle ? `@${block.handle}` : "Blocked account"}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={blocksBusy === block.userId}
                      onClick={() => void handleUnblock(block)}
                      className="h-8 shrink-0 rounded-xl text-[11px] font-bold gap-1 px-2.5"
                    >
                      {blocksBusy === block.userId && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sent enquiries (Milestone 9 D5) ---------------------------------- */}
        {myEnquiries.length > 0 && (
          <Card className="rounded-3xl border-border/70">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-primary" />
                Enquiries you've sent
              </CardTitle>
              <CardDescription>
                Each enquiry went only to the agency you chose. Replies and
                proposals arrive in the conversation, so open a thread to read
                them and answer back.
              </CardDescription>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-2 w-fit rounded-xl text-[11px] font-bold gap-1.5"
              >
                <Link to="/proposals">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Compare your proposals
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {myEnquiries.slice(0, 3).map((enquiry) => (
                  <div
                    key={enquiry.id}
                    className="space-y-1.5 rounded-2xl border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {enquiry.agency ? (
                          <Link
                            to={`/agencies/${encodeURIComponent(enquiry.agency.slug)}`}
                            className="truncate text-sm font-bold text-foreground hover:text-primary hover:underline"
                          >
                            {enquiry.agency.name}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold text-foreground">
                            An agency
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            travellerEnquiryStatusBadgeClass(enquiry.status)
                          )}
                        >
                          {TRAVELLER_ENQUIRY_STATUS_LABELS[enquiry.status]}
                        </span>
                        {enquiry.unread.traveller > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {enquiry.unread.traveller}{" "}
                            {enquiry.unread.traveller === 1
                              ? "new reply"
                              : "new replies"}
                          </span>
                        )}
                      </div>
                      {enquiry.createdAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatAgencyDate(enquiry.createdAt)}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      {enquiry.package ? `${enquiry.package.title} · ` : ""}
                      {enquiry.dates.flexible && !enquiry.dates.start
                        ? "Flexible dates"
                        : enquiry.dates.start
                          ? `From ${formatAgencyDate(enquiry.dates.start)}`
                          : "No dates given"}
                    </p>

                    <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
                      {enquiry.message}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {enquiry.replyCount > 0
                          ? `${enquiry.replyCount} ${
                              enquiry.replyCount === 1 ? "reply" : "replies"
                            } in this thread`
                          : "No reply yet"}
                        {(enquiry.proposals?.count ?? 0) > 0 && (
                          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {enquiry.proposals?.count}{" "}
                            {enquiry.proposals?.count === 1
                              ? "proposal"
                              : "proposals"}
                          </span>
                        )}
                      </span>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg text-[10px] font-bold gap-1 px-2"
                      >
                        <Link to={`/enquiry/${enquiry.id}`}>
                          <MessageSquare className="h-3 w-3" />
                          Open conversation
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="rounded-xl text-[11px] font-bold gap-1"
              >
                <Link to="/enquiries">
                  View all {myEnquiriesTotal}{" "}
                  {myEnquiriesTotal === 1 ? "enquiry" : "enquiries"}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

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
