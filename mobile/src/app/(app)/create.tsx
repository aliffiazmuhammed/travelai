import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { generateTripStream, type GenerationProgress } from '@/api/generation';
import { CalendarSheet } from '@/components/CalendarSheet';
import { GenerationView } from '@/components/GenerationView';
import { goToTab } from '@/navigation/tabs';
import {
  BUDGET_PRESETS,
  DESTINATION_IDEAS,
  GROUP_OPTIONS,
  INTEREST_OPTIONS,
  MAX_TRIP_DAYS,
  PACE_OPTIONS,
  buildGenerationInput,
  formatDateRange,
  formatIsoDate,
  hasErrors,
  todayIso,
  validateBrief,
  type TripBrief,
} from '@/lib/tripBrief';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen, TextField } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Phase = 'brief' | 'generating' | 'failed';

const MAX_INTERESTS = 5;

const INITIAL_BRIEF: TripBrief = {
  destination: '',
  startDate: todayIso(),
  days: 5,
  group: 'Couple',
  budget: '25000',
  interests: [],
  pace: 'balanced',
};

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="caption" tone="primary" style={styles.step}>
          STEP {step}
        </AppText>
        <AppText variant="heading">{title}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ChoiceChip({
  label,
  caption,
  active,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  caption?: string;
  active: boolean;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? `${palette.primary}12` : palette.card,
          borderColor: active ? palette.primary : palette.border,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={active ? palette.primary : palette.mutedForeground}
        />
      ) : null}
      <View style={styles.chipText}>
        <AppText variant="label" tone={active ? 'primary' : 'default'}>
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" tone="muted">
            {caption}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CreateScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mounted = useRef(true);

  const [phase, setPhase] = useState<Phase>('brief');
  const [brief, setBrief] = useState<TripBrief>(INITIAL_BRIEF);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress>({
    stage: 1,
    progress: 8,
    message: 'Reading your brief and checking the season…',
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const errors = useMemo(() => validateBrief(brief), [brief]);
  const showErrors = submitted;
  const budgetValue = Number(brief.budget);
  const perDay =
    Number.isFinite(budgetValue) && budgetValue > 0
      ? Math.round(budgetValue / Math.max(brief.days, 1))
      : null;

  const update = (patch: Partial<TripBrief>) => setBrief((prev) => ({ ...prev, ...patch }));

  const toggleInterest = (value: string) => {
    setBrief((prev) => {
      if (prev.interests.includes(value)) {
        return { ...prev, interests: prev.interests.filter((item) => item !== value) };
      }
      if (prev.interests.length >= MAX_INTERESTS) return prev;
      return { ...prev, interests: [...prev.interests, value] };
    });
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    goToTab('explore');
  };

  const start = () => {
    setSubmitted(true);
    if (hasErrors(validateBrief(brief))) return;

    setFailure(null);
    setProgress({
      stage: 1,
      progress: 8,
      message: 'Reading your brief and checking the season…',
    });
    setPhase('generating');

    void (async () => {
      try {
        const trip = await generateTripStream(buildGenerationInput(brief), {
          onProgress: setProgress,
        });
        queryClient.invalidateQueries({ queryKey: ['my-trips'] });
        if (mounted.current) {
          router.replace({ pathname: '/my-trip/[id]', params: { id: trip._id } });
        }
      } catch (error) {
        if (!mounted.current) return;
        setFailure(
          error instanceof Error
            ? error.message
            : 'The plan could not be finished. Give it another try.'
        );
        setPhase('failed');
      }
    })();
  };

  const topRow = (
    <View style={styles.topRow}>
      {phase === 'generating' ? (
        <View style={styles.backSpacer} />
      ) : (
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
      )}
      <AppText variant="title" tone="primary" style={styles.wordmark}>
        waytowalk
      </AppText>
    </View>
  );

  if (phase === 'generating') {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <GenerationView
          destination={brief.destination}
          days={brief.days}
          progress={progress}
        />
      </Screen>
    );
  }

  if (phase === 'failed') {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.failureCard}>
            <View style={[styles.failureIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons name="cloud-offline-outline" size={26} color={palette.destructive} />
            </View>
            <AppText variant="title">The plan didn’t finish</AppText>
            <AppText tone="muted">
              {failure ||
                'Something interrupted the planner. Your brief is still here, so nothing is lost.'}
            </AppText>
            <View style={styles.failureActions}>
              <Button label="Try again" onPress={start} />
              <Button
                label="Edit the brief"
                variant="ghost"
                onPress={() => setPhase('brief')}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
    >
      {topRow}

      <View style={styles.page}>
        <View style={styles.hero}>
          <AppText variant="caption" tone="muted" style={styles.eyebrow}>
            PLAN A TRIP
          </AppText>
          <AppText variant="display">Where to next?</AppText>
          <AppText tone="muted">
            A handful of details and we’ll sketch the days — timings, food stops, stays and all.
            You can reshape it afterwards.
          </AppText>
        </View>

        <Section step={1} title="The place" hint="A city, a coast, a whole region.">
          <TextField
            label="Destination"
            placeholder="e.g. Udaipur, Bali, the Konkan coast"
            value={brief.destination}
            onChangeText={(value) => update({ destination: value })}
            error={showErrors ? errors.destination : undefined}
            autoCapitalize="words"
            returnKeyType="done"
          />
          <View style={styles.chipWrap}>
            {DESTINATION_IDEAS.map((idea) => (
              <Pressable
                key={idea.value}
                accessibilityRole="button"
                accessibilityState={{ selected: brief.destination === idea.value }}
                onPress={() => update({ destination: idea.value })}
                style={({ pressed }) => [
                  styles.pillChip,
                  {
                    backgroundColor:
                      brief.destination === idea.value
                        ? `${palette.primary}12`
                        : palette.muted,
                    borderColor:
                      brief.destination === idea.value ? palette.primary : 'transparent',
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  tone={brief.destination === idea.value ? 'primary' : 'default'}
                >
                  {idea.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section step={2} title="When" hint="The plan starts on the day you set off.">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose start date"
            onPress={() => setCalendarOpen(true)}
            style={({ pressed }) => [
              styles.dateField,
              {
                backgroundColor: palette.card,
                borderColor: errors.startDate && showErrors ? palette.destructive : palette.border,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
          >
            <View style={[styles.dateIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="calendar-outline" size={18} color={palette.primary} />
            </View>
            <View style={styles.dateText}>
              <AppText variant="caption" tone="muted">
                Setting off
              </AppText>
              <AppText variant="bodyStrong">{formatIsoDate(brief.startDate)}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
          </Pressable>

          <View style={styles.lengthRow}>
            <View style={styles.lengthText}>
              <AppText variant="bodyStrong">
                {brief.days} {brief.days === 1 ? 'day' : 'days'}
              </AppText>
              <AppText variant="caption" tone="muted">
                {formatDateRange(brief.startDate, brief.days)}
              </AppText>
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One day fewer"
                disabled={brief.days <= 1}
                onPress={() => update({ days: Math.max(brief.days - 1, 1) })}
                style={({ pressed }) => [
                  styles.stepButton,
                  {
                    backgroundColor: palette.muted,
                    opacity: brief.days <= 1 ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="remove" size={18} color={palette.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One day more"
                disabled={brief.days >= MAX_TRIP_DAYS}
                onPress={() => update({ days: Math.min(brief.days + 1, MAX_TRIP_DAYS) })}
                style={({ pressed }) => [
                  styles.stepButton,
                  {
                    backgroundColor: palette.muted,
                    opacity: brief.days >= MAX_TRIP_DAYS ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="add" size={18} color={palette.foreground} />
              </Pressable>
            </View>
          </View>
        </Section>

        <Section step={3} title="Who’s coming" hint="We tune the pace and stays to the group.">
          <View style={styles.groupGrid}>
            {GROUP_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                caption={option.caption}
                icon={option.icon}
                active={brief.group === option.value}
                onPress={() => update({ group: option.value })}
              />
            ))}
          </View>
        </Section>

        <Section step={4} title="Budget" hint="A rough figure per person is plenty.">
          <TextField
            label="Per person, in rupees"
            placeholder="25000"
            keyboardType="number-pad"
            value={brief.budget}
            onChangeText={(value) => update({ budget: value.replace(/[^0-9]/g, '') })}
            error={showErrors ? errors.budget : undefined}
            hint={
              perDay
                ? `Around ₹${perDay.toLocaleString('en-IN')} a day for ${brief.days} ${
                    brief.days === 1 ? 'day' : 'days'
                  }.`
                : undefined
            }
            maxLength={7}
          />
          <View style={styles.chipWrap}>
            {BUDGET_PRESETS.map((preset) => {
              const active = Number(brief.budget) === preset;
              return (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => update({ budget: String(preset) })}
                  style={({ pressed }) => [
                    styles.pillChip,
                    {
                      backgroundColor: active ? `${palette.primary}12` : palette.muted,
                      borderColor: active ? palette.primary : 'transparent',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <AppText variant="caption" tone={active ? 'primary' : 'default'}>
                    ₹{preset >= 100000 ? `${preset / 100000}L` : `${preset / 1000}k`}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          step={5}
          title="What you enjoy"
          hint={`Choose up to ${MAX_INTERESTS}.`}
        >
          <View style={styles.chipWrap}>
            {INTEREST_OPTIONS.map((option) => {
              const active = brief.interests.includes(option.value);
              const atLimit = !active && brief.interests.length >= MAX_INTERESTS;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: atLimit }}
                  disabled={atLimit}
                  onPress={() => toggleInterest(option.value)}
                  style={({ pressed }) => [
                    styles.pillChip,
                    styles.interestChip,
                    {
                      backgroundColor: active ? `${palette.primary}12` : palette.muted,
                      borderColor: active ? palette.primary : 'transparent',
                      opacity: atLimit ? 0.4 : pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  {active ? (
                    <Ionicons name="checkmark" size={13} color={palette.primary} />
                  ) : null}
                  <AppText variant="caption" tone={active ? 'primary' : 'default'}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {showErrors && errors.interests ? (
            <AppText variant="caption" tone="danger">
              {errors.interests}
            </AppText>
          ) : null}
        </Section>

        <Section step={6} title="How full the days feel" hint="You can adjust this later.">
          <View style={styles.paceRow}>
            {PACE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: brief.pace === option.value }}
                onPress={() => update({ pace: option.value })}
                style={({ pressed }) => [
                  styles.paceCard,
                  {
                    backgroundColor:
                      brief.pace === option.value ? `${palette.primary}12` : palette.card,
                    borderColor: brief.pace === option.value ? palette.primary : palette.border,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <AppText variant="label" tone={brief.pace === option.value ? 'primary' : 'default'}>
                  {option.label}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {option.caption}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Section>

        <View style={styles.footer}>
          <Button
            label="Build my plan"
            size="lg"
            icon={<Ionicons name="sparkles" size={17} color="#ffffff" />}
            onPress={start}
          />
          <AppText variant="caption" tone="muted" style={styles.footerNote}>
            Usually under a minute. The plan lands in your trips, private until you share it.
          </AppText>
          <Button
            label="Rather borrow a finished plan?"
            variant="ghost"
            size="sm"
            onPress={() => goToTab('explore')}
          />
        </View>
      </View>

      <CalendarSheet
        visible={calendarOpen}
        value={brief.startDate}
        minIso={todayIso()}
        onSelect={(iso) => update({ startDate: iso })}
        onClose={() => setCalendarOpen(false)}
      />
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
  backSpacer: { width: 36, height: 36 },
  wordmark: { letterSpacing: -0.4 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  hero: { gap: space.sm },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  section: { gap: space.md },
  sectionHead: { gap: 2 },
  step: { letterSpacing: 1.2, fontFamily: fontFamily.semibold, fontSize: 11 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  interestChip: { minHeight: 36 },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  dateIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { flex: 1, gap: 1 },
  lengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  lengthText: { gap: 2, flexShrink: 1 },
  stepper: { flexDirection: 'row', gap: space.sm },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  chipText: { flex: 1, gap: 1 },
  paceRow: { flexDirection: 'row', gap: space.sm },
  paceCard: {
    flex: 1,
    gap: 2,
    minHeight: 72,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  footer: { gap: space.md, alignItems: 'stretch' },
  footerNote: { textAlign: 'center' },
  failureCard: { alignItems: 'flex-start', gap: space.sm },
  failureIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  failureActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
