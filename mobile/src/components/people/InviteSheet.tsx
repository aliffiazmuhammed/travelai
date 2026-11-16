import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { InvitableRole } from '@/api/people';
import { ROLE_LABEL } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError } from '@/ui';

const ROLE_OPTIONS: { role: InvitableRole; body: string }[] = [
  { role: 'editor', body: 'Can shape the plan with you.' },
  { role: 'commenter', body: 'Can comment and join the conversation.' },
  { role: 'viewer', body: 'Can follow along, read-only.' },
];

interface InviteSheetProps {
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (role: InvitableRole) => void;
}

/** Creates a shareable link; the role chosen here is what the link grants. */
export function InviteSheet({ busy, error, onClose, onCreate }: InviteSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<InvitableRole>('commenter');

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
            <View style={styles.headerText}>
              <AppText variant="heading">Invite someone in</AppText>
              <AppText variant="caption" tone="muted">
                Anyone with the link joins as the role you pick. You can revoke it any time.
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

          <View style={styles.options}>
            {ROLE_OPTIONS.map((option) => {
              const selected = option.role === role;
              return (
                <Pressable
                  key={option.role}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite as ${ROLE_LABEL[option.role].toLowerCase()}`}
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => setRole(option.role)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: selected ? palette.muted : 'transparent',
                      borderColor: selected ? palette.primary : palette.border,
                      opacity: busy ? 0.55 : pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View style={styles.optionText}>
                    <AppText variant="bodyStrong">Invite as {ROLE_LABEL[option.role].toLowerCase()}</AppText>
                    <AppText variant="caption" tone="muted">
                      {option.body}
                    </AppText>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? palette.primary : palette.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>

          <Button
            label={busy ? 'Creating…' : 'Create invite link'}
            loading={busy}
            onPress={() => onCreate(role)}
          />
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
