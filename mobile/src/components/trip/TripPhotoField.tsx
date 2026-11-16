import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { MediaRef } from '@/api/media';
import type { PhotoSource } from '@/lib/tripPhotos';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button } from '@/ui';
import { TripPhoto } from './TripPhoto';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface TripPhotoFieldProps {
  label: string;
  photo?: MediaRef;
  tripId: string;
  variant?: 'banner' | 'row';
  busy?: boolean;
  error?: string | null;
  onPick: (source: PhotoSource) => void;
  onRemove?: () => void;
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: palette.muted, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={15} color={palette.foreground} />
    </Pressable>
  );
}

/**
 * One photo slot in the plan editor. Picking uploads right away — the returned
 * reference rides the normal plan save, so a discarded edit only leaves an
 * unreferenced file for the trip purge.
 */
export function TripPhotoField({
  label,
  photo,
  tripId,
  variant = 'banner',
  busy = false,
  error,
  onPick,
  onRemove,
}: TripPhotoFieldProps) {
  const { palette } = useTheme();

  if (variant === 'row') {
    return (
      <View style={styles.field}>
        <View style={styles.rowField}>
          <View
            style={[
              styles.thumb,
              { backgroundColor: palette.muted, borderColor: palette.border },
            ]}
          >
            {photo ? (
              <TripPhoto
                photo={photo}
                tripId={tripId}
                style={styles.thumbImage}
                accessibilityLabel={label}
              />
            ) : (
              <Ionicons name="image-outline" size={18} color={palette.mutedForeground} />
            )}
            {busy ? (
              <View style={styles.thumbBusy}>
                <ActivityIndicator size="small" color={palette.primary} />
              </View>
            ) : null}
          </View>
          <View style={styles.rowText}>
            <AppText variant="label">{label}</AppText>
            <AppText variant="caption" tone="muted">
              {busy
                ? 'Uploading…'
                : photo
                  ? 'A picture for this stop.'
                  : 'Optional — helps the stop read at a glance.'}
            </AppText>
          </View>
          <View style={styles.rowActions}>
            <IconButton
              icon="camera-outline"
              label="Take a photo"
              disabled={busy}
              onPress={() => onPick('camera')}
            />
            <IconButton
              icon="images-outline"
              label="Choose from library"
              disabled={busy}
              onPress={() => onPick('library')}
            />
            {photo && onRemove ? (
              <IconButton
                icon="close"
                label="Remove photo"
                disabled={busy}
                onPress={onRemove}
              />
            ) : null}
          </View>
        </View>
        {error ? (
          <AppText variant="caption" style={[styles.errorText, { color: palette.destructive }]}>
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <AppText variant="caption" tone="muted" style={styles.label}>
        {label.toUpperCase()}
      </AppText>

      {photo ? (
        <View style={styles.bannerWrap}>
          <TripPhoto
            photo={photo}
            tripId={tripId}
            style={styles.banner}
            accessibilityLabel={label}
          />
          {busy ? (
            <View style={styles.bannerBusy}>
              <ActivityIndicator size="small" color="#ffffff" />
              <AppText variant="caption" style={styles.bannerBusyText}>
                Uploading…
              </AppText>
            </View>
          ) : null}
          <View style={styles.bannerActions}>
            <Button
              label="Camera"
              variant="secondary"
              size="sm"
              disabled={busy}
              icon={<Ionicons name="camera-outline" size={14} color={palette.secondaryForeground} />}
              onPress={() => onPick('camera')}
            />
            <Button
              label="Library"
              variant="secondary"
              size="sm"
              disabled={busy}
              icon={<Ionicons name="images-outline" size={14} color={palette.secondaryForeground} />}
              onPress={() => onPick('library')}
            />
            {onRemove ? (
              <IconButton
                icon="close"
                label="Remove photo"
                disabled={busy}
                onPress={onRemove}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.emptyBanner,
            { borderColor: palette.border, backgroundColor: `${palette.muted}80` },
          ]}
        >
          <Ionicons name="image-outline" size={22} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted">
            {busy ? 'Preparing the photo…' : 'A photo here sets the mood for the day.'}
          </AppText>
          <View style={styles.emptyActions}>
            <Button
              label="Take a photo"
              variant="ghost"
              size="sm"
              style={styles.actionGrow}
              disabled={busy}
              icon={<Ionicons name="camera-outline" size={15} color={palette.foreground} />}
              onPress={() => onPick('camera')}
            />
            <Button
              label="Choose photo"
              variant="secondary"
              size="sm"
              style={styles.actionGrow}
              disabled={busy}
              icon={<Ionicons name="images-outline" size={15} color={palette.secondaryForeground} />}
              onPress={() => onPick('library')}
            />
          </View>
        </View>
      )}

      {error ? (
        <AppText variant="caption" style={[styles.errorText, { color: palette.destructive }]}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { letterSpacing: 0.9, fontSize: 11 },
  bannerWrap: { borderRadius: radius.xl, overflow: 'hidden' },
  banner: { width: '100%', height: 150, backgroundColor: '#e4eae7' },
  bannerBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(12,26,21,0.45)',
  },
  bannerBusyText: { color: '#ffffff' },
  bannerActions: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyBanner: {
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  emptyActions: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  actionGrow: { flex: 1 },
  errorText: { lineHeight: 17 },
  rowField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  rowText: { flex: 1, gap: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
