import {
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";
import { cn } from "@/lib/utils";

export interface AppImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> {
  src: string;
  /** Responsive candidates, usually built by `tripCoverSrcSet`. */
  srcSet?: string;
  /** Layout hint so the browser picks a width-appropriate candidate. */
  sizes?: string;
  /**
   * Above-the-fold hero: loads eagerly with high fetch priority. Everything
   * else stays lazy so a long page does not compete with its own hero.
   */
  priority?: boolean;
  /** Local image shown if the network copy fails. */
  fallbackSrc?: string;
  /**
   * Tiny inline preview (a data URL). It paints as the element background while
   * the real image decodes, which avoids a flash of empty box on slow links.
   */
  blurDataUrl?: string;
}

const DEFAULT_FALLBACK = "/placeholder.svg";

/**
 * One image element for photographic content (C-21).
 *
 * It keeps three decisions in one place: responsive candidates, load priority,
 * and a guaranteed local fallback. The fallback is deliberately not another
 * remote URL, so a blocked CDN leaves a calm placeholder instead of a broken
 * image icon. `width`/`height` should be passed for intrinsic dimensions; the
 * caller still controls the rendered size through `className`.
 */
export function AppImage({
  src,
  srcSet,
  sizes,
  priority = false,
  fallbackSrc = DEFAULT_FALLBACK,
  blurDataUrl,
  className,
  alt,
  onLoad,
  onError,
  style,
  ...rest
}: AppImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const usingFallback = failed || !src;
  const resolvedSrc = usingFallback ? fallbackSrc : src;

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    // Guard against a missing local fallback looping on itself.
    if (!usingFallback) setFailed(true);
  };

  return (
    <img
      {...rest}
      src={resolvedSrc}
      srcSet={usingFallback ? undefined : srcSet}
      sizes={usingFallback ? undefined : sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={handleError}
      data-loaded={loaded || undefined}
      className={cn("bg-muted", className)}
      style={{
        ...style,
        backgroundImage:
          blurDataUrl && !loaded ? `url("${blurDataUrl}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}
