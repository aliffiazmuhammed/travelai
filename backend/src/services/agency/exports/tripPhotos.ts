import TripMedia from '../../../models/TripMedia.js';
import { readTripMediaFile } from '../../tripMedia/storage.js';
import type { ExportDocument, ExportImage } from './document.js';

/**
 * Embeds trip photos into an export document as data URLs.
 *
 * Templates never fetch remote assets (the HTML renderer runs under a
 * `img-src data:` CSP, and PDF rendering is offline), so the bytes must be read
 * server-side before rendering. Photos are private trip files; ids are already
 * validated at build time and are re-checked here against the trip, so a
 * tampered itinerary cannot pull another trip's media into a proposal.
 *
 * Budget: photos are trimmed rather than failing a render. Day heroes win,
 * then activities, stays and finally food; a photo that would blow the byte
 * budget is skipped and the layout falls back to its template image.
 */

/** Total embedded data-URL budget for one document (~24 MB of base64). */
export const EXPORT_MEDIA_MAX_TOTAL_CHARS = 24 * 1024 * 1024;
/** A single photo larger than this is skipped (raw bytes, before base64). */
export const EXPORT_MEDIA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Upper bound on unique photos read for one document. */
export const EXPORT_MEDIA_MAX_IMAGES = 120;
/** Concurrent storage reads; remote storage costs one request per photo. */
const EXPORT_MEDIA_READ_CONCURRENCY = 8;

type Priority = 0 | 1 | 2 | 3;

interface Candidate {
  id: string;
  priority: Priority;
}

function collectCandidates(doc: ExportDocument): Candidate[] {
  const found: Candidate[] = [];
  for (const day of doc.trip.days) {
    if (day.image?.id) found.push({ id: day.image.id, priority: 0 });
    for (const activity of day.activities) {
      if (activity.image?.id) found.push({ id: activity.image.id, priority: 1 });
    }
    for (const stay of day.stay) {
      if (stay.image?.id) found.push({ id: stay.image.id, priority: 2 });
    }
    for (const food of day.foodItems) {
      if (food.image?.id) found.push({ id: food.image.id, priority: 3 });
    }
  }

  // One read per photo; the highest-value slot decides its priority.
  const byId = new Map<string, Candidate>();
  for (const candidate of found) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.priority < existing.priority) {
      byId.set(candidate.id, candidate);
    }
  }
  const unique = [...byId.values()].sort((a, b) => a.priority - b.priority);
  return unique.slice(0, EXPORT_MEDIA_MAX_IMAGES);
}

function setEmbedded(
  image: ExportImage | null,
  dataUrls: Map<string, string>
): void {
  if (!image?.id) return;
  const dataUrl = dataUrls.get(image.id);
  if (dataUrl) image.dataUrl = dataUrl;
}

/** Reads the referenced photos and fills each image slot's `dataUrl`. */
export async function embedTripMedia(
  doc: ExportDocument,
  tripId: string
): Promise<ExportDocument> {
  const candidates = collectCandidates(doc);
  if (candidates.length === 0) return doc;

  const rows = await TripMedia.find({
    _id: { $in: candidates.map((entry) => entry.id) },
    tripId,
  }).select('_id mime bytes storageKey');

  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const readable: Array<{ candidate: Candidate; media: (typeof rows)[number] }> = [];
  for (const candidate of candidates) {
    const media = byId.get(candidate.id);
    if (media && media.bytes <= EXPORT_MEDIA_MAX_IMAGE_BYTES) {
      readable.push({ candidate, media });
    }
  }

  // Reads run in parallel; the budget is then applied in priority order so a
  // render never pays for remote reads it will not use.
  const fetched = new Map<string, string>();
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < readable.length) {
      const entry = readable[cursor];
      cursor += 1;
      try {
        const bytes = await readTripMediaFile(entry.media.storageKey);
        fetched.set(
          entry.candidate.id,
          `data:${entry.media.mime};base64,${bytes.toString('base64')}`
        );
      } catch (error) {
        // A missing file must not fail the whole proposal; that photo is
        // simply absent from this render.
        console.warn(
          `Trip photo ${entry.candidate.id} could not be embedded:`,
          String((error as any)?.message ?? error)
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(EXPORT_MEDIA_READ_CONCURRENCY, readable.length) },
      () => worker()
    )
  );

  const dataUrls = new Map<string, string>();
  let total = 0;
  for (const entry of readable) {
    const dataUrl = fetched.get(entry.candidate.id);
    if (!dataUrl) continue;
    if (total + dataUrl.length > EXPORT_MEDIA_MAX_TOTAL_CHARS) continue;
    total += dataUrl.length;
    dataUrls.set(entry.candidate.id, dataUrl);
  }

  for (const day of doc.trip.days) {
    setEmbedded(day.image, dataUrls);
    day.activities.forEach((activity) => setEmbedded(activity.image, dataUrls));
    day.stay.forEach((stay) => setEmbedded(stay.image, dataUrls));
    day.foodItems.forEach((food) => setEmbedded(food.image, dataUrls));
  }

  return doc;
}
