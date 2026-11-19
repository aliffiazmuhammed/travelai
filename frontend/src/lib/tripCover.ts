/**
 * Destination photography for trip surfaces. The gallery summary carries no
 * cover field, so a shared trip's photo is chosen from its destination text.
 *
 * `tripCover` is the one place that knows the Unsplash ids, which keeps the
 * landing strip, Explore cards and the dashboard from drifting apart. Requests
 * go through this app's `/api/images/cover` proxy by default (C-21), so the
 * browser never depends on Unsplash directly; set `VITE_IMAGE_CDN` to point at a
 * configured image CDN that accepts the same `photo`/`w`/`q` query.
 */

import { API_BASE_URL } from "@/config";

const DESTINATION_PHOTOS: Record<string, string> = {
  // Hill stations and mountains
  wayanad: "photo-1630938819488-ba7d1440d48b",
  munnar: "photo-1596176530529-78163a4f7af2",
  coorg: "photo-1590490360182-c33d57733427",
  ooty: "photo-1582510003544-4d00b7f74220",
  manali: "photo-1626621341517-bbf3d9990a23",
  shimla: "photo-1600683796695-103347b7fe70",
  kashmir: "photo-1595815771614-ade9d652a65d",
  ladakh: "photo-1581793745862-99fde7fa73d2",
  rishikesh: "photo-1609137144822-263a238fb065",
  // Backwaters, coast and heritage
  alleppey: "photo-1602216056096-3b40cc0c9944",
  alappuzha: "photo-1602216056096-3b40cc0c9944",
  goa: "photo-1512343879784-a960bf40e7f2",
  andaman: "photo-1589182373726-e4f658ab50f0",
  jaipur: "photo-1477587458883-47145ed94245",
  udaipur: "photo-1615836245337-f5b9b2303f10",
  varanasi: "photo-1561359313-0639aad49ca6",
  // International
  skye: "photo-1667122169237-f9826de1786b",
  scotland: "photo-1476990789491-712b869b91a5",
  highlands: "photo-1476990789491-712b869b91a5",
  bali: "photo-1537996194471-e657df975ab4",
  ubud: "photo-1537996194471-e657df975ab4",
  uluwatu: "photo-1537996194471-e657df975ab4",
  positano: "photo-1561956021-947f09ae0101",
  amalfi: "photo-1561956021-947f09ae0101",
  kyoto: "photo-1493976040374-85c8e12f0c0e",
  lisbon: "photo-1585208798174-6cedd86e019a",
  // Regional fallbacks
  kerala: "photo-1602216056096-3b40cc0c9944",
  portugal: "photo-1585208798174-6cedd86e019a",
};

/** A specific place always wins over a state or region named in the same text. */
const SPECIFIC_PLACES = [
  "wayanad",
  "munnar",
  "coorg",
  "ooty",
  "manali",
  "shimla",
  "kashmir",
  "ladakh",
  "rishikesh",
  "alleppey",
  "alappuzha",
  "goa",
  "andaman",
  "jaipur",
  "udaipur",
  "varanasi",
  "skye",
  "bali",
  "ubud",
  "uluwatu",
  "positano",
  "amalfi",
  "kyoto",
  "lisbon",
];

const FALLBACK_PHOTO = "photo-1469854523086-cc02fe5d8800";

/** Widths the card, list and hero slots actually render at. */
export const TRIP_COVER_WIDTHS = [320, 480, 640, 800, 1200, 1600] as const;

const IMAGE_CDN = ((import.meta.env.VITE_IMAGE_CDN as string) || "").replace(/\/+$/, "");
const COVER_ENDPOINT = `${IMAGE_CDN || `${API_BASE_URL}/api/images/cover`}`;

const coverUrl = (photo: string, width: number) =>
  `${COVER_ENDPOINT}?photo=${encodeURIComponent(photo)}&w=${width}&q=80`;

/** Picks the Unsplash id for arbitrary destination text. */
function pickPhoto(text: string | undefined): string {
  const haystack = (text ?? "").toLowerCase();

  for (const place of SPECIFIC_PLACES) {
    if (haystack.includes(place)) return DESTINATION_PHOTOS[place];
  }
  for (const [place, photo] of Object.entries(DESTINATION_PHOTOS)) {
    if (haystack.includes(place)) return photo;
  }
  return FALLBACK_PHOTO;
}

/**
 * Picks a photo for arbitrary destination text ("Munnar, Kerala"). The width
 * matches the slot, so a hero and a card do not download the same file.
 */
export function tripCoverUrl(text: string | undefined, width = 800): string {
  return coverUrl(pickPhoto(text), width);
}

/**
 * Responsive candidates for one destination, ordered smallest first. Pair with
 * `sizes` on `AppImage` so a phone picks the 480px file, not the hero's 1600px.
 */
export function tripCoverSrcSet(text: string | undefined): string {
  const photo = pickPhoto(text);
  return TRIP_COVER_WIDTHS.map((width) => `${coverUrl(photo, width)} ${width}w`).join(", ");
}
