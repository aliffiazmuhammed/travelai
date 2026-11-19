import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { uploadTripPhoto } from '@/api/media';
import {
  fetchMyTrip,
  savePlanChanges,
  type MyTripDetail,
  type TripDay,
  type TripItinerary,
} from '@/api/trips';
import { ActivitySheet } from '@/components/ActivitySheet';
import { cleanDayTitle } from '@/components/trip/DayPlan';
import { TripPhotoField } from '@/components/trip/TripPhotoField';
import {
  activityFields,
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
  setDayImage,
  setDayTitle,
  type ActivityFields,
} from '@/lib/tripDraft';
import { pickTripPhoto, type PhotoSource } from '@/lib/tripPhotos';
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
      <AppText variant="wordmark" tone="primary">
        waytowalk
      </AppText>
      {right ?? null}
    </View>
  );
}

/**
 * One day in the editor. Collapsed days stay a single header row so a long
 * trip stays scannable; opening one reveals its title and stops to reshape.
 */
function EditDayCard({
  day,
  dayIndex,
  first,
  tripId,
  photoBusy,
  photoError,
  onSetTitle,
  onEditStop,
  onAddStop,
  onPickPhoto,
  onRemovePhoto,
}: {
  day: TripDay;
  dayIndex: number;
  first: boolean;
  tripId: string;
  photoBusy: boolean;
  photoError: string | null;
  onSetTitle: (dayIndex: number, value: string) => void;
  onEditStop: (dayIndex: number, activityIndex: number) => void;
  onAddStop: (dayIndex: number) => void;
  onPickPhoto: (dayIndex: number, source: PhotoSource) => void;
  onRemovePhoto: (dayIndex: number) => void;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(first);
  const title = cleanDayTitle(day.title ?? '');
  const entries = day.activities ?? [];

  return (
    <Card style={styles.dayCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day ${day.day}${title ? `: ${title}` : ''}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.dayHead, pressed && styles.pressed]}
      >
        <View style={styles.dayHeadText}>
          <AppText variant="caption" tone="primary" style={styles.dayEyebrow}>
            DAY {day.day}
          </AppText>
          <AppText variant="heading" numberOfLines={1}>
            {title || `Day ${day.day}`}
          </AppText>
          <AppText variant="caption" tone="muted">
            {entries.length === 0
              ? 'No stops yet'
              : `${entries.length} ${entries.length === 1 ? 'stop' : 'stops'}`}
          </AppText>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={palette.mutedForeground}
        />
      </Pressable>

      {open ? (
        <>
          <TextField
            label="What’s the day about?"
            value={title}
            onChangeText={(value) => onSetTitle(dayIndex, value)}
            placeholder="Arrive and settle in"
            maxLength={90}
          />

          <TripPhotoField
            label="Day photo"
            photo={day.image}
            tripId={tripId}
            busy={photoBusy}
            error={photoError}
            onPick={(source) => onPickPhoto(dayIndex, source)}
            onRemove={() => onRemovePhoto(dayIndex)}
          />

          {entries.length > 0 ? (
            <View>
              {entries.map((entry, activityIndex) => {
                const fields = activityFields(entry);
                const detail = fields.location || fields.description;
                const last = activityIndex === entries.length - 1;

                return (
                  <Pressable
                    key={`${fields.name}-${activityIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${fields.name || 'stop'}`}
                    onPress={() => onEditStop(dayIndex, activityIndex)}
                    style={({ pressed }) => [
                      styles.stopRow,
                      !last && { borderBottomWidth: 1, borderBottomColor: palette.border },
                      pressed && { backgroundColor: palette.muted },
                    ]}
                  >
                    <View style={styles.stopMeta}>
                      {fields.time ? (
                        <View style={[styles.timePill, { backgroundColor: palette.muted }]}>
                          <AppText variant="caption" tone="primary">
                            {fields.time}
                          </AppText>
                        </View>
                      ) : (
                        <View style={[styles.stopDot, { backgroundColor: palette.primary }]} />
                      )}
                    </View>
                    <View style={styles.stopBody}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {fields.name || 'Untitled stop'}
                      </AppText>
                      {detail ? (
                        <AppText variant="caption" tone="muted" numberOfLines={1}>
                          {detail}
                        </AppText>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AppText variant="caption" tone="muted">
              No stops yet — add the first one and the day starts taking shape.
            </AppText>
          )}

          <Button
            label={entries.length === 0 ? 'Add the first stop' : 'Add a stop'}
            variant="ghost"
            size="sm"
            icon={<Ionicons name="add" size={16} color={palette.foreground} />}
            onPress={() => onAddStop(dayIndex)}
          />
        </>
      ) : null}
    </Card>
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
          <Skeleton height={150} radius={radius.xxl} />
          <Skeleton height={96} radius={radius.xxl} />
          <Skeleton height={72} radius={radius.xxl} />
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
  const [photoJob, setPhotoJob] = useState<{
    dayIndex: number;
    busy: boolean;
    error: string | null;
  } | null>(null);
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

  const pickDayPhoto = async (dayIndex: number, source: PhotoSource) => {
    if (photoJob?.busy) return;
    setPhotoJob({ dayIndex, busy: true, error: null });
    try {
      const picked = await pickTripPhoto(source);
      if (picked) {
        const ref = await uploadTripPhoto(tripId, picked);
        updateDays((current) => setDayImage(current, dayIndex, ref));
      }
      setPhotoJob(null);
    } catch (error) {
      setPhotoJob({
        dayIndex,
        busy: false,
        error:
          error instanceof Error ? error.message : 'That photo didn’t upload. Try again.',
      });
    }
  };

  const removeDayPhoto = (dayIndex: number) => {
    setPhotoJob(null);
    updateDays((current) => setDayImage(current, dayIndex, undefined));
  };

  const uploadStopPhoto = async (source: PhotoSource) => {
    const picked = await pickTripPhoto(source);
    if (!picked) return null;
    return uploadTripPhoto(tripId, picked);
  };

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
        <Card style={styles.introCard}>
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

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {isOwner ? (
            <TextField
              label="Trip name"
              value={title}
              onChangeText={setTitle}
              placeholder="Give the trip a name"
              maxLength={140}
              error={nameMissing ? 'A trip needs a name to save.' : undefined}
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
          <View style={styles.dayList}>
            <View style={styles.sectionHead}>
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                THE PLAN
              </AppText>
              <AppText variant="caption" tone="muted">
                {days.length} {days.length === 1 ? 'day' : 'days'} · tap one to open it
              </AppText>
            </View>
            {days.map((day, dayIndex) => (
              <EditDayCard
                key={`${day.day}-${dayIndex}`}
                day={day}
                dayIndex={dayIndex}
                first={dayIndex === 0}
                tripId={tripId}
                photoBusy={photoJob?.dayIndex === dayIndex && photoJob.busy}
                photoError={photoJob?.dayIndex === dayIndex ? photoJob.error : null}
                onSetTitle={(index, value) =>
                  updateDays((current) => setDayTitle(current, index, value))
                }
                onEditStop={(index, activityIndex) => setSheet({ dayIndex: index, activityIndex })}
                onAddStop={(index) => setSheet({ dayIndex: index, activityIndex: null })}
                onPickPhoto={(index, source) => void pickDayPhoto(index, source)}
                onRemovePhoto={removeDayPhoto}
              />
            ))}
          </View>
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
          tripId={tripId}
          initial={sheetEntry ? activityFields(sheetEntry) : EMPTY_FIELDS}
          onUploadPhoto={uploadStopPhoto}
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
  content: { paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
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
  introCard: { gap: space.lg },
  intro: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.1, fontSize: 11 },
  divider: { height: 1 },
  readOnlyName: { gap: 4 },
  emptyCard: { alignItems: 'flex-start', gap: space.sm },
  dayList: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  dayCard: { gap: space.lg },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pressed: { opacity: 0.7 },
  dayHeadText: { flex: 1, gap: 2 },
  dayEyebrow: { letterSpacing: 1.2, fontSize: 11 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  stopMeta: { width: 52, alignItems: 'flex-start' },
  timePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm },
  stopDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    marginLeft: 6,
    marginTop: 7,
  },
  stopBody: { flex: 1, gap: 2 },
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
