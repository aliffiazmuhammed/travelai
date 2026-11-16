import { apiRequest } from '@/api/client';
import { API_URL, assetUrl } from '@/config';

/**
 * A stored image reference on an itinerary item. The server keeps ids only;
 * `url` appears on public share payloads, where it is scoped to the share id.
 */
export interface MediaRef {
  id: string;
  url?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** Server view returned by `POST /itinerary/:id/media`. */
export interface TripPhotoView {
  id: string;
  url: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface UploadablePhoto {
  uri: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  /** The browser's File/Blob; React Native sends the uri shape instead. */
  file?: Blob;
}

export async function uploadTripPhoto(
  tripId: string,
  photo: UploadablePhoto
): Promise<MediaRef> {
  const body = new FormData();
  if (photo.file) {
    body.append('photo', photo.file, photo.name);
  } else {
    body.append('photo', {
      uri: photo.uri,
      name: photo.name,
      type: photo.type,
    } as unknown as Blob);
  }
  if (photo.width) body.append('width', String(photo.width));
  if (photo.height) body.append('height', String(photo.height));

  const { media } = await apiRequest<{ success: boolean; media: TripPhotoView }>(
    `/itinerary/${encodeURIComponent(tripId)}/media`,
    { method: 'POST', body }
  );
  return {
    id: media.id,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
  };
}

export interface TripPhotoSource {
  uri: string;
  /** True for member-scoped content; its route needs the session Bearer. */
  authenticated: boolean;
}

/**
 * Resolves an itinerary image reference to a fetchable URL. Public share refs
 * carry their own URL; member refs are built from the trip and media ids.
 */
export function resolveTripPhoto(
  ref: MediaRef | undefined | null,
  tripId?: string
): TripPhotoSource | null {
  if (!ref) return null;
  if (ref.url) {
    return {
      uri: /^(https?:|data:|blob:)/i.test(ref.url) ? ref.url : assetUrl(ref.url),
      authenticated: false,
    };
  }
  if (!ref.id || !tripId) return null;
  return {
    uri: `${API_URL}/itinerary/${encodeURIComponent(tripId)}/media/${ref.id}/content`,
    authenticated: true,
  };
}
