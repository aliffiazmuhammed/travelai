import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  fetchMyTrip,
  savePlanChanges,
  type MyTripDetail,
  type TripDay,
  type TripItinerary,
} from '@/api/trips';
import { ActivitySheet } from '@/components/ActivitySheet';
import { cleanDayTitle } from '@/components/trip/DayPlan';
import {
  activityFields,
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
  setDayTitle,
  type ActivityFields,
} from '@/lib/tripDraft';
import { tripTitle } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, InlineError, Screen, Skeleton, TextField } from '@/ui';

const EMPTY_FIELDS: ActivityFields = { name: '', time: '', description: '', location: '' };

function TopRow({ onBack, right }: { onBack: () => void; right?: ReactNode }) {
  const { palette } = useTheme();

  return (
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
      <AppText variant="title" tone="primary" style={styles.wordmark}>
        waytowalk
      </AppText>
      {right ?? null}
    </View>
  );
}

function EditIntro() {
  const { palette } = useTheme();

  return (
    <View style={styles.intro}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
        <AppText variant="caption" tone="muted" style={styles.eyebrow}>
          EDITING
        </AppText>
      </View>
      <AppText variant="display">Reshape the plan</AppText>
      <AppText tone="muted">
        Add a stop, move a morning around, fix a name. Nothing saves until you tap Save.
      </AppText>
    </View>
  );
}

export default function EditTripScreen() {
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
  const trip = tripQuery.data;

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(tripId ? `/my-trip/${tripId}` : '/trips');
  };

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <TopRow onBack={close} />
        <View style={styles.page}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="80%" height={34} />
          <Skeleton height={120} radius={radius.xxl} />
          <Skeleton height={180} radius={radius.xxl} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <TopRow onBack={close} />
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={26} color={palette.destructive} />
            <AppText variant="title">This plan couldn’t be opened</AppText>
            <AppText tone="muted">
              {tripQuery.error instanceof Error
                ? tripQuery.error.message
                : 'Check your connection, then try again.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to your trips" onPress={close} />
              <Button label="Try again" variant="secondary" onPress={() => tripQuery.refetch()} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const role = trip.role ?? 'owner';
  const canEdit = role === 'owner' || role === 'editor';

  if (!canEdit) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <TopRow onBack={close} />
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <Ionicons name="lock-closed-outline" size={26} color={palette.mutedForeground} />
            <AppText variant="title">Editing is for the trip’s own people</AppText>
            <AppText tone="muted">
              The owner and anyone they made an editor can reshape this plan. You can still read it
              in full.
            </AppText>
            <Button label="Back to the plan" onPress={close} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <EditTripForm
      key={trip.rev ?? 1}
      trip={trip}
      tripId={tripId as string}
      onClose={close}
      onReload={() => {
        void tripQuery.refetch();
      }}
    />
  );
}

