import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { InvitableRole, TripMember } from '@/api/people';
import { ROLE_LABEL, rolePhrase } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, InlineError } from '@/ui';

const ROLE_OPTIONS: { role: InvitableRole; title: string; body: string }[] = [
  { role: 'editor', title: 'Shape the plan', body: 'Add, edit and reorder days, stays and activities.' },
  { role: 'commenter', title: 'Join the conversation', body: 'Comment, chat and weigh in on plans.' },
  { role: 'viewer', title: 'Follow along', body: 'See the plan without changing it.' },
];

interface MemberSheetProps {
  member: TripMember;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onChangeRole: (role: InvitableRole) => void;
  onRemove: () => void;
}

/** Owner actions for one member: pick their role, or remove them. */
export function MemberSheet({
  member,
  busy,
  error,
  onClose,
  onChangeRole,
  onRemove,
}: MemberSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const firstName = member.label.split(/\s+/)[0] || member.label;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
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
            <Avatar
              name={member.label}
              size={44}
              uri={member.avatarUrl}
            />
            <View style={styles.headerText}>
              <AppText variant="heading">{member.label}</AppText>
              <AppText variant="caption" tone="muted">
                {member.isYou ? 'That’s you' : `Currently ${rolePhrase(member.role)}`}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={[styles.close, { backgroundColor: palette.muted }]}
            >
              <Ionicons name="close" size={16} color={palette.foreground} />
            </Pressable>
          </View>

          {error ? <InlineError message={error} /> : null}

          {confirming ? (
            <View style={styles.confirm}>
              <AppText variant="bodyStrong">Remove {firstName} from this trip?</AppText>
              <AppText variant="caption" tone="muted">
                They lose access right away. Anything they wrote stays with the trip.
              </AppText>
              <View style={styles.actions}>
                <Button
                  label="Keep them"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                />
                <Button
                  label={busy ? 'Removing…' : 'Remove'}
                  variant="danger"
                  size="sm"
                  loading={busy}
                  onPress={onRemove}
                />
              </View>
            </View>
          ) : (
            <>
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                WHAT THEY CAN DO
              </AppText>
              <View style={styles.options}>
                {ROLE_OPTIONS.map((option) => {
                  const current = option.role === member.role;
                  return (
                    <Pressable
                      key={option.role}
                      accessibilityRole="button"
                      accessibilityLabel={`Make ${firstName} ${rolePhrase(option.role)}`}
                      accessibilityState={{ selected: current, disabled: busy || current }}
                      disabled={busy || current}
                      onPress={() => onChangeRole(option.role)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: current ? palette.muted : 'transparent',
                          borderColor: palette.border,
                          opacity: busy && !current ? 0.5 : pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <View style={styles.optionText}>
                        <AppText variant="bodyStrong">{option.title}</AppText>
                        <AppText variant="caption" tone="muted">
                          {option.body}
                        </AppText>
                      </View>
                      {current ? (
                        <View style={[styles.check, { backgroundColor: palette.primary }]}>
                          <Ionicons name="checkmark" size={13} color={palette.primaryForeground} />
                        </View>
                      ) : (
                        <AppText variant="caption" tone="muted" style={styles.optionLabel}>
                          {ROLE_LABEL[option.role]}
                        </AppText>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Button
                label="Remove from trip"
                variant="ghost"
                size="sm"
                disabled={busy}
                icon={<Ionicons name="person-remove-outline" size={16} color={palette.foreground} />}
                onPress={() => setConfirming(true)}
              />
            </>
          )}
        </View>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { letterSpacing: 1 },
  options: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  optionText: { flex: 1, gap: 1 },
  optionLabel: { letterSpacing: 0.4 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { gap: space.sm },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
});
