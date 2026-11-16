import { Platform } from 'react-native';

/**
 * Android emulators reach the host machine through 10.0.2.2; the iOS simulator
 * shares localhost. Physical devices need EXPO_PUBLIC_API_URL set to the LAN IP
 * (see .env.example).
 */
const localApi =
  Platform.select({
    android: 'http://10.0.2.2:5000/api',
    default: 'http://localhost:5000/api',
  }) ?? 'http://localhost:5000/api';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || localApi).replace(/\/+$/, '');

/** Absolute URL for a site-relative asset the API hands back (e.g. an agency logo). */
export function assetUrl(path: string): string {
  return `${API_URL.replace(/\/api$/, '')}${path}`;
}
