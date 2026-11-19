import { AppImage } from "@/components/ui/app-image";
import { AUTH_POSTCARD_URL } from "./authPhoto";

/**
 * Compact photo band for phone widths (Phase 4.2, AUTH-051).
 *
 * The desktop split screen already carries the travel photograph. On phones the
 * panel is hidden, so this keeps a small piece of that language instead of
 * leaving a logo floating above a generic card. The image is local (C-21), so
 * it does not wait on a third-party host, and the dark base colour keeps the
 * copy legible while it decodes.
 */
export function AuthPostcard() {
  return (
    <div
      data-testid="auth-postcard"
      className="relative mb-4 h-[clamp(6.5rem,17vh,9rem)] w-full overflow-hidden rounded-3xl bg-background shadow-card lg:hidden"
    >
      <AppImage
        src={AUTH_POSTCARD_URL}
        alt=""
        width={960}
        height={540}
        priority
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-muted/80 via-muted/25 to-transparent"
      />
    </div>
  );
}
