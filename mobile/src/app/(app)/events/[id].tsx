import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchPublicEvent, submitEventInterest, type PublicEventDetail } from '@/api/events';
import { EVENT_KIND_LABEL } from '@/components/EventCard';
import { assetUrl } from '@/config';
import { formatMoney } from '@/lib/expenses';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  InlineError,
  PillTabs,
  Screen,
  Skeleton,
  TextField,
  type PillTabItem,
} from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;
const PHONE = /^[+()\d\s-]{7,20}$/;
const PARTY_TABS: readonly PillTabItem<string>[] = ['1', '2', '3', '4', '5', '6', '7+'].map(
  (value) => ({ key: value, label: value })
);

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: 'calendar-outline' | 'location-outline' | 'pricetag-outline' | 'people-outline';
  label: string;
  value: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: palette.muted }]}>
        <Ionicons name={icon} size={15} color={palette.primary} />
      </View>
      <View style={styles.detailText}>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        <AppText variant="bodyStrong">{value}</AppText>
      </View>
    </View>
  );
}

function InterestForm({ event }: { event: PublicEventDetail }) {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'already'>('idle');

  async function submit() {
    if (status === 'sending') return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2) return setError('Tell the agency your name.');
    if (!EMAIL.test(trimmedEmail)) return setError('Enter a valid email address.');
    if (!PHONE.test(trimmedPhone))
      return setError('Enter a phone number the agency can reach you on, with the country code.');

    Keyboard.dismiss();
    setError(null);
    setStatus('sending');
    const noteText = [`Party of ${party}.`, note.trim()].filter(Boolean).join(' ').slice(0, 500);
    try {
      await submitEventInterest(event._id, {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        ...(noteText ? { note: noteText } : {}),
      });
      setStatus('sent');
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 409 && /already/i.test(nextError.message)) {
        setStatus('already');
        return;
      }
      setError(
        nextError instanceof ApiError
          ? nextError.message
          : 'Something went wrong. Please try again.'
      );
      setStatus('idle');
    }
  }

  if (status === 'sent' || status === 'already') {
    return (
      <View style={styles.sent}>
        <View style={[styles.icon, { backgroundColor: palette.muted }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={palette.primary} />
        </View>
        <AppText variant="bodyStrong">
          {status === 'sent' ? 'You’re on the list' : 'You’re already on the list'}
        </AppText>
        <AppText tone="muted">
          The agency has your details and will reach out about a spot. You can keep browsing
          meanwhile.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <InlineError message={error} />
      <TextField
        label="Your name"
        value={name}
        onChangeText={setName}
        placeholder="Mira Chen"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        hint="Include the country code so the agency can call."
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <View style={styles.party}>
        <AppText variant="caption" tone="muted" style={styles.partyLabel}>
          PARTY SIZE
        </AppText>
        <PillTabs items={PARTY_TABS} value={party} onChange={setParty} />
      </View>
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Anything the agency should know?"
        multiline
        maxLength={400}
        style={styles.note}
      />
      <Button
        label="Ask about a spot"
        size="lg"
        variant="accent"
        loading={status === 'sending'}
        onPress={submit}
      />
      <AppText variant="caption" tone="muted">
        Your details go straight to the agency. Nothing is charged on waytowalk.
      </AppText>
    </View>
  );
}

export default function EventDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const eventQuery = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => fetchPublicEvent(eventId as string),
    enabled: Boolean(eventId),
  });

  const event = eventQuery.data;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const closedReason = !event
    ? null
    : event.ended
      ? 'This event has finished.'
      : event.closed
        ? 'The agency closed this event.'
        : event.spotsLeft === 0
          ? 'This event is full.'
          : !event.acceptingInterest
            ? 'The agency isn’t taking names for this one right now.'
            : null;

  return (
    <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
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
        <AppText variant="caption" tone="muted">
          Agency event
        </AppText>
      </View>

      {eventQuery.isPending ? (
        <>
          <Skeleton height={210} radius={radius.xxl} />
          <Skeleton width="70%" height={26} />
          <Skeleton width="45%" height={14} />
          <Skeleton height={90} radius={radius.xxl} />
        </>
      ) : null}

      {eventQuery.isError ? (
        <View style={styles.errorBlock}>
          <InlineError
            message={
              eventQuery.error instanceof Error
                ? eventQuery.error.message
                : 'We couldn’t load this event right now.'
            }
          />
          <Button label="Try again" variant="secondary" size="sm" onPress={() => eventQuery.refetch()} />
        </View>
      ) : null}

      {event ? (
        <>
          <View style={[styles.hero, { backgroundColor: palette.muted }]}>
            {event.coverUrl ? (
              <Image
                source={{ uri: assetUrl(event.coverUrl) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={250}
              />
            ) : (
              <View style={styles.heroFallback}>
                <Ionicons name="calendar-outline" size={30} color={palette.mutedForeground} />
              </View>
            )}
            <LinearGradient
              colors={['rgba(12,26,21,0.05)', 'rgba(12,26,21,0.6)']}
              locations={[0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroChips}>
              <View style={styles.glassChip}>
                <AppText variant="caption" style={styles.glassText}>
                  {EVENT_KIND_LABEL[event.kind] ?? 'Event'}
                </AppText>
              </View>
              {event.spotsLeft != null ? (
                <View style={styles.glassChip}>
                  <AppText variant="caption" style={styles.glassText}>
                    {event.spotsLeft === 0
                      ? 'Full'
                      : `${event.spotsLeft} ${event.spotsLeft === 1 ? 'spot' : 'spots'} left`}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.heroPlace}>
              <Ionicons name="location-outline" size={13} color="#ffffff" />
              <AppText variant="label" numberOfLines={1} style={styles.heroPlaceText}>
                {event.destination}
              </AppText>
            </View>
          </View>

          <View style={styles.head}>
            <AppText variant="title">{event.title}</AppText>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${event.agency.name}`}
              onPress={() =>
                router.push({ pathname: '/agency/[slug]', params: { slug: event.agency.slug } })
              }
              style={styles.agencyRow}
            >
              <Avatar name={event.agency.name} uri={event.agency.logoUrl ?? undefined} size={30} />
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.agencyName}>
                {event.agency.name}
              </AppText>
              {event.agency.verified ? (
                <Ionicons name="shield-checkmark" size={14} color={palette.primary} />
              ) : null}
              <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
            </Pressable>
          </View>

          <Card style={styles.about}>
            <AppText variant="heading">About</AppText>
            {event.summary ? <AppText tone="muted">{event.summary}</AppText> : null}
            {event.highlights.length > 0 ? (
              <View style={styles.chips}>
                {event.highlights.map((highlight) => (
                  <View
                    key={highlight}
                    style={[styles.highlight, { backgroundColor: palette.muted }]}
                  >
                    <AppText variant="caption" tone="muted">
                      {highlight}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Card style={styles.details}>
            <AppText variant="heading">The details</AppText>
            <DetailRow icon="calendar-outline" label="WHEN" value={event.dates.label} />
            <DetailRow
              icon="location-outline"
              label="WHERE"
              value={event.venue ? `${event.destination} · ${event.venue}` : event.destination}
            />
            {event.pricePerPerson != null ? (
              <DetailRow
                icon="pricetag-outline"
                label="PRICE"
                value={`${formatMoney(event.pricePerPerson, event.currency)} per person`}
              />
            ) : null}
            {event.capacity != null ? (
              <DetailRow
                icon="people-outline"
                label="GROUP"
                value={`${event.capacity} ${event.capacity === 1 ? 'place' : 'places'} in all`}
              />
            ) : null}
            <AppText variant="caption" tone="muted">
              Nothing is charged on waytowalk — you arrange the spot with the agency.
            </AppText>
          </Card>

          {closedReason ? (
            <Card style={styles.closed}>
              <View style={[styles.icon, { backgroundColor: palette.muted }]}>
                <Ionicons name="time-outline" size={20} color={palette.primary} />
              </View>
              <AppText variant="bodyStrong">{closedReason}</AppText>
              <AppText tone="muted">
                Browse the agency’s page for what they’re running next.
              </AppText>
              <Button
                label={`See ${event.agency.name}`}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/agency/[slug]', params: { slug: event.agency.slug } })
                }
              />
            </Card>
          ) : (
            <Card style={styles.interest}>
              <View style={styles.interestHead}>
                <AppText variant="heading">Ask about a spot</AppText>
                <AppText variant="caption" tone="muted">
                  The agency sees your name and contact details and replies directly.
                </AppText>
              </View>
              <InterestForm event={event} />
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    height: 210,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: space.md,
  },
  heroFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroChips: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  glassChip: {
    backgroundColor: 'rgba(17,32,27,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  glassText: { color: '#ffffff' },
  heroPlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroPlaceText: { color: '#ffffff', flexShrink: 1 },
  head: { gap: space.sm },
  agencyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  agencyName: { flexShrink: 1 },
  about: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  highlight: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  details: { gap: space.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: { flex: 1, gap: 1 },
  closed: { gap: space.md },
  interest: { gap: space.md },
  interestHead: { gap: space.xs },
  form: { gap: 12 },
  party: { gap: space.sm },
  partyLabel: { letterSpacing: 0.8, fontSize: 11 },
  note: { minHeight: 84, textAlignVertical: 'top' },
  sent: { gap: space.sm },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBlock: { gap: space.md, alignItems: 'flex-start' },
});
