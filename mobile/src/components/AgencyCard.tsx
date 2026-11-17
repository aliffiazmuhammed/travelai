import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AgencyDirectoryCard } from '@/api/explore';
import { assetUrl } from '@/config';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card, Skeleton } from '@/ui';

function formatFromPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** One directory listing in the Explore strip; opens the agency's public profile. */
export function AgencyCard({
  agency,
  onPress,
}: {
  agency: AgencyDirectoryCard;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(agency.logoUrl) && !logoFailed;
  const specialties = agency.specialties.slice(0, 2).join(' · ');

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={`Open ${agency.name}’s profile`}
      style={styles.card}
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={[styles.logo, { backgroundColor: palette.secondary }]}>
            <AppText variant="label" style={{ color: palette.secondaryForeground }}>
              {initials(agency.name)}
            </AppText>
            {showLogo ? (
              <Image
                source={{ uri: assetUrl(agency.logoUrl as string) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
          </View>
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <AppText variant="label" numberOfLines={1} style={styles.name}>
                {agency.name}
              </AppText>
              {agency.verified ? (
                <Ionicons name="checkmark-circle" size={15} color={palette.primary} />
              ) : null}
            </View>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {agency.baseCity || 'Plans trips across India'}
            </AppText>
          </View>
        </View>

        {specialties ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {specialties}
          </AppText>
        ) : null}

        <AppText variant="label" tone="primary" numberOfLines={1}>
          {agency.fromPricePerPerson
            ? `From ${formatFromPrice(agency.fromPricePerPerson, agency.currency || 'INR')}`
            : 'Price on request'}
        </AppText>
      </View>
    </Card>
  );
}

/**
 * One row in the agency directory: who they are, where they work from, what
 * they are good at, and the entry price — everything needed to decide whether
 * to open the profile, without a card that fills the screen.
 */
export function AgencyRowCard({
  agency,
  onPress,
}: {
  agency: AgencyDirectoryCard;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(agency.logoUrl) && !logoFailed;
  const specialties = agency.specialties.slice(0, 2).join(' · ');

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={`Open ${agency.name}’s profile`}
    >
      <View style={styles.row}>
        <View style={[styles.rowLogo, { backgroundColor: palette.secondary }]}>
          <AppText variant="label" style={{ color: palette.secondaryForeground }}>
            {initials(agency.name)}
          </AppText>
          {showLogo ? (
            <Image
              source={{ uri: assetUrl(agency.logoUrl as string) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.nameRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
              {agency.name}
            </AppText>
            {agency.verified ? (
              <Ionicons name="checkmark-circle" size={15} color={palette.primary} />
            ) : null}
          </View>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {agency.baseCity || 'Plans trips across India'}
            {specialties ? ` · ${specialties}` : ''}
          </AppText>
          <AppText variant="label" tone="primary" numberOfLines={1}>
            {agency.fromPricePerPerson
              ? `From ${formatFromPrice(agency.fromPricePerPerson, agency.currency || 'INR')}`
              : 'Price on request'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
      </View>
    </Card>
  );
}

export function AgencyRowSkeleton() {
  return (
    <Card padded={false}>
      <View style={styles.row}>
        <Skeleton width={56} height={56} radius={radius.md} />
        <View style={styles.rowBody}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="55%" height={12} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: 248 },
  body: { padding: space.lg, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nameBlock: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  rowLogo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: { flex: 1, justifyContent: 'center', gap: 2 },
});