function EditTripForm({
  trip,
  tripId,
  onClose,
  onReload,
}: {
  trip: MyTripDetail;
  tripId: string;
  onClose: () => void;
  onReload: () => void;
}) {
  const { palette } = useTheme();
  const queryClient = useQueryClient();
  const isOwner = (trip.role ?? 'owner') === 'owner';
  const memberCount = Math.max(trip.members?.length ?? 0, 1);

  const originalTitle = useMemo(() => tripTitle(trip), [trip]);
  const [title, setTitle] = useState(originalTitle);
  const [details, setDetails] = useState<TripItinerary>(() => ({ ...(trip.tripDetails ?? {}) }));
  const [sheet, setSheet] = useState<{ dayIndex: number; activityIndex: number | null } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const days = details.day_by_day_itinerary ?? [];
  const detailsChanged = JSON.stringify(details) !== JSON.stringify(trip.tripDetails ?? {});
  const titleChanged = isOwner && title.trim() !== originalTitle;
  const nameMissing = isOwner && title.trim().length === 0;
  const dirty = detailsChanged || titleChanged;

  const updateDays = (change: (current: TripDay[]) => TripDay[]) =>
    setDetails((current) => ({
      ...current,
      day_by_day_itinerary: change(current.day_by_day_itinerary ?? []),
    }));

  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const save = async () => {
    if (saving || !dirty || nameMissing) return;
    setSaving(true);
    setFailure(null);

    try {
      const saved = await savePlanChanges(tripId, {
        baseRev: trip.rev ?? 1,
        tripDetails: details,
        ...(titleChanged ? { title: title.trim() } : {}),
      });
      if (!mounted.current) return;
      queryClient.setQueryData(['my-trip', tripId], saved);
      void queryClient.invalidateQueries({ queryKey: ['my-trips'] });
      onClose();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
      } else {
        setFailure(
          error instanceof Error
            ? error.message
            : 'The changes didn’t save. Give it another try.'
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const sheetDay = sheet ? days[sheet.dayIndex] : undefined;
  const sheetEntries = sheetDay?.activities ?? [];
  const sheetEntry =
    sheet && sheet.activityIndex !== null ? sheetEntries[sheet.activityIndex] : undefined;

  return (
    <Screen scroll avoidKeyboard edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <TopRow
        onBack={requestClose}
        right={
          <View style={[styles.editChip, { backgroundColor: palette.muted }]}>
            <Ionicons name="create-outline" size={13} color={palette.primary} />
            <AppText variant="caption" tone="primary">
              {dirty ? 'Unsaved' : 'Editing'}
            </AppText>
          </View>
        }
      />

      <View style={styles.page}>
        <EditIntro />

        <Card style={styles.nameCard}>
          {isOwner ? (
            <TextField
              label="Trip name"
              value={title}
              onChangeText={setTitle}
              placeholder="Give the trip a name"
              maxLength={140}
              hint={
                nameMissing
                  ? 'A trip needs a name to save.'
                  : 'Shown in your trips and at the top of the plan.'
              }
            />
          ) : (
            <View style={styles.readOnlyName}>
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                TRIP NAME
              </AppText>
              <AppText variant="heading">{originalTitle}</AppText>
              <AppText variant="caption" tone="muted">
                Only the owner can rename the trip.
              </AppText>
            </View>
          )}
        </Card>

        {days.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="map-outline" size={22} color={palette.mutedForeground} />
            <AppText variant="bodyStrong">No day-by-day plan yet</AppText>
            <AppText variant="caption" tone="muted">
              There’s nothing to reshape until this trip has days. Add them from the web for now.
            </AppText>
          </Card>
        ) : (
          days.map((day, dayIndex) => {
            const entries = day.activities ?? [];
            return (
              <Card key={`${day.day}-${dayIndex}`} style={styles.dayCard}>
                <View style={styles.dayHead}>
                  <View style={[styles.dayBadge, { backgroundColor: palette.muted }]}>
                    <AppText variant="label" tone="primary">
                      {day.day}
                    </AppText>
                  </View>
                  <View style={styles.dayHeadText}>
                    <AppText variant="heading">Day {day.day}</AppText>
                    <AppText variant="caption" tone="muted">
                      {entries.length === 0
                        ? 'Nothing planned yet'
                        : `${entries.length} ${entries.length === 1 ? 'stop' : 'stops'}`}
                    </AppText>
                  </View>
                </View>

                <TextField
                  label="What’s the day about?"
                  value={cleanDayTitle(day.title ?? '')}
                  onChangeText={(value) =>
                    updateDays((current) => setDayTitle(current, dayIndex, value))
                  }
                  placeholder="Arrive and settle in"
                  maxLength={90}
                />

                {entries.length > 0 ? (
                  <View style={styles.activityList}>
                    {entries.map((entry, activityIndex) => {
                      const fields = activityFields(entry);
                      return (
                        <Pressable
                          key={`${fields.name}-${activityIndex}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${fields.name || 'stop'}`}
                          onPress={() => setSheet({ dayIndex, activityIndex })}
                          style={({ pressed }) => [
                            styles.activityRow,
                            {
                              borderColor: palette.border,
                              backgroundColor: pressed ? palette.muted : 'transparent',
                            },
                          ]}
                        >
                          <View style={styles.activityMeta}>
                            {fields.time ? (
                              <View style={[styles.timePill, { backgroundColor: palette.muted }]}>
                                <AppText variant="caption" tone="primary" style={styles.timeText}>
                                  {fields.time}
                                </AppText>
                              </View>
                            ) : (
                              <View style={[styles.activityDot, { backgroundColor: palette.primary }]} />
                            )}
                          </View>
                          <View style={styles.activityBody}>
                            <AppText variant="bodyStrong">{fields.name || 'Untitled stop'}</AppText>
                            {fields.location ? (
                              <View style={styles.locationRow}>
                                <Ionicons
                                  name="location-outline"
                                  size={12}
                                  color={palette.mutedForeground}
                                />
                                <AppText variant="caption" tone="muted" numberOfLines={1}>
                                  {fields.location}
                                </AppText>
                              </View>
                            ) : null}
                            {fields.description ? (
                              <AppText variant="caption" tone="muted" numberOfLines={1}>
                                {fields.description}
                              </AppText>
                            ) : null}
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={palette.mutedForeground}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <AppText variant="caption" tone="muted">
                    Add the first stop and the day starts taking shape.
                  </AppText>
                )}

                <Button
                  label="Add a stop"
                  variant="ghost"
                  size="sm"
                  icon={<Ionicons name="add" size={16} color={palette.foreground} />}
                  onPress={() => setSheet({ dayIndex, activityIndex: null })}
                />
              </Card>
            );
          })
        )}

        <View style={styles.footer}>
          {conflict ? (
            <Card style={styles.conflictCard}>
              <View style={styles.conflictHead}>
                <Ionicons name="git-compare-outline" size={18} color={palette.primary} />
                <AppText variant="heading">This plan moved on without you</AppText>
              </View>
              <AppText tone="muted">
                Someone else saved a change while you were editing. Reload the latest version, then
                make your edits again.
              </AppText>
              <Button label="Reload the latest" onPress={onReload} />
            </Card>
          ) : (
            <>
              <InlineError message={failure} />
              <Button
                label={saving ? 'Saving…' : 'Save changes'}
                size="lg"
                loading={saving}
                disabled={!dirty || nameMissing}
                onPress={save}
              />
              <AppText variant="caption" tone="muted" style={styles.saveNote}>
                {nameMissing
                  ? 'Name the trip before saving.'
                  : dirty
                    ? memberCount > 1
                      ? 'Saves for everyone on this trip.'
                      : 'Private to you until you share it.'
                    : 'Everything is up to date.'}
              </AppText>
            </>
          )}
        </View>
      </View>

      {sheet ? (
        <ActivitySheet
          mode={sheet.activityIndex === null ? 'add' : 'edit'}
          dayNumber={sheetDay?.day ?? sheet.dayIndex + 1}
          initial={sheetEntry ? activityFields(sheetEntry) : EMPTY_FIELDS}
          canMoveUp={sheet.activityIndex !== null && sheet.activityIndex > 0}
          canMoveDown={
            sheet.activityIndex !== null && sheet.activityIndex < sheetEntries.length - 1
          }
          onClose={() => setSheet(null)}
          onSave={(fields) => {
            if (sheet.activityIndex === null) {
              updateDays((current) => addActivity(current, sheet.dayIndex, fields));
            } else {
              const index = sheet.activityIndex;
              updateDays((current) => editActivity(current, sheet.dayIndex, index, fields));
            }
          }}
          onMove={(delta) => {
            if (sheet.activityIndex === null) return;
            const index = sheet.activityIndex;
            updateDays((current) => moveActivity(current, sheet.dayIndex, index, delta));
            setSheet({ dayIndex: sheet.dayIndex, activityIndex: index + delta });
          }}
          onDelete={
            sheet.activityIndex === null
              ? undefined
              : () => {
                  const index = sheet.activityIndex as number;
                  updateDays((current) => removeActivity(current, sheet.dayIndex, index));
                }
          }
        />
      ) : null}

      <Modal
        visible={discardOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscardOpen(false)}
      >
        <View style={styles.confirmRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep editing"
            onPress={() => setDiscardOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <Card style={styles.confirmCard}>
            <AppText variant="heading">Leave without saving?</AppText>
            <AppText tone="muted">Your changes to this plan haven’t been saved yet.</AppText>
            <View style={styles.confirmActions}>
              <Button
                label="Keep editing"
                variant="secondary"
                onPress={() => setDiscardOpen(false)}
              />
              <Button
                label="Discard changes"
                variant="danger"
                onPress={() => {
                  setDiscardOpen(false);
                  onClose();
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4, flex: 1 },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  intro: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2, fontSize: 10 },
  nameCard: { gap: space.sm },
  readOnlyName: { gap: 4 },
  emptyCard: { alignItems: 'flex-start', gap: space.sm },
  dayCard: { gap: space.lg },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeadText: { flex: 1, gap: 2 },
  activityList: { gap: 2 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  activityMeta: { width: 54, alignItems: 'flex-start' },
  timePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm },
  timeText: { fontSize: 11, lineHeight: 15 },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    marginLeft: 6,
    marginTop: 7,
  },
  activityBody: { flex: 1, gap: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footer: { gap: space.sm },
  saveNote: { textAlign: 'center' },
  conflictCard: { gap: space.sm },
  conflictHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  errorCard: { alignItems: 'flex-start', gap: space.sm },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmCard: { width: '100%', maxWidth: 380, gap: space.sm },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
});
