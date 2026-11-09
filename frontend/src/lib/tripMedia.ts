/**
 * Trip photo helpers: client-side downscaling before upload, and URL building
 * for image references stored in an itinerary.
 *
 * The server caps uploads at 8 MB and stores bytes privately; the browser
 * downscales first so a phone photo does not blow the per-trip media budget or
 * bloat exports (which embed every photo as a data URL).
 */

import { API_BASE_URL } from "@/config";
import type { MediaRef } from "@/types/trip";

export const TRIP_PHOTO_MAX_MB = 8;
export const TRIP_PHOTO_MAX_BYTES = TRIP_PHOTO_MAX_MB * 1024 * 1024;
/** Long edge kept for exported layouts; plenty for print at A4 width. */
export const TRIP_PHOTO_MAX_EDGE = 2000;
const REENCODE_QUALITY = 0.85;
/** Files already small enough stay untouched (keeps PNG/WebP crispness). */
const KEEP_UNDER_BYTES = 1.5 * 1024 * 1024;

export const TRIP_PHOTO_ACCEPT_ATTR = "image/jpeg,image/png,image/webp";
export const TRIP_PHOTO_HINT = "JPEG, PNG or WebP up to 8 MB";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** Returns a user-facing error, or null when the file can be uploaded. */
export function validateTripPhoto(file: File | null | undefined): string | null {
  if (!file) return "Choose a photo first.";
  const type = file.type.toLowerCase();
  if (!ALLOWED.includes(type)) return "Photos must be JPEG, PNG or WebP.";
  if (file.size <= 0) return "That photo appears to be empty.";
  if (file.size > TRIP_PHOTO_MAX_BYTES) {
    return `Photos must be smaller than ${TRIP_PHOTO_MAX_MB} MB.`;
  }
  return null;
}

/** Full URL for an itinerary photo reference. */
export function tripPhotoSrc(
  ref: MediaRef | undefined | null,
  tripId: string
): string {
  if (!ref?.id && !ref?.url) return "";
  const url = String(ref?.url ?? "");
  if (url) {
    if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
    return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  }
  if (!tripId) return "";
  return `${API_BASE_URL}/api/itinerary/${tripId}/media/${ref!.id}/content`;
}

export interface PreparedTripPhoto {
  blob: Blob;
  width: number;
  height: number;
  /** True when the browser re-encoded (and therefore re-oriented) the file. */
  reencoded: boolean;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo could not be read. Try another file."));
    };
    image.src = url;
  });
}

/**
 * Prepares a photo for upload: reads its real dimensions and, when it is too
 * large or too heavy, draws it into a canvas at most `TRIP_PHOTO_MAX_EDGE`
 * pixels on the long edge and exports JPEG at 0.85 quality.
 */
export async function prepareTripPhoto(file: File): Promise<PreparedTripPhoto> {
  const invalid = validateTripPhoto(file);
  if (invalid) throw new Error(invalid);

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    throw new Error("That photo could not be read. Try another file.");
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("That photo could not be read.");

  const longEdge = Math.max(width, height);
  if (longEdge <= TRIP_PHOTO_MAX_EDGE && file.size <= KEEP_UNDER_BYTES) {
    return { blob: file, width, height, reencoded: false };
  }

  const scale = Math.min(1, TRIP_PHOTO_MAX_EDGE / longEdge);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  // Drawing into a canvas bakes in EXIF orientation and drops the metadata.
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize that photo.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", REENCODE_QUALITY);
  });
  if (!blob) throw new Error("That photo could not be prepared for upload.");

  // A re-encode that grew (rare, e.g. a tiny PNG) is not worth sending.
  if (blob.size > file.size && file.size <= TRIP_PHOTO_MAX_BYTES) {
    return { blob: file, width, height, reencoded: false };
  }
  return { blob, width: targetWidth, height: targetHeight, reencoded: true };
}
