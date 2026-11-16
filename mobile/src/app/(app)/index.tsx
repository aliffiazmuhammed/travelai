import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/SessionProvider';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  AvatarStack,
  Button,
  Card,
  NAV_BOTTOM_SPACE,
  NavShell,
  PillTabs,
  Screen,
  Skeleton,
  type NavTab,
  type PillTabItem,
} from '@/ui';

type Filter = 'all' | 'trips' | 'agencies' | 'people';

const FILTERS: readonly PillTabItem<Filter>[] = [
  { key: 'all', label: 'All', icon: 'grid-outline' },
  { key: 'trips', label: 'Trips', icon: 'map-outline' },
  { key: 'agencies', label: 'Agencies', icon: 'business-outline' },
  { key: 'people', label: 'People', icon: 'people-outline' },
];

const CREW = [{ name: 'Ana Souza' }, { name: 'Ravi Menon' }, { name: 'Mira Chen' }, { name: 'Tomás Alves' }];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="caption" tone="muted" style={styles.eyebrow}>
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

/** Temporary lab: exercises the Phase 1a primitives until the real screens land. */
export default function IndexRoute() {
  const { palette } = useTheme();
  const { user, signOut } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [nav, setNav] = useState<NavTab>('explore');
  const [created, setCreated] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View style={styles.root}>
      <Screen
        scroll
        contentContainerStyle={{ paddingTop: space.md, paddingBottom: NAV_BOTTOM_SPACE + space.lg, gap: space.xxl }}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={[styles.chip, { backgroundColor: palette.muted }]}>
              <AppText variant="caption" tone="primary" style={styles.chipText}>
                Phase 1b · component lab
              </AppText>
            </View>
            <Button
              label="Sign out"
              variant="ghost"
              size="sm"
              loading={signingOut}
              onPress={handleSignOut}
            />
          </View>
          <AppText variant="display">waytowalk</AppText>
          <AppText tone="muted">
            Signed in as {user?.name ?? user?.email}. The primitives behind the hybrid shell; Explore
            and trip days come next.
          </AppText>
        </View>

        <Section title="Typography">
          <View style={styles.typeStack}>
            <AppText variant="display">A slower kind of travel</AppText>
            <AppText variant="title">Sintra in slow motion</AppText>
            <AppText variant="heading">Four days, one long lunch</AppText>
            <AppText>Body copy carries the practical detail: days, pace, who is holding the trip and what is still open.</AppText>
            <AppText variant="label">Label · 4 days · 2 spots left</AppText>
            <AppText variant="caption" tone="muted">
              Caption · Held by Mira · Last updated today
            </AppText>
          </View>
        </Section>

        <Section title="Buttons">
          <View style={styles.row}>
            <Button label="Start planning" onPress={() => {}} />
            <Button label="Ask to join" variant="accent" onPress={() => {}} />
          </View>
          <View style={styles.row}>
            <Button label="Save trip" variant="secondary" onPress={() => {}} />
            <Button label="Not now" variant="ghost" onPress={() => {}} />
          </View>
          <View style={styles.row}>
            <Button label="Small" size="sm" onPress={() => {}} />
            <Button label="Loading" size="sm" loading />
            <Button label="Disabled" size="sm" disabled onPress={() => {}} />
          </View>
        </Section>

        <Section title="Filters">
          <PillTabs items={FILTERS} value={filter} onChange={setFilter} />
          <AppText variant="caption" tone="muted">
            Selected: {filter}
          </AppText>
        </Section>

        <Section title="Crew">
          <View style={styles.crewRow}>
            <AvatarStack avatars={CREW} max={3} size={34} />
            <AppText variant="label" tone="muted">
              4 travellers
            </AppText>
          </View>
        </Section>

        <Section title="Trip card">
          <Card style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitle}>
                <AppText variant="heading">Sintra in slow motion</AppText>
                <AppText variant="caption" tone="muted">
                  4 days · Portugal · 2 spots left
                </AppText>
              </View>
              <View style={[styles.dateChip, { backgroundColor: palette.secondary }]}>
                <AppText variant="caption" style={{ color: palette.secondaryForeground }}>
                  12–15 Nov
                </AppText>
              </View>
            </View>
            <View style={[styles.photo, { backgroundColor: palette.primaryGlow }]}>
              <Ionicons name="image-outline" size={30} color={palette.primary} />
            </View>
            <View style={styles.cardBottom}>
              <AvatarStack avatars={CREW} max={3} ringColor={palette.card} />
              <Button label="Ask to join" size="sm" variant="accent" onPress={() => {}} />
            </View>
            <AppText variant="body" tone="muted">
              Held by Mira · Slow walks, bakery mornings and one very long lunch.
            </AppText>
          </Card>
        </Section>

        <Section title="Loading states">
          <Card style={styles.card}>
            <View style={styles.crewRow}>
              <Skeleton width={44} height={44} radius={radius.pill} />
              <View style={styles.skeletonLines}>
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
            <Skeleton height={140} radius={radius.xl} />
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
          </Card>
        </Section>

        <Section title="Navigation">
          <AppText tone="muted">
            The floating shell is pinned below. Tap a destination or the coral create button; the count is wired.
          </AppText>
          <AppText variant="label" tone="primary">
            Create pressed {created} {created === 1 ? 'time' : 'times'}
          </AppText>
        </Section>
      </Screen>

      <NavShell
        active={nav}
        onSelect={setNav}
        onCreatePress={() => setCreated((count) => count + 1)}
        chatBadge={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: space.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { fontFamily: fontFamily.medium, letterSpacing: 0.3 },
  section: { gap: space.md },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  typeStack: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: { gap: space.md, padding: space.lg },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardTitle: { flex: 1, gap: 2 },
  dateChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  photo: {
    height: 150,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletonLines: { flex: 1, gap: 6 },
});
