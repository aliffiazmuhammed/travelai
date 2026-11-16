import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { resolveTripPhoto, type MediaRef } from '@/api/media';
import { getSessionToken } from '@/auth/tokenStorage';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface TripPhotoProps {
  photo?: MediaRef | null;
  tripId?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
  accessibilityLabel?: string;
}

/**
 * A trip photo. Member-scoped content needs the session Bearer, which native
 * images send as a header; the web build fetches the bytes first because a
 * plain <img> cannot attach headers.
 */
export function TripPhoto({
  photo,
  tripId,
  style,
  contentFit = 'cover',
  accessibilityLabel,
}: TripPhotoProps) {
  const { palette } = useTheme();
  const target = resolveTripPhoto(photo, tripId);
  const uri = target?.uri ?? null;
  const needsAuth = target?.authenticated ?? false;

  const [token, setToken] = useState<string | null>(null);
  const [web, setWeb] = useState<{ uri: string; objectUrl?: string; failed?: boolean } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !needsAuth) return;
    let alive = true;
    void getSessionToken().then((value) => {
      if (alive) setToken(value);
    });
    return () => {
      alive = false;
    };
  }, [needsAuth]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !uri) return;

    let alive = true;
    let objectUrl: string | null = null;
    void (async () => {
      const headers = needsAuth
        ? { Authorization: `Bearer ${(await getSessionToken()) ?? ''}` }
        : undefined;
      const response = await fetch(uri, { headers });
      if (!response.ok) throw new Error('photo');
      const blob = await response.blob();
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setWeb({ uri, objectUrl });
    })().catch(() => {
      if (alive) setWeb({ uri, failed: true });
    });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, needsAuth]);

  if (!target) return null;

  // State is tagged with its uri so a previous photo never flashes after a swap.
  const current = web && web.uri === uri ? web : null;

  if (current?.failed) {
    return (
      <View style={[styles.placeholder, { backgroundColor: palette.muted }, style]}>
        <Ionicons name="image-outline" size={22} color={palette.mutedForeground} />
      </View>
    );
  }

  const source =
    Platform.OS === 'web'
      ? current?.objectUrl
        ? { uri: current.objectUrl }
        : null
      : needsAuth
        ? token
          ? { uri: target.uri, headers: { Authorization: `Bearer ${token}` } }
          : null
        : { uri: target.uri };

  if (!source) {
    return <View style={[styles.placeholder, { backgroundColor: palette.muted }, style]} />;
  }

  return (
    <Image
      source={source}
      style={style}
      contentFit={contentFit}
      transition={180}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
});
