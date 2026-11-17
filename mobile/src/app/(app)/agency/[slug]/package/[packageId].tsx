import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchAgencyProfile } from '@/api/discovery';
import { assetUrl } from '@/config';
import { formatMoney } from '@/lib/expenses';
import { tripCoverUrl } from '@/lib/tripCover';
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

export default function AgencyPackageScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    slug?: string | string[];
    packageId?: string | string[];
  }>();
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  const slug = first(params.slug);
  const packageId = first(params.packageId);

  const agencyQuery = useQuery({
    queryKey: ['agency-profile', slug],
    queryFn: () => fetchAgencyProfile(slug),
    enabled: Boolean(slug),
    retry: 1,
  });

  const agency = agencyQuery.data;
  const plan = agency?.packages.find((entry) => entry.id === packageId) ?? null;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (slug) {
      router.navigate(`/agency/${encodeURIComponent(slug)}`);
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
          <Skeleton height={230} radius={radius.xxl} />
          <Skeleton width="70%" height={26} />
          <Skeleton height={13} />
          <Skeleton width="85%" height={13} />
          <Skeleton height={120} radius={radius.xxl} />
        </View>
      </Screen>
    );
  }

  if (!agency || agencyQuery.isError || !plan) {
    const notFound = agencyQuery.error instanceof ApiError && agencyQuery.error.status === 404;
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons name="map-outline" size={26} color={palette.destructive} />
            </View>
            <AppText variant="title">
              {notFound ? 'This agency isn’t listed' : 'This plan isn’t available'}
            </AppText>
            <AppText tone="muted">
              {notFound
                ? 'Their directory profile may be unpublished or still under review.'
                : 'It may have been taken down, or the link is a little out of date.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to Explore" onPress={() => router.navigate('/')} />
              {slug ? (
                <Button
                  label="See the agency"
                  variant="secondary"
                  onPress={() => router.navigate(`/agency/${encodeURIComponent(slug)}`)}
                />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const nights = plan.nights;
  const nightsLine =
    nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Multi-day journey';
  const priceLine = plan.pricePerPerson
    ? `${formatMoney(plan.pricePerPerson, plan.currency || 'INR')} per person`
    : 'Price on request';

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
        <Card padded={false} style={styles.hero}>
          <View style={[styles.cover, { backgroundColor: palette.muted }]}>
            <Image
              source={{
                uri: plan.coverUrl
                  ? assetUrl(plan.coverUrl)
                  : tripCoverUrl(plan.title, 1200),
              }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
            />
            <LinearGradient
              colors={['rgba(12,26,21,0)', 'rgba(12,26,21,0.55)']}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${agency.name}`}
              onPress={() => router.navigate(`/agency/${encodeURIComponent(agency.slug)}`)}
              style={({ pressed }) => [
                styles.agencyChip,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.agencyLogo, { backgroundColor: palette.secondary }]}>
                <AppText variant="caption" style={{ color: palette.secondaryForeground }}>
                  {initials(agency.name)}
                </AppText>
              </View>
              <View style={styles.agencyChipText}>
                <AppText variant="label" style={styles.onCover}>
                  {agency.name}
                </AppText>
                {agency.baseCity ? (
                  <AppText variant="caption" style={styles.onCoverMuted}>
                    {agency.baseCity}
                  </AppText>
                ) : null}
              </View>
              {agency.verified ? (
                <Ionicons name="checkmark-circle" size={16} color="#f7f3ea" />
              ) : null}
            </Pressable>
          </View>
        </Card>

        <View style={styles.intro}>
          <AppText variant="label" tone="primary">
            TRIP PACKAGE
          </AppText>
          <AppText variant="title">{plan.title}</AppText>
          {plan.summary ? <AppText tone="muted">{plan.summary}</AppText> : null}
        </View>

        <Card style={styles.facts}>
          <View style={styles.fact}>
            <Ionicons name="moon-outline" size={16} color={palette.primary} />
            <View style={styles.factText}>
              <AppText variant="label">{nightsLine}</AppText>
              <AppText variant="caption" tone="muted">
                On the road
              </AppText>
            </View>
          </View>
          <View style={[styles.factDivider, { backgroundColor: palette.border }]} />
          <View style={styles.fact}>
            <Ionicons name="pricetag-outline" size={16} color={palette.primary} />
            <View style={styles.factText}>
              <AppText variant="label">{priceLine}</AppText>
              <AppText variant="caption" tone="muted">
                Published by the agency
              </AppText>
            </View>
          </View>
        </Card>

        {plan.highlights.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="heading">Why this one sings</AppText>
            <Card style={styles.list}>
              {plan.highlights.map((line) => (
                <View key={line} style={styles.listRow}>
                  <View style={[styles.bullet, { backgroundColor: `${palette.accent}22` }]}>
                    <Ionicons name="sparkles-outline" size={13} color={palette.accent} />
                  </View>
                  <AppText style={styles.listText}>{line}</AppText>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {plan.inclusions.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="heading">What’s included</AppText>
            <View style={[styles.inclusions, { backgroundColor: `${palette.primary}0f` }]}>
              {plan.inclusions.map((line) => (
                <View key={line} style={styles.listRow}>
                  <Ionicons name="checkmark-circle" size={17} color={palette.primary} />
                  <AppText style={styles.listText}>{line}</AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Ask about this plan"
            variant="accent"
            size="lg"
            icon={<Ionicons name="chatbubble-ellipses-outline" size={17} color={palette.accentForeground} />}
            onPress={() =>
              router.push({
                pathname: '/enquiry/[slug]',
                params: {
                  slug,
                  packageId: plan.id,
                  packageTitle: plan.title,
                  agencyName: agency.name,
                },
              })
            }
          />
          <Button
            label={`See ${agency.name}`}
            variant="ghost"
            onPress={() => router.navigate(`/agency/${encodeURIComponent(agency.slug)}`)}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
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
  hero: { overflow: 'hidden' },
  cover: { height: 230, justifyContent: 'flex-end' },
  agencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    margin: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,26,21,0.45)',
  },
  agencyLogo: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agencyChipText: { gap: 0 },
  onCover: { color: '#f7f3ea' },
  onCoverMuted: { color: 'rgba(247,243,234,0.75)' },
  intro: { gap: space.xs },
  facts: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  factText: { flex: 1, gap: 1 },
  factDivider: { width: 1, alignSelf: 'stretch' },
  section: { gap: space.md },
  list: { gap: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bullet: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: { flex: 1, lineHeight: 22 },
  inclusions: { gap: space.sm, borderRadius: radius.xxl, padding: space.lg },
  actions: { gap: space.sm },
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
