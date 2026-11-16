import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { GenerationProgress } from '@/api/generation';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';

const STAGES = [
  'Reading the season',
  'Shaping your days',
  'Finding food and stays',
  'Balancing the budget',
  'Checking the details',
] as const;

interface GenerationViewProps {
  destination: string;
  days: number;
  progress: GenerationProgress;
}

export function GenerationView({ destination, days, progress }: GenerationViewProps) {
  const { palette } = useTheme();
  const [width] = useState(() => new Animated.Value(progress.progress));

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress.progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress.progress, width]);

  return (
    <View style={styles.page}>
      <View style={[styles.badge, { backgroundColor: `${palette.primary}12` }]}>
        <Ionicons name="sparkles" size={30} color={palette.primary} />
      </View>

      <View style={styles.headline}>
        <AppText variant="caption" tone="muted" style={styles.eyebrow}>
          BUILDING YOUR PLAN
        </AppText>
        <AppText variant="display">
          {days} days in {destination.trim()}
        </AppText>
        <AppText tone="muted">{progress.message}</AppText>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <AppText variant="label">Getting there</AppText>
          <AppText variant="label" tone="primary">
            {Math.round(progress.progress)}%
          </AppText>
        </View>
        <View style={[styles.track, { backgroundColor: palette.muted }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: palette.primary,
                width: width.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        <View style={styles.stages}>
          {STAGES.map((label, index) => {
            const done = progress.stage > index + 1;
            const current = !done && progress.stage === index + 1;
            return (
              <View key={label} style={styles.stage}>
                <View
                  style={[
                    styles.stageDot,
                    {
                      backgroundColor: done
                        ? palette.primary
                        : current
                          ? `${palette.primary}22`
                          : palette.muted,
                    },
                  ]}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={12} color={palette.primaryForeground} />
                  ) : (
                    <View
                      style={[
                        styles.stageInner,
                        { backgroundColor: current ? palette.primary : palette.mutedForeground },
                      ]}
                    />
                  )}
                </View>
                <AppText
                  variant={current ? 'label' : 'body'}
                  tone={done || current ? 'default' : 'muted'}
                >
                  {label}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>

      <AppText variant="caption" tone="muted" style={styles.note}>
        Keep this screen open while we work. It usually takes under a minute, and the finished
        plan lands straight in your trips.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { gap: space.sm },
  eyebrow: { letterSpacing: 1.2 },
  progressCard: { gap: space.md },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  stages: { gap: space.sm, marginTop: space.xs },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageInner: { width: 6, height: 6, borderRadius: radius.pill },
  note: { lineHeight: 18 },
});
