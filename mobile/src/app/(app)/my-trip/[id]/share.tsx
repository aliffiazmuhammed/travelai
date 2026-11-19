import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  createShareLink,
  fetchMyTrip,
  revokeShareLink,
  setTripPublication,
  type MyTripDetail,
  type PublicationInput,
} from '@/api/trips';
import { useSession } from '@/auth/SessionProvider';
import { exportItineraryPdf } from '@/lib/itineraryPdf';
import { tripTitle } from '@/lib/personalTrip';
import { assetUrl } from '@/config';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, InlineError, Screen, Sheet, Skeleton, TextField } from '@/ui';

const SUMMARY_MAX = 280;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/** Mirrors the server's tag normalization so the preview matches the payload. */
function parseTags(raw: string): { tags: string[]; error?: string } {
  const tags: string[] = [];
  for (const entry of raw.split(',')) {
    const tag = entry
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > 24) return { tags, error: 'Tags can be 24 characters or fewer.' };
    if (!/^[a-z0-9_-]+$/.test(tag)) {
      return { tags, error: 'Tags can use letters, numbers, hyphens and underscores only.' };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > 6) return { tags, error: 'Add 6 tags or fewer.' };
  return { tags };
}

function formatDay(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ShareSkeleton() {
  return (
    <View style={styles.page}>
      <View style={styles.titleBlock}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="80%" height={34} />
        <Skeleton width="60%" height={14} />
      </View>
      <Card style={styles.card}>
        <Skeleton width="50%" height={20} />
        <Skeleton height={56} radius={radius.lg} />
        <Skeleton height={90} radius={radius.lg} />
      </Card>
      <Card style={styles.card}>
        <Skeleton width="40%" height={20} />
        <Skeleton height={48} radius={radius.lg} />
      </Card>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: palette.border, true: palette.primary }}
        thumbColor={palette.card}
        ios_backgroundColor={palette.border}
      />
    </View>
  );
}

function CardHead({ icon, title }: { icon: 'globe-outline' | 'link-outline' | 'document-text-outline'; title: string }) {
  const { palette } = useTheme();

  return (
    <View style={styles.cardHead}>
      <Ionicons name={icon} size={16} color={palette.primary} />
      <AppText variant="heading" style={styles.cardTitle}>
        {title}
      </AppText>
    </View>
  );
}

export default function ShareScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;

  const tripQuery = useQuery({
    queryKey: ['my-trip', tripId],
    queryFn: () => (tripId ? fetchMyTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/trips');
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
      <AppText variant="wordmark" tone="primary">
        waytowalk
      </AppText>
    </View>
  );

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <ShareSkeleton />
      </Screen>
    );
  }

  if (tripQuery.isError || !tripQuery.data) {
    const status = tripQuery.error instanceof ApiError ? tripQuery.error.status : 0;
    const forbidden = status === 403;
    const notFound = status === 404;

    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={forbidden ? 'lock-closed-outline' : notFound ? 'map-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {forbidden
                ? 'This trip is for its members'
                : notFound
                  ? 'This trip has moved on'
                  : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {forbidden
                ? 'Your account doesn’t have access to this trip.'
                : notFound
                  ? 'It may have been deleted, or the link is out of date.'
                  : messageOf(tripQuery.error)}
            </AppText>
            <Button label="Back to your trips" onPress={() => router.navigate('/trips')} />
          </Card>
        </View>
      </Screen>
    );
  }

  return <ShareForm trip={tripQuery.data} tripId={tripId ?? tripQuery.data._id} onBack={goBack} />;
}

