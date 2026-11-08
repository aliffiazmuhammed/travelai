import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpRight,
  AtSign,
  Ban,
  CalendarDays,
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Inbox,
  Loader2,
  MessageSquare,
  Newspaper,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { useAuth } from "@/context/UserContext";
import { api } from "@/services/api";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import {
  travellerEnquiryStatusLabel,
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

const PROFILE_TABS = [
  { value: "account", label: "Account", icon: UserRound },
  { value: "public", label: "Public page", icon: Newspaper },
  { value: "activity", label: "Activity", icon: Inbox },
] as const;

function handleAvailabilityMessage(result: {
  available: boolean;
  reason?: "invalid" | "reserved" | "taken";
}): string {
  if (result.available) return "That handle is available.";
  if (result.reason === "taken") return "That handle is already taken.";
  if (result.reason === "reserved") return "That word is reserved. Please choose another.";
  return "Use 3–24 lowercase letters, numbers or underscores.";
}

/** One password row: label on the left, masked field on the right, eye toggle. */
const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}> = ({ id, label, value, onChange, autoComplete, minLength }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground sm:text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          className="h-11 rounded-xl pr-11"
        />
        <button
          type="button"
          onClick={() => setRevealed((previous) => !previous)}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={revealed}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};

/**
 * The rail card that shows the public face of this account. It only ever reads
 * the session's own handle/bio, so it never claims a page that does not exist:
 * without a handle there is nothing to preview.
 */
