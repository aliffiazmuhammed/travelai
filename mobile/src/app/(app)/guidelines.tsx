import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const GOOD = [
  'Itineraries you actually planned or travelled, with useful day-by-day detail.',
  'Honest summaries and tags that help someone decide whether the trip fits.',
  'Photos and profile details that belong to you or that you have permission to share.',
  'Respectful notes in join requests. Say who you are and why you want to come.',
  'Corrections when a place has changed — update the trip instead of leaving stale advice.',
];

const BAD = [
  'Spam, copied itineraries presented as your own, or advertising disguised as a trip.',
  'Harassment, threats, hate speech, or targeting a traveller in requests or comments.',
  'Scams: off-platform payment requests, deposits, or anything that asks a stranger for money.',
  'Private information about someone else — home addresses, phone numbers, workplace details.',
  'Content that is illegal, sexual, or unsafe to publish to a general audience.',
];

const KEEP_CONTROL = [
  'Choose who you travel with and what you share with them.',
  'Take your time — there is no pressure to commit to a request or a reply.',
  'Trust your instincts. If something does not feel right, step back and report it.',
];

function Bullets({ items, danger = false }: { items: string[]; danger?: boolean }) {
  const { palette } = useTheme();

  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <View
            style={[
              styles.bulletDot,
              { backgroundColor: danger ? palette.destructive : palette.primary },
            ]}
          />
          <AppText tone="muted" style={styles.bulletText}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function GuidelineCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  const { palette } = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: palette.muted }]}>
          <Ionicons name={icon} size={18} color={palette.primary} />
        </View>
        <AppText variant="title" style={styles.cardTitle}>
          {title}
        </AppText>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </Card>
  );
}

export default function GuidelinesScreen() {
  const { palette } = useTheme();

  return (
    <Screen edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.foreground} />
        </Pressable>
        <AppText variant="wordmark" tone="primary">
          waytowalk
        </AppText>
      </View>

      <View style={styles.hero}>
        <AppText variant="caption" tone="primary" style={styles.eyebrow}>
          COMMUNITY
        </AppText>
        <AppText variant="display">Travel well, together.</AppText>
        <AppText tone="muted">
          A few things that keep shared trips safe and worth joining.
        </AppText>
      </View>

      <GuidelineCard icon="compass-outline" title="What belongs here">
        <AppText tone="muted">
          The gallery is a place to share real itineraries and meet travellers through
          owner-approved join requests. It is not a social feed, a marketplace, or a way to
          contact strangers directly.
        </AppText>
        <AppText tone="muted">In practice, that means:</AppText>
        <Bullets items={GOOD} />
      </GuidelineCard>

      <GuidelineCard icon="calendar-outline" title="Protect your dates">
        <AppText tone="muted">
          Publishing a trip can expose when you will be away. Use “Hide exact dates” to show
          only a month and duration.
        </AppText>
        <AppText tone="muted">
          Keep home addresses, phone numbers and workplace details out of itineraries and join
          requests. Share the dates and places you are comfortable making public — nothing more.
        </AppText>
      </GuidelineCard>

      <GuidelineCard icon="wallet-outline" title="Never send money">
        <AppText tone="muted">
          A join request is not a booking. No owner should ask you for a deposit, and waytowalk
          never handles payments between travellers.
        </AppText>
        <AppText tone="muted">
          A request to send money, gift cards or bank details off the platform is a red flag,
          however convincing the profile looks.
        </AppText>
        <View style={[styles.callout, { borderColor: palette.accent, backgroundColor: palette.card }]}>
          <Ionicons name="lock-closed-outline" size={16} color={palette.accent} style={styles.calloutIcon} />
          <View style={styles.calloutBody}>
            <AppText variant="label">waytowalk has no in-app payments between travellers.</AppText>
            <AppText variant="caption" tone="muted">
              No deposit is ever part of joining a trip. If someone asks you to pay outside the
              app, stop the conversation and report it.
            </AppText>
          </View>
        </View>
      </GuidelineCard>

      <GuidelineCard icon="shield-checkmark-outline" title="Keep control of your trip">
        <AppText tone="muted">
          Owners approve every join request. Approval grants a commenter seat only — never edit
          access. Use the block list if someone makes you uncomfortable.
        </AppText>
        <AppText tone="muted">You decide how much to share, and when to commit:</AppText>
        <Bullets items={KEEP_CONTROL} />
      </GuidelineCard>

      <GuidelineCard icon="ban-outline" title="What we remove">
        <AppText tone="muted">
          These are the things that get a trip or a profile removed from the gallery:
        </AppText>
        <Bullets items={BAD} danger />
      </GuidelineCard>

      <GuidelineCard icon="flag-outline" title="Reporting and review">
        <AppText tone="muted">
          Any signed-in traveller can report a published trip or a public profile. Choose a
          reason and add a short note if it helps. The person you report is never told who
          reported them.
        </AppText>
        <AppText tone="muted">
          A trip with three distinct open reports is hidden from the gallery automatically while
          a platform admin reviews it. The owner still has their data and sees a banner on the
          trip; an admin can restore the listing if the reports are unfounded, or de-list it
          permanently.
        </AppText>
        <AppText tone="muted">
          Reports are capped per account and one report per person per target is accepted, so
          reporting cannot be used to bury content you simply disagree with.
        </AppText>
      </GuidelineCard>

      <GuidelineCard icon="warning-outline" title="When we may act on an account">
        <AppText tone="muted">
          Repeated violations can lead to content removal, loss of publishing access, or account
          suspension. Imminent threats or illegal content may be reported to the relevant
          authorities. Decisions are recorded in the platform audit trail.
        </AppText>
      </GuidelineCard>

      <View
        style={[styles.reportCard, { borderColor: palette.accent, backgroundColor: palette.card }]}
      >
        <View style={styles.reportHead}>
          <View style={[styles.reportIcon, { backgroundColor: palette.muted }]}>
            <Ionicons name="flag-outline" size={18} color={palette.accent} />
          </View>
          <View style={styles.reportText}>
            <AppText variant="title">Something feels off?</AppText>
            <AppText variant="caption" tone="muted">
              If you see behaviour that looks unsafe, suspicious or against these guidelines,
              report it from the trip or profile page. Reporting is private.
            </AppText>
          </View>
        </View>
        <Button
          label="Browse the gallery"
          variant="secondary"
          onPress={() => router.replace('/')}
        />
      </View>

      <AppText variant="caption" tone="muted" style={styles.footer}>
        Last updated November 2026 · Reports are private — the person you report is never told
        who reported them.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  hero: { gap: space.xs, paddingTop: space.sm },
  eyebrow: { letterSpacing: 1.6 },
  card: { gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flexShrink: 1 },
  cardBody: { gap: space.sm },
  bullets: { gap: space.sm, paddingTop: space.xs },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    marginTop: 7,
  },
  bulletText: { flex: 1, lineHeight: 21 },
  callout: {
    flexDirection: 'row',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.xs,
  },
  calloutIcon: { marginTop: 2 },
  calloutBody: { flex: 1, gap: 2 },
  reportCard: {
    borderWidth: 1,
    borderRadius: radius.xxl,
    padding: space.lg,
    gap: space.md,
  },
  reportHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  reportIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportText: { flex: 1, gap: 2 },
  footer: { lineHeight: 18, paddingTop: space.xs },
});
