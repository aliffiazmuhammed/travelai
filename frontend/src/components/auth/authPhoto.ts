import authPhotoDesktop from "@/assets/hero-travel.jpg";
import authPhotoMobile from "@/assets/auth-postcard.jpg";

/**
 * Locally bundled travel photography for the auth split screen (C-21).
 *
 * The desktop panel gets the wide frame; the phone postcard uses a 960px copy
 * so a small band does not download the full-size file. Neither request leaves
 * the app origin.
 */
export const AUTH_PHOTO_URL = authPhotoDesktop;
export const AUTH_POSTCARD_URL = authPhotoMobile;
