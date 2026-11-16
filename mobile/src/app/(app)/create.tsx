import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

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
  type BriefErrors,
  type TripBrief,
} from '@/lib/tripBrief';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen, TextField } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Phase = 'brief' | 'generating' | 'failed';
type Step = 1 | 2 | 3;

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

const STEP_COPY: Record<Step, { title: string; intro: string }> = {
  1: {
    title: 'Where to next?',
    intro: 'A city, a coast, a whole region — tell us where and when, and we’ll sketch the days.',
  },
  2: {
    title: 'Who’s coming?',
    intro: 'We tune the pace, the stays and the food stops to the people on the trip.',
  },
  3: {
    title: 'What you enjoy?',
    intro: 'Pick the things worth planning around. The rest of the days fill themselves in.',
  },
};

function stepHasErrors(step: Step, errors: BriefErrors): boolean {
  if (step === 1) return Boolean(errors.destination || errors.startDate);
  if (step === 2) return Boolean(errors.budget);
  return Boolean(errors.interests);
}

function FieldHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.fieldHead}>
      <AppText variant="heading">{title}</AppText>
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function ChoiceChip({
  label,
  caption,
  active,
  icon,
  onPress,
}: {
  label: string;
  caption?: string;
  active: boolean;
  icon?: IconName;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? `${palette.primary}12` : palette.card,
          borderColor: active ? palette.primary : palette.border,
          opacity: pressed ? 0.8 : 1,
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

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={14} color={palette.mutedForeground} />
      <AppText variant="caption" tone="muted" style={styles.summaryLabel}>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={2} style={styles.summaryValue}>
        {value}
      </AppText>
    </View>
  );
}

export default function CreateScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [phase, setPhase] = useState<Phase>('brief');
  const [step, setStep] = useState<Step>(1);
  const [brief, setBrief] = useState<TripBrief>(INITIAL_BRIEF);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
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
  const showErrors = attempted;
  const budgetValue = Number(brief.budget);
  const perDay =
    Number.isFinite(budgetValue) && budgetValue > 0
      ? Math.round(budgetValue / Math.max(brief.days, 1))
      : null;
  const paceLabel = PACE_OPTIONS.find((option) => option.value === brief.pace)?.label ?? 'Balanced';

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

  const goToStep = (next: Step) => {
    setStep(next);
    setAttempted(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const goBack = () => {
    if (step > 1) {
      goToStep((step - 1) as Step);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    goToTab('explore');
  };

  const advance = () => {
    setAttempted(true);
    if (stepHasErrors(step, errors)) return;
    goToStep((step + 1) as Step);
  };

  const start = () => {
    const all = validateBrief(brief);
    if (hasErrors(all)) {
      setAttempted(true);
      setStep(all.destination || all.startDate ? 1 : all.budget ? 2 : 3);
      return;
    }

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
          accessibilityLabel={step > 1 ? 'Previous step' : 'Back'}
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
                label="Back to the brief"
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
      scrollRef={scrollRef}
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
    >
      {topRow}

      <View style={styles.page}>
        <View style={styles.progress}>
          <View style={styles.track}>
            {([1, 2, 3] as const).map((value) => (
              <View
                key={value}
                style={[
                  styles.segment,
                  { backgroundColor: value <= step ? palette.primary : palette.muted },
                ]}
              />
            ))}
          </View>
          <AppText variant="caption" tone="muted" style={styles.progressLabel}>
            Step {step} of 3
          </AppText>
        </View>

        <View style={styles.hero}>
          <AppText variant="display">{STEP_COPY[step].title}</AppText>
          <AppText tone="muted">{STEP_COPY[step].intro}</AppText>
        </View>

        {step === 1 ? (
          <View style={styles.stepBody}>
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
              {DESTINATION_IDEAS.map((idea) => {
                const active = brief.destination === idea.value;
                return (
                  <Pressable
                    key={idea.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => update({ destination: idea.value })}
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
                      {idea.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose start date"
              onPress={() => setCalendarOpen(true)}
              style={({ pressed }) => [
                styles.dateField,
                {
                  backgroundColor: palette.card,
                  borderColor:
                    errors.startDate && showErrors ? palette.destructive : palette.border,
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
            {showErrors && errors.startDate ? (
              <AppText variant="caption" tone="danger">
                {errors.startDate}
              </AppText>
            ) : null}

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
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepBody}>
            <View style={styles.fieldGroup}>
              <FieldHead title="Travelling as" hint="We plan around who’s on the trip." />
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
            </View>

            <View style={styles.fieldGroup}>
              <FieldHead title="Budget" hint="A rough figure per person is plenty." />
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
            </View>

            <View style={styles.fieldGroup}>
              <FieldHead title="How full the days feel" hint="You can adjust this later." />
              <View style={styles.paceRow}>
                {PACE_OPTIONS.map((option) => {
                  const active = brief.pace === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => update({ pace: option.value })}
                      style={({ pressed }) => [
                        styles.paceCard,
                        {
                          backgroundColor: active ? `${palette.primary}12` : palette.card,
                          borderColor: active ? palette.primary : palette.border,
                          opacity: pressed ? 0.82 : 1,
                        },
                      ]}
                    >
                      <AppText variant="label" tone={active ? 'primary' : 'default'}>
                        {option.label}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {option.caption}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepBody}>
            <View style={styles.fieldGroup}>
              <FieldHead
                title="Pick a few"
                hint={`Choose up to ${MAX_INTERESTS}. These steer what the days are built around.`}
              />
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
            </View>

            <Card style={styles.summary}>
              <AppText variant="bodyStrong">Your trip so far</AppText>
              <SummaryRow
                icon="location-outline"
                label="Where"
                value={brief.destination.trim() || 'Not set yet'}
              />
              <SummaryRow
                icon="calendar-outline"
                label="When"
                value={`${formatDateRange(brief.startDate, brief.days)} · ${brief.days} ${
                  brief.days === 1 ? 'day' : 'days'
                }`}
              />
              <SummaryRow
                icon="people-outline"
                label="Crew"
                value={`${brief.group} · ${paceLabel}`}
              />
              <SummaryRow
                icon="wallet-outline"
                label="Budget"
                value={
                  budgetValue > 0
                    ? `₹${budgetValue.toLocaleString('en-IN')} per person`
                    : 'Not set yet'
                }
              />
            </Card>
          </View>
        ) : null}

        <View style={styles.footer}>
          {step === 3 ? (
            <>
              <Button
                label="Build my plan"
                size="lg"
                icon={<Ionicons name="sparkles" size={17} color="#ffffff" />}
                onPress={start}
              />
              <AppText variant="caption" tone="muted" style={styles.footerNote}>
                Usually under a minute. The plan lands in your trips, private until you share it.
              </AppText>
            </>
          ) : (
            <Button
              label="Continue"
              size="lg"
              icon={<Ionicons name="arrow-forward" size={17} color="#ffffff" />}
              onPress={advance}
            />
          )}
          {step === 1 ? (
            <Button
              label="Rather borrow a finished plan?"
              variant="ghost"
              size="sm"
              onPress={() => goToTab('explore')}
            />
          ) : null}
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
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  track: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill },
  progressLabel: { fontFamily: fontFamily.semibold, letterSpacing: 0.4 },
  hero: { gap: space.sm },
  stepBody: { gap: space.xl },
  fieldGroup: { gap: space.md },
  fieldHead: { gap: 2 },
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
  summary: { gap: space.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  summaryLabel: { width: 54 },
  summaryValue: { flex: 1 },
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
