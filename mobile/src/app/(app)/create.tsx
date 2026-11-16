import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const STEPS: { icon: IconName; label: string; caption: string }[] = [
  {
    icon: 'location-outline',
    label: 'Pick a place',
    caption: 'A city, a coast, a stretch of mountains — whatever is calling.',
  },
  {
    icon: 'calendar-outline',
    label: 'Set the dates and company',
    caption: 'Tell us how long you have and who is coming with you.',
  },
  {
    icon: 'sparkles-outline',
    label: 'Get a day-by-day plan',
    caption: 'A full itinerary you can shape, share and publish when it is ready.',
  },
];

export default function CreateScreen() {
  const { palette } = useTheme();
  const router = useRouter();

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.foreground} />
        </Pressable>
        <AppText variant="title" tone="primary" style={styles.wordmark}>
          waytowalk
        </AppText>
      </View>

      <View style={styles.page}>
        <View style={styles.hero}>
          <AppText variant="caption" tone="muted" style={styles.eyebrow}>
            PLAN A TRIP
          </AppText>
          <AppText variant="display">Start with a place. Leave with a plan.</AppText>
          <AppText tone="muted">
            Planning from the app is the next piece we’re building. Until it lands, borrow a
            finished plan from Explore and make it your own.
          </AppText>
        </View>

        <Card style={styles.steps}>
          <AppText variant="caption" tone="muted" style={styles.stepsLabel}>
            WHAT’S COMING
          </AppText>
          {STEPS.map((step, index) => (
            <View key={step.label} style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: palette.muted }]}>
                <Ionicons name={step.icon} size={17} color={palette.primary} />
              </View>
              <View style={styles.stepText}>
                <AppText variant="bodyStrong">
                  {index + 1}. {step.label}
                </AppText>
                <AppText variant="caption" tone="muted" style={styles.stepCaption}>
                  {step.caption}
                </AppText>
              </View>
            </View>
          ))}
        </Card>

        <Button
          label="Browse trips to borrow"
          icon={<Ionicons name="compass-outline" size={17} color="#ffffff" />}
          onPress={() => router.navigate('/')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  hero: { gap: space.sm },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  steps: { gap: space.lg },
  stepsLabel: { fontFamily: fontFamily.semibold, letterSpacing: 1.2, fontSize: 10 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, gap: 2 },
  stepCaption: { lineHeight: 18 },
});
