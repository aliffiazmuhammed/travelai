import React, { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { prepareTripPhoto, tripPhotoSrc } from "@/lib/tripMedia";
import type { MediaRef } from "@/types/trip";

interface TripPhotoFieldProps {
  /** The owning trip. Required to upload; omit for a read-only view. */
  tripId?: string;
  value?: MediaRef;
  /** Present → the field is editable (upload, replace, remove). */
  onChange?: (ref: MediaRef | undefined) => void;
  alt?: string;
  variant?: "hero" | "card" | "thumb";
  label?: string;
  className?: string;
}

/**
 * A trip photo slot: shows the stored image and, for editors, uploads a
 * browser-downscaled JPEG through the private trip media route. Uploading
 * happens immediately; the returned ref is persisted by the caller's normal
 * itinerary save. Removing the photo drops the reference (the stored file is
 * left for the trip purge, since several days may share a ref).
 */
export const TripPhotoField: React.FC<TripPhotoFieldProps> = ({
  tripId,
  value,
  onChange,
  alt,
  variant = "card",
  label,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const editable = Boolean(tripId && onChange);
  const src = tripPhotoSrc(value, tripId ?? "");

  if (!src && !editable) return null;

  const pick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || !tripId || !onChange) return;
    setBusy(true);
    try {
      const prepared = await prepareTripPhoto(file);
      const { media } = await api.uploadTripPhoto(tripId, prepared.blob, {
        width: prepared.width,
        height: prepared.height,
      });
      onChange({
        id: media.id,
        width: media.width,
        height: media.height,
        ...(alt?.trim() ? { alt: alt.trim().slice(0, 160) } : {}),
      });
      toast.success("Photo added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That photo could not be uploaded."
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = () => {
    if (!onChange) return;
    onChange(undefined);
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={(event) => void handleFile(event.target.files?.[0])}
    />
  );

  const busyOverlay = busy && (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Uploading
      </span>
    </div>
  );

  if (variant === "thumb") {
    const thumbClass = cn(
      "relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40",
      editable && "hover:border-primary/50",
      className
    );
    const thumbImage = src ? (
      <img src={src} alt={alt || value?.alt || ""} className="h-full w-full object-cover" loading="lazy" />
    ) : (
      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImagePlus className="h-4 w-4" aria-hidden />
      </span>
    );

    if (!editable) {
      return <div className={thumbClass}>{thumbImage}</div>;
    }

    return (
      <>
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          title={src ? "Replace photo" : "Add a photo"}
          className={thumbClass}
        >
          {thumbImage}
          {busyOverlay}
        </button>
        {hiddenInput}
      </>
    );
  }

  if (!src) {
    // Editable empty state (hero / card).
    return (
      <>
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className={cn(
            "relative flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary",
            variant === "hero" ? "aspect-[16/9] sm:aspect-[21/9]" : "aspect-[16/10]",
            className
          )}
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          <span className="text-[11px] font-semibold">{label || "Add a photo"}</span>
          <span className="text-[10px] font-medium text-muted-foreground/80">
            JPEG, PNG or WebP
          </span>
          {busyOverlay}
        </button>
        {hiddenInput}
      </>
    );
  }

  return (
    <div
      className={cn(
        "group/photo relative w-full overflow-hidden rounded-2xl border border-border bg-muted/30",
        variant === "hero" ? "aspect-[16/9] sm:aspect-[21/9]" : "aspect-[16/10]",
        className
      )}
    >
      <img
        src={src}
        alt={alt || value?.alt || ""}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      {editable && (
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-end gap-1.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/photo:opacity-100">
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Replace
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label="Remove photo"
            title="Remove photo"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      {busyOverlay}
      {hiddenInput}
    </div>
  );
};

export default TripPhotoField;
