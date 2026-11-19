import { Image } from 'expo-image';

const WORDMARK = require('../../../assets/brand/waytowalk-logo-reverse.png');

/**
 * The supplied asset is 2560x520 with transparent clear space baked in: the
 * visible ink spans 1935 px, or 75.6% of the canvas. Sizing the *box* to the
 * brand minimum would therefore render the lockup about a quarter smaller than
 * intended, so derive the box from the ink ratio instead.
 */
const ASSET_WIDTH = 2560;
const ASSET_HEIGHT = 520;
const INK_WIDTH_RATIO = 1935 / ASSET_WIDTH;
/** Brand guide: the wordmark lockup is never smaller than 140 px wide. */
const MIN_INK_WIDTH = 140;

interface BrandMarkProps {
  /** Visible ink width in points. Defaults to the brand minimum. */
  inkWidth?: number;
}

/**
 * The supplied reversed wordmark (Phase 1A).
 *
 * The brand guide requires the artwork, not a typeset replacement, and this
 * lockup is only for forest, dark, or dark photographic backgrounds — which is
 * exactly where the auth hero places it. The transparent padding in the asset
 * also supplies the clear space the guide asks for.
 */
export function BrandMark({ inkWidth = MIN_INK_WIDTH }: BrandMarkProps) {
  const width = Math.round(inkWidth / INK_WIDTH_RATIO);
  const height = Math.round((width * ASSET_HEIGHT) / ASSET_WIDTH);

  return (
    <Image
      source={WORDMARK}
      style={{ width, height }}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="waytowalk"
    />
  );
}
