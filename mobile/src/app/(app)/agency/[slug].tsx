import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchAgencyProfile, type AgencyPackage } from '@/api/discovery';
import { assetUrl } from '@/config';
import { formatMoney } from '@/lib/expenses';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen, Skeleton } from '@/ui';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function nightsLabel(nights: number): string {
  if (!Number.isFinite(nights) || nights <= 0) return 'Multi-day';
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

function PlanCard({ plan }: { plan: AgencyPackage }) {
  const { palette } = useTheme();
  const meta = [`${nightsLabel(plan.nights)}`, plan.highlights[0]].filter(Boolean);

  return (
    <Card padded={false} style={styles.planCard}>
      <View style={[styles.planCover, { backgroundColor: palette.muted }]}>
        {plan.coverUrl ? (
          <Image
            source={{ uri: assetUrl(plan.coverUrl) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Ionicons name="map-outline" size={26} color={palette.mutedForeground} />
        )}
      </View>
      <View style={styles.planBody}>
        <AppText variant="heading" numberOfLines={2}>
          {plan.title}
        </AppText>
        {plan.summary ? (
          <AppText tone="muted" numberOfLines={3}>
            {plan.summary}
          </AppText>
        ) : null}
        <View style={styles.planFooter}>
          <View style={styles.planMeta}>
            <Ionicons name="moon-outline" size={13} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted">
              {meta.join(' · ')}
            </AppText>
          </View>
          <AppText variant="label" tone="primary">
            {plan.pricePerPerson
              ? `${formatMoney(plan.pricePerPerson, plan.currency || 'INR')} pp`
              : 'Price on request'}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

export default function AgencyProfileScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = (Array.isArray(params.slug) ? params.slug[0] : params.slug)?.trim() ?? '';

  const agencyQuery = useQuery({
    queryKey: ['agency-profile', slug],
    queryFn: () => fetchAgencyProfile(slug),
    enabled: Boolean(slug),
    retry: 1,
  });

  const agency = agencyQuery.data;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/');
  };

  const topRow = (
    <View style={styles.topRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={palette.foreground} />
      </Pressable>
      <AppText variant="heading" tone="primary" style={styles.wordmark}>
        waytowalk
      </AppText>
    </View>
  );

  if (agencyQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.hero}>
            <View style={styles.identityRow}>
              <Skeleton width={56} height={56} radius={radius.md} />
              <View style={styles.identityText}>
                <Skeleton width="65%" height={20} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
            <Skeleton height={12} />
            <Skeleton width="80%" height={12} />
          </Card>
          <Skeleton height={190} radius={radius.xxl} />
        </View>
      </Screen>
    );
  }

  if (!agency || agencyQuery.isError) {
    const notFound = agencyQuery.error instanceof ApiError && agencyQuery.error.status === 404;
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={notFound ? 'business-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {notFound ? 'This agency isn’t listed' : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {notFound
                ? 'Their directory profile may be unpublished or still under review.'
                : agencyQuery.error instanceof Error
                  ? agencyQuery.error.message
                  : 'This agency could not be loaded right now.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to Explore" onPress={() => router.navigate('/')} />
              {!notFound ? (
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => agencyQuery.refetch()}
                />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const replyLine =
    agency.replyTimeHours !== null
      ? `Usually replies within ${Math.max(1, Math.round(agency.replyTimeHours))}h`
      : null;
  const goodToKnow = [
    agency.services.length > 0
      ? { icon: 'sparkles-outline' as const, label: 'Services', value: agency.services.map((s) => s.label).join(', ') }
      : null,
    agency.languages.length > 0
      ? { icon: 'language-outline' as const, label: 'Languages', value: agency.languages.map((l) => l.label).join(', ') }
      : null,
    agency.destinations.length > 0
      ? { icon: 'location-outline' as const, label: 'Covers', value: agency.destinations.join(', ') }
      : null,
  ].filter((row): row is { icon: 'sparkles-outline' | 'language-outline' | 'location-outline'; label: string; value: string } => row !== null);

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
      refreshing={agencyQuery.isRefetching && !agencyQuery.isPending}
      onRefresh={() => agencyQuery.refetch()}
    >
      {topRow}

      <View style={styles.page}>
        <Card style={styles.hero}>
          <View style={styles.identityRow}>
            <View style={[styles.logo, { backgroundColor: palette.secondary }]}>
              <AppText variant="label" style={{ color: palette.secondaryForeground }}>
                {initials(agency.name)}
              </AppText>
              {agency.logoUrl ? (
                <Image
                  source={{ uri: assetUrl(agency.logoUrl) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
            </View>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <AppText variant="title" numberOfLines={2} style={styles.name}>
                  {agency.name}
                </AppText>
                {agency.verified ? (
                  <Ionicons name="checkmark-circle" size={18} color={palette.primary} />
                ) : null}
              </View>
              {agency.baseCity ? (
                <View style={styles.baseCity}>
                  <Ionicons name="location-outline" size={13} color={palette.mutedForeground} />
                  <AppText variant="caption" tone="muted">
                    {agency.baseCity}
                  </AppText>
                </View>
              ) : null}
              {replyLine ? (
                <AppText variant="caption" tone="primary">
                  {replyLine}
                </AppText>
              ) : null}
            </View>
          </View>

          {agency.about ? <AppText style={styles.about}>{agency.about}</AppText> : null}

          {agency.specialties.length > 0 ? (
            <View style={styles.chips}>
              {agency.specialties.map((specialty) => (
                <View key={specialty} style={[styles.chip, { backgroundColor: palette.muted }]}>
                  <AppText variant="caption" tone="muted">
                    {specialty}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="label" tone="primary">
              THEIR PLANS
            </AppText>
            <AppText variant="title">Plans they publish</AppText>
            <AppText variant="caption" tone="muted">
              Published packages, priced by the agency.
            </AppText>
          </View>

          {agency.packages.length === 0 ? (
            <Card style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
                <Ionicons name="map-outline" size={22} color={palette.primary} />
              </View>
              <AppText variant="heading">No plans published yet</AppText>
              <AppText tone="muted">
                Their packages will appear here once they are shared.
              </AppText>
            </Card>
          ) : (
            agency.packages.map((plan) => <PlanCard key={plan.id} plan={plan} />)
          )}
        </View>

        {goodToKnow.length > 0 || agency.website || agency.contactPhone ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="label" tone="primary">
                GOOD TO KNOW
              </AppText>
              <AppText variant="title">Before you write</AppText>
            </View>
            <Card style={styles.facts}>
              {goodToKnow.map((row) => (
                <View key={row.label} style={styles.factRow}>
                  <Ionicons name={row.icon} size={15} color={palette.primary} />
                  <View style={styles.factText}>
                    <AppText variant="label">{row.label}</AppText>
                    <AppText variant="caption" tone="muted">
                      {row.value}
                    </AppText>
                  </View>
                </View>
              ))}
              {agency.website ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open the agency website"
                  onPress={() => {
                    const url = /^https?:\/\//i.test(agency.website as string)
                      ? (agency.website as string)
                      : `https://${agency.website}`;
                    void Linking.openURL(url);
                  }}
                  style={({ pressed }) => [styles.factRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name="globe-outline" size={15} color={palette.primary} />
                  <View style={styles.factText}>
                    <AppText variant="label">Website</AppText>
                    <AppText variant="caption" tone="primary">
                      {agency.website}
                    </AppText>
                  </View>
                </Pressable>
              ) : null}
              {agency.contactPhone ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Call the agency"
                  onPress={() => {
                    void Linking.openURL(`tel:${(agency.contactPhone as string).replace(/\s+/g, '')}`);
                  }}
                  style={({ pressed }) => [styles.factRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name="call-outline" size={15} color={palette.primary} />
                  <View style={styles.factText}>
                    <AppText variant="label">Phone</AppText>
                    <AppText variant="caption" tone="primary">
                      {agency.contactPhone}
                    </AppText>
                  </View>
                </Pressable>
              ) : null}
            </Card>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  hero: { gap: space.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  identityText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  baseCity: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  about: { lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  section: { gap: space.lg },
  sectionHead: { gap: space.xs },
  planCard: { overflow: 'hidden' },
  planCover: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  planBody: { padding: space.lg, gap: space.sm },
  planFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xs,
  },
  planMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  facts: { gap: space.md },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  factText: { flex: 1, gap: 1 },
  empty: { alignItems: 'flex-start', gap: space.sm },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorCard: { gap: space.sm, alignItems: 'flex-start' },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