function ShareForm({
  trip,
  tripId,
  onBack,
}: {
  trip: MyTripDetail;
  tripId: string;
  onBack: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const isOwner = trip.role === 'owner';
  const title = tripTitle(trip);
  const itinerary = trip.tripDetails ?? {};

  // The form seeds once: this component only mounts after the trip loads, and
  // every successful write folds the server's answer back in below.
  const [published, setPublished] = useState((trip.visibility ?? 'private') === 'public');
  const [hideExactDates, setHideExactDates] = useState(trip.gallery?.hideExactDates === true);
  const [summary, setSummary] = useState(trip.gallery?.summary ?? '');
  const [tagInput, setTagInput] = useState((trip.gallery?.tags ?? []).join(', '));
  const [visibility, setVisibility] = useState(trip.visibility ?? 'private');
  const [publishedAt, setPublishedAt] = useState<string | null>(trip.publishedAt ?? null);
  const [shareId, setShareId] = useState<string | undefined>(trip.shareId);
  const [formError, setFormError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const handleMissing = !user?.handle;
  const inGallery = visibility === 'public';
  const hiddenOn = formatDay(trip.moderation?.hiddenAt);
  const shareUrl = shareId ? assetUrl(`/shared/${shareId}`) : '';
  const parsedTags = parseTags(tagInput);

  const refreshTrip = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-trip', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['my-trips'] });
    void queryClient.invalidateQueries({ queryKey: ['explore'] });
    void queryClient.invalidateQueries({ queryKey: ['gallery-trip', tripId] });
  };

  const applyPublication = (state: {
    visibility: 'private' | 'unlisted' | 'public';
    publishedAt: string | null;
    gallery: { hideExactDates: boolean; summary: string; tags: string[] };
  }) => {
    setVisibility(state.visibility);
    setPublished(state.visibility === 'public');
    setPublishedAt(state.publishedAt);
    setHideExactDates(state.gallery.hideExactDates);
    setSummary(state.gallery.summary);
    setTagInput(state.gallery.tags.join(', '));
  };

  const publishMutation = useMutation({
    mutationFn: (input: PublicationInput) => setTripPublication(tripId, input),
    onMutate: () => {
      setFormError(null);
      setNotice(null);
    },
    onSuccess: (state) => {
      applyPublication(state);
      setUnpublishOpen(false);
      setNotice(
        state.visibility === 'public'
          ? 'Saved — your gallery card is live.'
          : 'Removed from the gallery. Your plan is untouched.'
      );
      refreshTrip();
    },
    onError: (error) => {
      setUnpublishOpen(false);
      setFormError(messageOf(error));
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => createShareLink(tripId),
    onMutate: () => {
      setLinkError(null);
      setNotice(null);
    },
    onSuccess: (id) => {
      setShareId(id);
      setCopied(false);
      setNotice('Share link ready — send it to whoever should see the plan.');
      refreshTrip();
    },
    onError: (error) => setLinkError(messageOf(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeShareLink(tripId),
    onMutate: () => {
      setLinkError(null);
      setNotice(null);
    },
    onSuccess: () => {
      setShareId(undefined);
      setRevokeOpen(false);
      setCopied(false);
      setNotice('Link revoked. The old URL no longer opens.');
      refreshTrip();
    },
    onError: (error) => {
      setRevokeOpen(false);
      setLinkError(messageOf(error));
    },
  });

  const pdfMutation = useMutation({
    mutationFn: () => exportItineraryPdf(itinerary, title),
    onMutate: () => setPdfError(null),
    onError: (error) => setPdfError(messageOf(error)),
  });

  const saveGallery = () => {
    if (parsedTags.error) {
      setFormError(parsedTags.error);
      return;
    }
    if (summary.trim().length > SUMMARY_MAX) {
      setFormError(`Keep the summary to ${SUMMARY_MAX} characters or fewer.`);
      return;
    }
    publishMutation.mutate({
      published: true,
      hideExactDates,
      summary: summary.trim(),
      tags: parsedTags.tags,
    });
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
  };

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
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

        <View style={styles.page}>
          <View style={styles.titleBlock}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                SHARE & EXPORT
              </AppText>
            </View>
            <AppText variant="display">Send the plan out</AppText>
            <AppText tone="muted">
              {isOwner
                ? `A private link, a spot in the gallery, or a PDF for the road — ${title} is ready to travel further.`
                : `Take ${title} with you as a PDF. Publishing and the share link belong to the owner.`}
            </AppText>
          </View>

          {notice ? (
            <View style={[styles.notice, { backgroundColor: palette.muted }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={palette.primary} />
              <AppText variant="caption" style={styles.noticeText}>
                {notice}
              </AppText>
            </View>
          ) : null}

          {isOwner ? (
            <>
              <Card style={styles.card}>
                <CardHead icon="globe-outline" title="Travel gallery" />
                <AppText variant="caption" tone="muted">
                  Published trips show on your traveller page and in Explore. You choose how much
                  of the plan is visible — dates and spend stay private.
                </AppText>

                {hiddenOn ? (
                  <View style={[styles.warning, { borderColor: `${palette.accent}55`, backgroundColor: `${palette.accent}12` }]}>
                    <View style={styles.warningHead}>
                      <Ionicons name="warning-outline" size={15} color={palette.accent} />
                      <AppText variant="label" style={{ color: palette.accent }}>
                        Hidden from the gallery since {hiddenOn}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="muted">
                      {trip.moderation?.source === 'admin'
                        ? 'A platform admin de-listed this trip after a review.'
                        : 'This trip was hidden after several reports.'}{' '}
                      Your itinerary and travellers are untouched; a review can restore it without
                      you publishing again.
                    </AppText>
                  </View>
                ) : null}

                <ToggleRow
                  label="Publish to the gallery"
                  description={
                    publishedAt
                      ? `Currently public since ${formatDay(publishedAt)}.`
                      : 'Off — nobody else can find this trip right now.'
                  }
                  value={published}
                  onChange={(next) => {
                    setFormError(null);
                    setPublished(next);
                  }}
                />

                {published ? (
                  <>
                    {handleMissing ? (
                      <View style={[styles.warning, { borderColor: `${palette.accent}55`, backgroundColor: `${palette.accent}12` }]}>
                        <View style={styles.warningHead}>
                          <Ionicons name="at-outline" size={15} color={palette.accent} />
                          <AppText variant="label" style={{ color: palette.accent }}>
                            Pick a traveller handle first
                          </AppText>
                        </View>
                        <AppText variant="caption" tone="muted">
                          Gallery cards link back to your traveller page, so publishing needs a
                          handle.
                        </AppText>
                        <Button
                          label="Choose a handle"
                          variant="secondary"
                          size="sm"
                          onPress={() => router.push('/account')}
                        />
                      </View>
                    ) : null}

                    <TextField
                      label="Gallery summary"
                      placeholder="One or two lines on what this trip felt like…"
                      value={summary}
                      onChangeText={(next) => {
                        setFormError(null);
                        setSummary(next);
                      }}
                      multiline
                      numberOfLines={3}
                      maxLength={SUMMARY_MAX}
                      hint={`${summary.length}/${SUMMARY_MAX} · A short intro for the gallery card.`}
                      style={styles.summaryInput}
                    />

                    <TextField
                      label="Tags"
                      placeholder="himalayas, slow-travel, food"
                      value={tagInput}
                      onChangeText={(next) => {
                        setFormError(null);
                        setTagInput(next);
                      }}
                      autoCapitalize="none"
                      hint="Comma-separated, up to 6. Letters, numbers, hyphens."
                    />

                    <ToggleRow
                      label="Hide exact dates"
                      description="Show the month and trip length instead of the exact dates."
                      value={hideExactDates}
                      onChange={setHideExactDates}
                    />

                    {formError ? <InlineError message={formError} /> : null}

                    <Button
                      label={inGallery ? 'Save gallery settings' : 'Publish to gallery'}
                      loading={publishMutation.isPending}
                      disabled={handleMissing}
                      onPress={saveGallery}
                    />

                    {inGallery ? (
                      <Button
                        label="Remove from gallery"
                        variant="danger"
                        size="sm"
                        disabled={publishMutation.isPending}
                        onPress={() => {
                          setFormError(null);
                          setUnpublishOpen(true);
                        }}
                      />
                    ) : null}
                  </>
                ) : inGallery ? (
                  <>
                    {formError ? <InlineError message={formError} /> : null}
                    <Button
                      label="Remove from gallery"
                      variant="danger"
                      size="sm"
                      disabled={publishMutation.isPending}
                      onPress={() => {
                        setFormError(null);
                        setUnpublishOpen(true);
                      }}
                    />
                  </>
                ) : (
                  <AppText variant="caption" tone="muted">
                    Not published. Flip the switch when you’re ready for other travellers to find
                    it.
                  </AppText>
                )}
              </Card>

              <Card style={styles.card}>
                <CardHead icon="link-outline" title="Share link" />
                <AppText variant="caption" tone="muted">
                  A read-only web page anyone can open — no account needed. Your expenses and
                  conversations stay behind sign-in.
                </AppText>

                {shareId ? (
                  <>
                    <View style={[styles.linkBox, { backgroundColor: palette.muted }]}>
                      <AppText variant="caption" tone="muted" style={styles.linkEyebrow}>
                        READY TO SHARE
                      </AppText>
                      <AppText variant="caption" selectable numberOfLines={3} style={styles.linkText}>
                        {shareUrl}
                      </AppText>
                    </View>
                    <View style={styles.linkActions}>
                      <Button
                        label={copied ? 'Copied' : 'Copy link'}
                        variant={copied ? 'secondary' : 'primary'}
                        size="sm"
                        icon={
                          <Ionicons
                            name={copied ? 'checkmark' : 'copy-outline'}
                            size={15}
                            color={copied ? palette.secondaryForeground : palette.primaryForeground}
                          />
                        }
                        onPress={() => void copyLink()}
                      />
                      <Button
                        label="Open page"
                        variant="secondary"
                        size="sm"
                        icon={<Ionicons name="open-outline" size={15} color={palette.secondaryForeground} />}
                        onPress={() => {
                          Linking.openURL(shareUrl).catch(() => {
                            setLinkError('Could not open the page on this device.');
                          });
                        }}
                      />
                    </View>
                    <Button
                      label="Stop sharing (revoke link)"
                      variant="ghost"
                      size="sm"
                      disabled={revokeMutation.isPending}
                      onPress={() => {
                        setLinkError(null);
                        setRevokeOpen(true);
                      }}
                    />
                    <AppText variant="caption" tone="muted">
                      Revoking kills this URL for good. Sharing again later mints a different link.
                    </AppText>
                  </>
                ) : (
                  <Button
                    label={shareMutation.isPending ? 'Creating link…' : 'Create a share link'}
                    variant="secondary"
                    loading={shareMutation.isPending}
                    icon={
                      shareMutation.isPending ? undefined : (
                        <Ionicons name="link-outline" size={16} color={palette.secondaryForeground} />
                      )
                    }
                    onPress={() => shareMutation.mutate()}
                  />
                )}

                {linkError ? <InlineError message={linkError} /> : null}
              </Card>
            </>
          ) : (
            <Card style={styles.card}>
              <CardHead icon="link-outline" title="Owner controls" />
              <AppText tone="muted">
                Publishing and the public link belong to the trip owner. The PDF below is yours to
                take with you.
              </AppText>
            </Card>
          )}

          <Card style={styles.card}>
            <CardHead icon="document-text-outline" title="A PDF for the road" />
            <AppText variant="caption" tone="muted">
              The full plan — days, stays, food, budget and safety notes — as a PDF you can save,
              print or send.
            </AppText>
            <Button
              label={pdfMutation.isPending ? 'Preparing PDF…' : 'Create PDF'}
              loading={pdfMutation.isPending}
              icon={
                pdfMutation.isPending ? undefined : (
                  <Ionicons name="download-outline" size={16} color={palette.primaryForeground} />
                )
              }
              onPress={() => pdfMutation.mutate()}
            />
            {pdfError ? <InlineError message={pdfError} /> : null}
          </Card>
        </View>
      </Screen>

      <Sheet
        visible={unpublishOpen}
        onClose={() => setUnpublishOpen(false)}
        title="Remove from the gallery?"
        subtitle="Your itinerary, budget and travellers stay exactly as they are."
        footer={
          <View style={styles.sheetActions}>
            <Button
              label="Keep it published"
              variant="ghost"
              size="sm"
              disabled={publishMutation.isPending}
              onPress={() => setUnpublishOpen(false)}
            />
            <Button
              label="Remove"
              variant="danger"
              size="sm"
              loading={publishMutation.isPending}
              onPress={() => publishMutation.mutate({ published: false })}
            />
          </View>
        }
      >
        <AppText tone="muted">
          The public gallery card disappears right away. Anyone holding the unlisted share link can
          still open the plan until you revoke it.
        </AppText>
        {formError ? <InlineError message={formError} /> : null}
      </Sheet>

      <Sheet
        visible={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="Stop sharing this link?"
        subtitle="This cannot be undone."
        footer={
          <View style={styles.sheetActions}>
            <Button
              label="Keep sharing"
              variant="ghost"
              size="sm"
              disabled={revokeMutation.isPending}
              onPress={() => setRevokeOpen(false)}
            />
            <Button
              label="Revoke link"
              variant="danger"
              size="sm"
              loading={revokeMutation.isPending}
              onPress={() => revokeMutation.mutate()}
            />
          </View>
        }
      >
        <AppText tone="muted">
          The old URL stops working immediately, even for people who saved it. Your trip is
          untouched, and you can share again whenever you like.
        </AppText>
        {linkError ? <InlineError message={linkError} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  titleBlock: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2 },
  card: { gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  noticeText: { flex: 1, lineHeight: 19 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleText: { flex: 1, gap: 1 },
  warning: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryInput: { minHeight: 92, textAlignVertical: 'top' },
  linkBox: { borderRadius: radius.lg, padding: space.md, gap: space.sm },
  linkEyebrow: { letterSpacing: 1, fontSize: 11 },
  linkText: { lineHeight: 19 },
  linkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm },
  errorCard: { alignItems: 'flex-start', gap: space.sm },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});
