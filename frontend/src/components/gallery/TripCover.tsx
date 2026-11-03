import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { tripCoverUrl } from "@/lib/tripCover";
import { cn } from "@/lib/utils";

/**
 * The photo strip at the top of a shared trip card. Public gallery payloads do
 * not carry a cover, so the image comes from `tripCoverUrl(destination)`.
 *
 * A 404 leaves a calm placeholder rather than a broken image, and `children`
 * is where a duration badge or other overlay sits.
 */
export const TripCover = ({
  destination,
  title,
  width = 800,
  className,
  children,
}: {
  destination?: string;
  title: string;
  width?: number;
  className?: string;
  children?: ReactNode;
}) => {
  const src = tripCoverUrl(`${destination ?? ""} ${title}`, width);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden bg-muted",
        className
      )}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="h-7 w-7" aria-hidden="true" />
        </div>
      ) : (
        <img
          src={src}
          alt={destination ? `${title} in ${destination}` : title}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      {children}
    </div>
  );
};
