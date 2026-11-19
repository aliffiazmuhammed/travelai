import type { ReactNode } from "react";
import { AppImage } from "@/components/ui/app-image";
import { tripCoverSrcSet, tripCoverUrl } from "@/lib/tripCover";
import { cn } from "@/lib/utils";

/**
 * The photo strip at the top of a shared trip card. Public gallery payloads do
 * not carry a cover, so the image comes from `tripCoverUrl(destination)`.
 *
 * Candidates come from one destination choice (C-21), so a phone downloads the
 * 480px file while a wide card gets the 1200px one. `children` is where a
 * duration badge or other overlay sits.
 */
export const TripCover = ({
  destination,
  title,
  width = 800,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  className,
  children,
}: {
  destination?: string;
  title: string;
  width?: number;
  sizes?: string;
  className?: string;
  children?: ReactNode;
}) => {
  const text = `${destination ?? ""} ${title}`;

  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden bg-muted",
        className
      )}
    >
      <AppImage
        src={tripCoverUrl(text, width)}
        srcSet={tripCoverSrcSet(text)}
        sizes={sizes}
        alt={destination ? `${title} in ${destination}` : title}
        width={width}
        height={Math.round(width * 0.625)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      {children}
    </div>
  );
};
