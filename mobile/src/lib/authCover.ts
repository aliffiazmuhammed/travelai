/**
 * The single photograph behind every auth screen. A misty highland glen: its
 * lower half stays dark, so the cream headline keeps contrast without a heavy scrim.
 */
const PHOTO = 'photo-1476990789491-712b869b91a5';

export function authCoverUrl(width = 1200): string {
  return `https://images.unsplash.com/${PHOTO}?auto=format&fit=crop&w=${width}&q=75`;
}
