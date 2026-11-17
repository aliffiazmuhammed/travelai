import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { submitEnquiry, type EnquiryAcknowledgement, type EnquiryBudgetBand } from '@/api/enquiries';
import { useSession } from '@/auth/SessionProvider';
import { CalendarSheet } from '@/components/CalendarSheet';
import { FilterSheet } from '@/components/FilterSheet';
import { BUDGET_BANDS, formatDay } from '@/lib/enquiries';
import { todayIso } from '@/lib/tripBrief';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Button,
  Card,
  InlineError,
  Screen,
  TextField,
} from '@/ui';

function Counter({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.counterRow}>
      <View style={styles.counterText}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      </View>
      <View style={styles.counterControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`One fewer ${label.toLowerCase()}`}
          accessibilityState={{ disabled: value <= min }}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [
            styles.counterButton,
            {
              backgroundColor: palette.muted,
              opacity: value <= min ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="remove" size={16} color={palette.foreground} />
        </Pressable>
        <AppText variant="bodyStrong" style={styles.counterValue}>
          {value}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`One more ${label.toLowerCase()}`}
          accessibilityState={{ disabled: value >= max }}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [
            styles.counterButton,
            {
              backgroundColor: palette.muted,
              opacity: value >= max ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="add" size={16} color={palette.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  caption,
  value,
  onPress,
}: {
  label: string;
  caption: string;
  value: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggleRow, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View
        style={[
          styles.check,
          value
            ? { backgroundColor: palette.primary, borderColor: palette.primary }
            : { borderColor: palette.border },
        ]}
      >
        {value ? (
          <Ionicons name="checkmark" size={13} color={palette.primaryForeground} />
        ) : null}
      </View>
      <View style={styles.toggleText}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {caption}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function AgencyEnquiryScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const params = useLocalSearchParams<{
    slug?: string | string[];
    packageId?: string | string[];
    packageTitle?: string | string[];
    agencyName?: string | string[];
  }>();
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  const slug = first(params.slug);
  const packageId = first(params.packageId);
  const packageTitle = first(params.packageTitle);
  const agencyName = first(params.agencyName) || 'the agency';

  const [name, setName] = useState(user?.name || user?.label || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flexible, setFlexible] = useState(false);
  const [budgetBand, setBudgetBand] = useState<EnquiryBudgetBand | ''>('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [calendar, setCalendar] = useState<'start' | 'end' | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EnquiryAcknowledgement | null>(null);

  const minIso = todayIso();
  const budgetOptions = useMemo(
    () => [
      { value: '', label: 'Rather not say' },
      ...BUDGET_BANDS.map((band) => ({ value: band.value, label: band.label })),
    ],
    []
  );
  const budgetLabelText =
    BUDGET_BANDS.find((band) => band.value === budgetBand)?.label ?? 'Choose a budget (optional)';

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/');
  };

  async function submit() {
    if (submitting) return;
    if (!slug) {
      setError('This agency could not be identified. Go back and try again.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Tell the agency your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter an email address the agency can reply to.');
      return;
    }
    if (!flexible && !startDate) {
      setError('Choose a start date, or mark your dates as flexible.');
      return;
    }
    if (!flexible && endDate && endDate < startDate) {
      setError('The end date needs to come after the start date.');
      return;
    }
    if (message.trim().length < 20) {
      setError('Tell the agency a little about the trip you have in mind (at least 20 characters).');
      return;
    }
    if (!consent) {
      setError('Please agree to share your details with this agency before sending.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const acknowledgement = await submitEnquiry(slug, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        adults,
        children,
        ...(flexible
          ? { flexible: true }
          : { startDate, ...(endDate ? { endDate } : {}) }),
        ...(budgetBand ? { budgetBand } : {}),
        message: message.trim(),
        ...(packageId ? { packageId } : {}),
        consent: true,
      });
      setSent(acknowledgement);
      void queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      void queryClient.invalidateQueries({ queryKey: ['enquiry-summary'] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The enquiry could not be sent right now.'
      );
    } finally {
      setSubmitting(false);
    }
  }

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

  if (sent) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.sentCard}>
            <View style={[styles.sentIcon, { backgroundColor: `${palette.primary}14` }]}>
              <Ionicons name="paper-plane-outline" size={26} color={palette.primary} />
            </View>
            <AppText variant="title">On its way to {agencyName}</AppText>
            <AppText tone="muted">
              Your reply will land in Enquiries, not your email inbox. {agencyName} usually
              answers within a day or two.
            </AppText>
            {packageTitle ? (
              <View style={[styles.context, { backgroundColor: palette.muted }]}>
                <Ionicons name="map-outline" size={15} color={palette.primary} />
                <AppText variant="caption" numberOfLines={2} style={styles.contextText}>
                  {packageTitle}
                </AppText>
              </View>
            ) : null}
            <Button
              label="Open the conversation"
              variant="accent"
              onPress={() => router.replace(`/enquiries/${sent.id}`)}
            />
            <Button
              label="Back to the agency"
              variant="ghost"
              onPress={() => router.replace(`/agency/${encodeURIComponent(slug)}`)}
            />
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
        <View style={styles.intro}>
          <AppText variant="label" tone="primary">
            NEW ENQUIRY
          </AppText>
          <AppText variant="title">Ask {agencyName}</AppText>
          <AppText tone="muted">
            A few details help them answer with a real plan instead of a brochure.
          </AppText>
        </View>

        {packageTitle ? (
          <Card style={styles.packageCard}>
            <View style={[styles.packageIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="map-outline" size={18} color={palette.primary} />
            </View>
            <View style={styles.packageText}>
              <AppText variant="label">About this plan</AppText>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {packageTitle}
              </AppText>
            </View>
          </Card>
        ) : null}

        <Card style={styles.form}>
          <AppText variant="label" tone="muted">
            WHO’S TRAVELLING
          </AppText>
          <TextField
            label="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Full name"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            hint="The agency answers here, but this is how they reach you if needed."
          />
          <TextField
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="Include your country code"
          />

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Counter
            label="Adults"
            hint="Ages 13 and up"
            value={adults}
            min={1}
            max={20}
            onChange={setAdults}
          />
          <Counter
            label="Children"
            hint="Ages 12 and under"
            value={children}
            min={0}
            max={20}
            onChange={setChildren}
          />
        </Card>

        <Card style={styles.form}>
          <AppText variant="label" tone="muted">
            WHEN
          </AppText>
          <View style={styles.dateRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose start date"
              onPress={() => setCalendar('start')}
              style={({ pressed }) => [
                styles.dateField,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                  opacity: flexible ? 0.5 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <AppText variant="caption" tone="muted">
                Start
              </AppText>
              <AppText variant="label">{startDate ? formatDay(startDate) : 'Any day'}</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose end date"
              onPress={() => setCalendar('end')}
              style={({ pressed }) => [
                styles.dateField,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                  opacity: flexible ? 0.5 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <AppText variant="caption" tone="muted">
                End
              </AppText>
              <AppText variant="label">{endDate ? formatDay(endDate) : 'Not decided'}</AppText>
            </Pressable>
          </View>
          <ToggleRow
            label="My dates are flexible"
            caption="Let the agency suggest the best window."
            value={flexible}
            onPress={() => {
              setFlexible((current) => {
                const next = !current;
                if (next) {
                  setStartDate('');
                  setEndDate('');
                }
                return next;
              });
            }}
          />
        </Card>

        <Card style={styles.form}>
          <AppText variant="label" tone="muted">
            THE TRIP
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a budget"
            onPress={() => setBudgetOpen(true)}
            style={({ pressed }) => [
              styles.selectField,
              { borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View style={styles.selectText}>
              <AppText variant="caption" tone="muted">
                Budget per person
              </AppText>
              <AppText variant="label" numberOfLines={1}>
                {budgetLabelText}
              </AppText>
            </View>
            <Ionicons name="chevron-down" size={16} color={palette.mutedForeground} />
          </Pressable>

          <TextField
            label="What do you have in mind?"
            value={message}
            onChangeText={setMessage}
            placeholder="Who is travelling, the places you have in mind, and anything that matters — pace, food, accessibility."
            multiline
            numberOfLines={5}
            style={styles.message}
            hint={`${message.trim().length}/20 characters minimum`}
          />

          <ToggleRow
            label="Share my details with this agency"
            caption="So they can reply to this enquiry. waytowalk sends no marketing email."
            value={consent}
            onPress={() => setConsent((current) => !current)}
          />
        </Card>

        {error ? <InlineError message={error} /> : null}

        <Button
          label="Send enquiry"
          variant="accent"
          size="lg"
          loading={submitting}
          onPress={submit}
        />
        <AppText variant="caption" tone="muted" style={styles.footnote}>
          Replies arrive in your Enquiries, inside waytowalk.
        </AppText>
      </View>

      <CalendarSheet
        visible={calendar !== null}
        value={(calendar === 'end' ? endDate || startDate : startDate) || minIso}
        minIso={calendar === 'end' && startDate ? startDate : minIso}
        onSelect={(iso) => {
          if (calendar === 'end') setEndDate(iso);
          else setStartDate(iso);
          setCalendar(null);
        }}
        onClose={() => setCalendar(null)}
      />

      <FilterSheet
        visible={budgetOpen}
        title="Budget per person"
        confirmLabel="Done"
        sections={[
          {
            key: 'budget',
            label: 'What feels comfortable?',
            options: budgetOptions,
            value: budgetBand,
          },
        ]}
        onChange={(_, value) => {
          setBudgetBand(value as EnquiryBudgetBand | '');
          setBudgetOpen(false);
        }}
        onClose={() => setBudgetOpen(false)}
      />
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
  intro: { gap: space.xs },
  packageCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  packageIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageText: { flex: 1, gap: 1 },
  form: { gap: space.md },
  divider: { height: 1 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  counterText: { flex: 1, gap: 1 },
  counterControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  counterButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: { minWidth: 22, textAlign: 'center' },
  dateRow: { flexDirection: 'row', gap: space.sm },
  dateField: {
    flex: 1,
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  toggleText: { flex: 1, gap: 1 },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectText: { flex: 1, gap: 2 },
  message: { minHeight: 118, textAlignVertical: 'top' },
  footnote: { textAlign: 'center', marginTop: -space.sm },
  sentCard: { gap: space.sm, alignItems: 'flex-start', paddingVertical: space.xl },
  sentIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  contextText: { flex: 1 },
});