const PublicPageCard: React.FC<{
  name: string;
  handle: string;
  bio: string;
  photo?: string | null;
  onEdit: () => void;
}> = ({ name, handle, bio, photo, onEdit }) => (
  <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Globe className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Your public page
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          How other travellers find you.
        </p>
      </div>
    </div>

    <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3">
      <Avatar className="h-11 w-11">
        {photo && <AvatarImage src={photo} alt={name} />}
        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
          {initialsFor(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {handle ? `@${handle}` : "No public handle yet"}
        </p>
      </div>
    </div>

    {bio ? (
      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/80">{bio}</p>
    ) : (
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        A line about how you travel helps people know who they are planning with.
      </p>
    )}

    <div className="mt-4 space-y-2">
      {handle ? (
        <Button
          asChild
          variant="outline"
          className="h-10 w-full gap-2 rounded-xl text-xs font-semibold"
        >
          <Link to={`/travelers/${encodeURIComponent(handle)}`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Preview page
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled
          className="h-10 w-full gap-2 rounded-xl text-xs font-semibold"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Preview page
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onEdit}
        className="h-10 w-full rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
      >
        {handle ? "Edit your public page" : "Set up your public page"}
      </Button>
    </div>
  </section>
);

/**
 * Only the numbers this page actually holds: the enquiry total it already
 * fetched, and the year the session was created. Anything else is left out
 * rather than guessed.
 */
const AtAGlanceCard: React.FC<{
  enquiriesSent: number | null;
  memberSince: string | null;
}> = ({ enquiriesSent, memberSince }) => (
  <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
    <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
      At a glance
    </h2>
    <ul className="mt-4 space-y-4">
      {enquiriesSent !== null ? (
        <li className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Inbox className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {enquiriesSent}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {enquiriesSent === 1 ? "Enquiry sent" : "Enquiries sent"}
            </p>
          </div>
        </li>
      ) : null}
      {memberSince ? (
        <li className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {memberSince}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Member since</p>
          </div>
        </li>
      ) : null}
    </ul>
    <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
      Published trips live on your public page.
    </p>
  </section>
);

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
  const [section, setSection] = useState<"account" | "public" | "activity">(
    "account"
  );

  // Sent enquiries (Milestone 9). Anonymous submissions cannot be listed, so
  // this card only ever shows rows the signed-in session was attributed to. It
  // is a preview; the full list lives at `/enquiries`.
  const [myEnquiries, setMyEnquiries] = useState<AgencyEnquiry[]>([]);
  const [myEnquiriesTotal, setMyEnquiriesTotal] = useState(0);
  // The rail only prints a count once a read succeeded — a failed request must
  // not turn into a confident "0".
  const [myEnquiriesLoaded, setMyEnquiriesLoaded] = useState(false);

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
    setMyEnquiriesLoaded(false);
    api
      .getMyEnquiries({ limit: 3 })
      .then((page) => {
        if (cancelled) return;
        setMyEnquiries(page.enquiries || []);
        setMyEnquiriesTotal(page.total ?? 0);
        setMyEnquiriesLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMyEnquiries([]);
        setMyEnquiriesTotal(0);
        setMyEnquiriesLoaded(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  const handleUnblock = async (block: BlockedAccount) => {
    setBlocksBusy(block.userId);
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

  // `/auth/me` carries the account's creation date even though the shared type
  // does not list it; the rail shows the year only when it really arrived.
  const createdAtRaw = (user as unknown as { createdAt?: string }).createdAt;
  const memberSince = (() => {
    if (!createdAtRaw) return null;
    const created = new Date(createdAtRaw);
    return Number.isNaN(created.getTime()) ? null : String(created.getFullYear());
  })();

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = PROFILE_TABS.findIndex((tab) => tab.value === section);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % PROFILE_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + PROFILE_TABS.length) % PROFILE_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PROFILE_TABS.length - 1;
    else return;
    event.preventDefault();
    setSection(PROFILE_TABS[next].value);
    document.getElementById(`profile-tab-${PROFILE_TABS[next].value}`)?.focus();
  };

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
      <main className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <header className="space-y-3">
          <TravellerBreadcrumbs items={[{ label: "Profile" }]} />
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Your profile
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              How you show up to the people you travel with.
            </p>
          </div>
        </header>

        {/* Pill tabs: each panel stays mounted, so a half-typed form survives a look at another tab. */}
        <div
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={handleTabKeyDown}
          className="mt-6 inline-flex w-full max-w-full items-center gap-1 rounded-full border border-border/70 bg-card p-1 shadow-xs sm:w-auto"
        >
          {PROFILE_TABS.map((tab) => {
            const active = tab.value === section;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                id={`profile-tab-${tab.value}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`profile-panel-${tab.value}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSection(tab.value)}
                className={cn(
                  "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 sm:flex-none sm:px-4 sm:text-sm",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Account ------------------------------------------------------------ */}
        <div
          role="tabpanel"
          id="profile-panel-account"
          aria-label="Account details"
          hidden={section !== "account"}
          className="mt-6"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-6">
              {/* Account details */}
              <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    Account details
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    The name and photo the people on your trips see.
                  </p>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-8">
                  <div className="flex flex-col items-center gap-3">
                    <Avatar className="h-28 w-28 ring-2 ring-primary/15 sm:h-32 sm:w-32">
                      {photo && <AvatarImage src={photo} alt={label} />}
                      <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                        {initialsFor(label)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex w-full flex-col items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePickPhoto}
                        disabled={photoBusy}
                        className="h-9 w-full gap-1.5 rounded-full px-3 text-xs font-semibold"
                      >
                        {photoBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
                        {user.avatarUrl ? "Change photo" : "Add photo"}
                      </Button>
                      {user.avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={photoBusy}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Remove photo
                        </button>
                      )}
                      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                        JPEG, PNG or WebP, up to {AVATAR_MAX_MB} MB. Without one, your initials
                        are shown.
                      </p>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={AVATAR_TYPES.join(",")}
                      onChange={handlePhotoSelected}
                      className="hidden"
                      aria-label="Upload a profile photo"
                    />
                  </div>

                  <div className="min-w-0 space-y-5">
                    <form onSubmit={handleSaveName} className="space-y-2">
                      <Label htmlFor="display-name" className="text-xs font-semibold">
                        Full name
                      </Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="display-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          maxLength={40}
                          placeholder={label}
                          autoComplete="name"
                          aria-describedby={
                            nameError ? "display-name-error" : "display-name-help"
                          }
                          className="h-11 rounded-xl"
                        />
                        <Button
                          type="submit"
                          disabled={nameBusy || !nameChanged}
                          className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold sm:w-auto"
                        >
                          {nameBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                          Save
                        </Button>
                      </div>
                      {nameError ? (
                        <p
                          id="display-name-error"
                          className="text-[11px] font-semibold text-destructive"
                          role="alert"
                        >
                          {nameError}
                        </p>
                      ) : (
                        <p
                          id="display-name-help"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          Up to 40 characters. Leave it empty to go back to your email name
                          ({user.email.split("@")[0]}).
                        </p>
                      )}
                    </form>

                    <div className="space-y-2">
                      <Label htmlFor="profile-email" className="text-xs font-semibold">
                        Email address
                      </Label>
                      <Input
                        id="profile-email"
                        type="email"
                        value={user.email}
                        readOnly
                        aria-describedby="profile-email-help"
                        className="h-11 cursor-default rounded-xl border-input bg-muted/40 text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <p
                        id="profile-email-help"
                        className="text-[11px] leading-relaxed text-muted-foreground"
                      >
                        Used for sign-in only. Changing it needs a verification step we haven't
                        built yet.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Password */}
              <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    Password
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Enter your current password, then choose a new one of at least 6 characters.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
                  <PasswordField
                    id="current-password"
                    label="Current password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                  />
                  <PasswordField
                    id="new-password"
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                    minLength={6}
                  />
                  <PasswordField
                    id="confirm-password"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    minLength={6}
                  />

                  {passwordError && (
                    <p className="text-[11px] font-semibold text-destructive" role="alert">
                      {passwordError}
                    </p>
                  )}

                  <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-relaxed text-muted-foreground sm:max-w-xs">
                      You stay signed in here. Other devices keep working until their session
                      expires.
                    </p>
                    <Button
                      type="submit"
                      disabled={passwordBusy}
                      className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold sm:w-auto"
                    >
                      {passwordBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Update password
                    </Button>
                  </div>
                </form>
              </section>
            </div>

            <aside className="min-w-0 space-y-6">
              <PublicPageCard
                name={label}
                handle={user.handle ?? ""}
                bio={user.bio ?? ""}
                photo={photo}
                onEdit={() => setSection("public")}
              />
              <AtAGlanceCard
                enquiriesSent={myEnquiriesLoaded ? myEnquiriesTotal : null}
                memberSince={memberSince}
              />
            </aside>
          </div>
        </div>

        {/* Public page -------------------------------------------------------- */}
        <div
          role="tabpanel"
          id="profile-panel-public"
          aria-label="Public page"
          hidden={section !== "public"}
          className="mt-6"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="min-w-0 rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Your public page
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This is how others find you on waytowalk.
                </p>
              </div>

              <form onSubmit={handleSaveIdentity} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="traveler-handle" className="text-xs font-semibold">
                    Your handle
                  </Label>
                  <div className="flex items-center overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
                    <span className="grid h-11 w-9 shrink-0 place-items-center text-muted-foreground">
                      <AtSign className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <Input
                      id="traveler-handle"
                      value={handle}
                      onChange={(event) => setHandle(event.target.value)}
                      maxLength={25}
                      placeholder="ada_travels"
                      autoComplete="username"
                      aria-describedby="traveler-handle-help"
                      className="h-11 border-0 bg-transparent px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>

                  {availabilityMessage ? (
                    <p
                      id="traveler-handle-help"
                      role="status"
                      aria-live="polite"
                      className={cn(
                        "flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed",
                        availabilityBusy
                          ? "text-muted-foreground"
                          : handleAvailable
                            ? "text-foreground"
                            : "text-destructive"
                      )}
                    >
                      {availabilityBusy ? (
                        <Loader2 className="mt-px h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                      ) : handleAvailable ? (
                        <CheckCircle2
                          className="mt-px h-3 w-3 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                      )}
                      <span>{availabilityMessage}</span>
                    </p>
                  ) : (
                    <p
                      id="traveler-handle-help"
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      3–24 lowercase letters, numbers or underscores. This becomes the address of
                      your public page.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="traveler-bio" className="text-xs font-semibold">
                    Bio
                  </Label>
                  <Textarea
                    id="traveler-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={280}
                    rows={4}
                    placeholder="A sentence about how you travel."
                    aria-describedby="traveler-bio-count"
                    className="min-h-[7rem] resize-none rounded-xl"
                  />
                  <p
                    id="traveler-bio-count"
                    className="text-right text-[11px] tabular-nums text-muted-foreground"
                  >
                    {bio.length}/280
                  </p>
                </div>

                {identityError && (
                  <p className="text-[11px] font-semibold text-destructive" role="alert">
                    {identityError}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    disabled={identityBusy || !identityChanged}
                    className="h-11 w-full rounded-xl px-5 text-sm font-semibold sm:w-auto"
                  >
                    {identityBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save public page
                  </Button>
                  {user.handle && (
                    <Button
                      asChild
                      variant="outline"
                      className="h-11 w-full gap-2 rounded-xl text-sm font-semibold sm:w-auto"
                    >
                      <Link to={`/travelers/${encodeURIComponent(user.handle)}`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        Preview page
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Visibility is chosen per trip when you publish, so the note
                    describes the real rule instead of a profile-wide switch. */}
                <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {user.handle
                    ? "Your public page lists only published, upcoming trips. Unpublish them before removing the handle."
                    : "You need a handle before publishing a trip. Leaving it empty removes it."}
                </p>
              </form>
            </section>

            <aside className="min-w-0">
              <AtAGlanceCard
                enquiriesSent={myEnquiriesLoaded ? myEnquiriesTotal : null}
                memberSince={memberSince}
              />
            </aside>
          </div>
        </div>

        {/* Activity ----------------------------------------------------------- */}
        <div
          role="tabpanel"
          id="profile-panel-activity"
          aria-label="Activity"
          hidden={section !== "activity"}
          className="mt-6"
        >
          <div className="space-y-5">
            {/* Blocked travellers (Milestone 8 G5) */}
            {blocks.length > 0 && (
              <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Ban className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                      Blocked travellers
                    </h2>
                    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                      These accounts cannot send you join requests on any of your published trips.
                      They are never told about the block.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {blocks.map((block) => (
                    <div
                      key={block.userId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          {avatarSrc(block.avatarUrl) && (
                            <AvatarImage src={avatarSrc(block.avatarUrl)} alt={block.label} />
                          )}
                          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                            {block.label.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
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
                        className="h-8 shrink-0 gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
                      >
                        {blocksBusy === block.userId && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        Unblock
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sent enquiries (Milestone 9 D5) */}
            {myEnquiries.length > 0 && (
              <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Inbox className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                        Enquiries you've sent
                      </h2>
                      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                        Each enquiry went only to the agency you chose. Replies and proposals
                        arrive in the conversation, so open a thread to read them and answer back.
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-fit shrink-0 gap-1.5 rounded-xl text-[11px] font-semibold"
                  >
                    <Link to="/proposals">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      Compare your proposals
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {myEnquiries.slice(0, 3).map((enquiry) => (
                    <div
                      key={enquiry.id}
                      className="space-y-1.5 rounded-xl border border-border/60 bg-muted/30 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {enquiry.agency ? (
                            <Link
                              to={`/agencies/${encodeURIComponent(enquiry.agency.slug)}`}
                              className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {enquiry.agency.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-foreground">
                              An agency
                            </span>
                          )}
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                              travellerEnquiryStatusBadgeClass(
                                enquiry.status,
                                (enquiry.proposals?.count ?? 0) > 0
                              )
                            )}
                          >
                            {travellerEnquiryStatusLabel(
                              enquiry.status,
                              (enquiry.proposals?.count ?? 0) > 0
                            )}
                          </span>
                          {enquiry.unread.traveller > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                              <MessageSquare className="h-2.5 w-2.5" aria-hidden="true" />
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
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
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
                          className="h-8 gap-1 rounded-lg px-2.5 text-[10px] font-semibold"
                        >
                          <Link to={`/enquiry/${enquiry.id}`}>
                            <MessageSquare className="h-3 w-3" aria-hidden="true" />
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
                    className="gap-1 rounded-xl text-[11px] font-semibold"
                  >
                    <Link to="/enquiries">
                      View all {myEnquiriesTotal}{" "}
                      {myEnquiriesTotal === 1 ? "enquiry" : "enquiries"}
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </section>
            )}

            {blocks.length === 0 && myEnquiries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-card p-8 text-center shadow-xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Inbox className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 font-display text-lg font-semibold tracking-tight text-foreground">
                  Nothing here yet
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Enquiries you send and travellers you block will show up here.
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5 rounded-xl text-xs font-semibold"
                >
                  <Link to="/agencies">
                    Browse agencies
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Delete account -----------------------------------------------------
            No deletion route exists yet, so this stays an honest notice rather
            than a button that pretends to remove the account. */}
        <section className="mt-8 rounded-2xl border border-destructive/25 bg-card p-5 shadow-xs sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                  Delete account
                </h2>
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  This would remove your profile, your trips and every page you've shared.
                  Deleting an account isn't self-serve yet, so the button stays off for now.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled
              className="h-10 w-full shrink-0 rounded-xl border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive sm:w-auto"
            >
              Delete account
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Profile;
