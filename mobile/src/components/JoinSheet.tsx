import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JOIN_MESSAGE_MAX } from '@/api/joinRequests';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError, TextField } from '@/ui';

interface JoinSheetProps {
  visible: boolean;
  hostName: string;
  /** Lifted so the screen can clear it when the sheet opens or closes. */
  message: string;
  onChangeMessage: (message: string) => void;
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: () => void;
}

/** The note that goes with a join request — the owner sees it in their queue. */
export function JoinSheet({
  visible,
  hostName,
  message,
  onChangeMessage,
  submitting,
  error,
  onClose,
  onSubmit,
}: JoinSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
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
              <AppText variant="heading">Ask to join</AppText>
              <AppText variant="caption" tone="muted">
                {hostName} will see your name and this note. Keep it short and honest.
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

          <TextField
            label="Your note (optional)"
            value={message}
            onChangeText={onChangeMessage}
            placeholder="Hi! I'd love to come along because…"
            maxLength={JOIN_MESSAGE_MAX}
            multiline
            numberOfLines={4}
            style={styles.noteInput}
            hint={`${message.length}/${JOIN_MESSAGE_MAX}`}
          />

          <View style={styles.actions}>
            <Button
              label="Not yet"
              variant="ghost"
              size="sm"
              onPress={onClose}
              disabled={submitting}
            />
            <Button
              label={submitting ? 'Sending…' : 'Send request'}
              loading={submitting}
              onPress={onSubmit}
            />
          </View>
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
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: { minHeight: 108, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
