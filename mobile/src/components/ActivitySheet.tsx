import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MediaRef } from '@/api/media';
import { TripPhotoField } from '@/components/trip/TripPhotoField';
import type { ActivityFields } from '@/lib/tripDraft';
import type { PhotoSource } from '@/lib/tripPhotos';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, TextField } from '@/ui';

interface ActivitySheetProps {
  mode: 'add' | 'edit';
  dayNumber: number;
  tripId: string;
  initial: ActivityFields;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onSave: (fields: ActivityFields) => void;
  /** Uploads right away and returns the stored reference, or null if cancelled. */
  onUploadPhoto: (source: PhotoSource) => Promise<MediaRef | null>;
  onMove?: (delta: -1 | 1) => void;
  onDelete?: () => void;
}

/**
 * One stop, edited on its own. Mounted only while open so the draft fields
 * always start from the row that was tapped.
 */
export function ActivitySheet({
  mode,
  dayNumber,
  tripId,
  initial,
  canMoveUp,
  canMoveDown,
  onClose,
  onSave,
  onUploadPhoto,
  onMove,
  onDelete,
}: ActivitySheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [fields, setFields] = useState(initial);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const update = (patch: Partial<ActivityFields>) => setFields((current) => ({ ...current, ...patch }));
  const named = fields.name.trim().length > 0;

  const pickPhoto = async (source: PhotoSource) => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const ref = await onUploadPhoto(source);
      if (ref) update({ image: ref });
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : 'That photo didn’t upload. Try again.'
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="heading">
                {mode === 'add' ? 'Add a stop' : 'Edit this stop'}
              </AppText>
              <AppText variant="caption" tone="muted">
                Day {dayNumber} · a place, a meal, a walk — whatever fills the hours.
              </AppText>
            </View>
            <View style={styles.headerActions}>
              {mode === 'edit' && onMove ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move earlier"
                    disabled={!canMoveUp}
                    onPress={() => onMove(-1)}
                    style={[
                      styles.iconButton,
                      { backgroundColor: palette.muted, opacity: canMoveUp ? 1 : 0.4 },
                    ]}
                  >
                    <Ionicons name="arrow-up" size={15} color={palette.foreground} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move later"
                    disabled={!canMoveDown}
                    onPress={() => onMove(1)}
                    style={[
                      styles.iconButton,
                      { backgroundColor: palette.muted, opacity: canMoveDown ? 1 : 0.4 },
                    ]}
                  >
                    <Ionicons name="arrow-down" size={15} color={palette.foreground} />
                  </Pressable>
                </>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={onClose}
                style={[styles.iconButton, { backgroundColor: palette.muted }]}
              >
                <Ionicons name="close" size={16} color={palette.foreground} />
              </Pressable>
            </View>
          </View>

          <TextField
            label="What are you doing?"
            value={fields.name}
            onChangeText={(name) => update({ name })}
            placeholder="Walk the old city at sunrise"
            autoFocus={mode === 'add'}
            maxLength={120}
            hint={named ? undefined : 'Give the stop a name so the day reads well.'}
          />
          <TextField
            label="When (optional)"
            value={fields.time}
            onChangeText={(time) => update({ time })}
            placeholder="Morning · 09:00"
            maxLength={40}
          />
          <TextField
            label="Where (optional)"
            value={fields.location}
            onChangeText={(location) => update({ location })}
            placeholder="Johari Bazaar"
            maxLength={120}
          />
          <TextField
            label="Notes (optional)"
            value={fields.description}
            onChangeText={(description) => update({ description })}
            placeholder="Why it's worth the stop, what to order, what to skip."
            multiline
            numberOfLines={3}
            maxLength={600}
            style={styles.notes}
          />

          <TripPhotoField
            label="Stop photo"
            photo={fields.image}
            tripId={tripId}
            variant="row"
            busy={photoBusy}
            error={photoError}
            onPick={(source) => void pickPhoto(source)}
            onRemove={() => update({ image: undefined })}
          />

          {confirmRemove && onDelete ? (
            <View style={styles.confirmRow}>
              <View style={styles.confirmText}>
                <AppText variant="bodyStrong">Remove this stop?</AppText>
                <AppText variant="caption" tone="muted">
                  It leaves the day as soon as you save the plan.
                </AppText>
              </View>
              <View style={styles.confirmActions}>
                <Button label="Keep it" variant="ghost" size="sm" onPress={() => setConfirmRemove(false)} />
                <Button
                  label="Remove"
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    onDelete();
                    onClose();
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              {mode === 'edit' && onDelete ? (
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  icon={<Ionicons name="trash-outline" size={15} color={palette.destructive} />}
                  style={styles.removeButton}
                  onPress={() => setConfirmRemove(true)}
                />
              ) : (
                <View />
              )}
              <View style={styles.mainActions}>
                <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
                <Button
                  label={mode === 'add' ? 'Add to day' : 'Save stop'}
                  disabled={!named}
                  onPress={() => {
                    onSave(fields);
                    onClose();
                  }}
                />
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.md,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,140,134,0.4)',
    marginBottom: space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notes: { minHeight: 84, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xs,
  },
  mainActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  removeButton: { borderWidth: 0 },
  confirmRow: { gap: space.sm, marginTop: space.xs },
  confirmText: { gap: 2 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
