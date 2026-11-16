import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError, TextField } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

function SheetShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  scroll = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={styles.body}>{children}</View>
  );

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
        <View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="heading">{title}</AppText>
              {subtitle ? (
                <AppText variant="caption" tone="muted">
                  {subtitle}
                </AppText>
              ) : null}
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

          {scroll ? (
            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {body}
            </ScrollView>
          ) : (
            body
          )}

          {footer ? (
            <View style={[styles.footer, { borderTopColor: palette.border }]}>{footer}</View>
          ) : null}
          <View style={{ height: insets.bottom + space.sm }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Poll composer ------------------------------------------------------------ */

const MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;

export function PollSheet({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => void;
}) {
  const { palette } = useTheme();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [formError, setFormError] = useState<string | null>(null);

  const setOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, at) => (at === index ? value : option)));
  };

  const submit = () => {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!trimmedQuestion) {
      setFormError('Write the question first.');
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS) {
      setFormError('Give people at least two choices.');
      return;
    }
    const seen = new Set<string>();
    for (const option of trimmedOptions) {
      const key = option.toLowerCase();
      if (seen.has(key)) {
        setFormError('Two choices read the same — make them distinct.');
        return;
      }
      seen.add(key);
    }
    setFormError(null);
    onSubmit(trimmedQuestion, trimmedOptions);
  };

  return (
    <SheetShell
      title="Start a poll"
      subtitle="Only people on this trip can read the question and the votes."
      onClose={onClose}
      scroll
      footer={
        <>
          <Button label="Cancel" variant="ghost" size="sm" disabled={busy} onPress={onClose} />
          <Button
            label={busy ? 'Starting…' : 'Start the poll'}
            loading={busy}
            disabled={busy || !question.trim()}
            onPress={submit}
          />
        </>
      }
    >
      <TextField
        label="The question"
        value={question}
        onChangeText={setQuestion}
        placeholder="Where should we stay on the last night?"
        maxLength={160}
        multiline
        style={styles.questionInput}
      />

      <View style={styles.optionsHead}>
        <AppText variant="label">Choices</AppText>
        <AppText variant="caption" tone="muted">
          {options.length} of {MAX_OPTIONS}
        </AppText>
      </View>

      {options.map((option, index) => (
        <View key={`option-${index}`} style={styles.optionRow}>
          <TextField
            label={`Choice ${index + 1}`}
            value={option}
            onChangeText={(value) => setOption(index, value)}
            placeholder={index === 0 ? 'The lake house' : 'The old town rooms'}
            maxLength={80}
            containerStyle={styles.optionField}
          />
          {options.length > MIN_OPTIONS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove choice ${index + 1}`}
              hitSlop={8}
              disabled={busy}
              onPress={() => setOptions((current) => current.filter((_, at) => at !== index))}
              style={styles.removeOption}
            >
              <Ionicons name="close" size={16} color={palette.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {options.length < MAX_OPTIONS ? (
        <Button
          label="Add another choice"
          variant="secondary"
          size="sm"
          disabled={busy}
          onPress={() => setOptions((current) => [...current, ''])}
        />
      ) : null}

      <InlineError message={formError ?? error} />
    </SheetShell>
  );
}

/* Generic picker ----------------------------------------------------------- */

export interface ChoiceOption {
  key: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
}

export function ChoiceSheet({
  title,
  subtitle,
  options,
  selectedKey,
  onSelect,
  onClose,
}: {
  title: string;
  subtitle?: string;
  options: ChoiceOption[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();

  return (
    <SheetShell title={title} subtitle={subtitle} onClose={onClose} scroll>
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: selected ? palette.primary : palette.border,
                backgroundColor: selected ? palette.muted : 'transparent',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            {option.icon ? (
              <Ionicons name={option.icon} size={16} color={palette.primary} />
            ) : null}
            <View style={styles.choiceText}>
              <AppText variant="bodyStrong">{option.title}</AppText>
              {option.subtitle ? (
                <AppText variant="caption" tone="muted">
                  {option.subtitle}
                </AppText>
              ) : null}
            </View>
            {selected ? (
              <View style={[styles.check, { backgroundColor: palette.primary }]}>
                <Ionicons name="checkmark" size={13} color={palette.primaryForeground} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </SheetShell>
  );
}

/* Comment actions ---------------------------------------------------------- */

export function CommentActionsSheet({
  authorLabel,
  canEdit,
  canRemove,
  canDecide,
  busy,
  error,
  onEdit,
  onDecide,
  onRemove,
  onClose,
}: {
  authorLabel: string;
  canEdit: boolean;
  canRemove: boolean;
  canDecide: boolean;
  busy: boolean;
  error?: string | null;
  onEdit: () => void;
  onDecide: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const firstName = authorLabel.split(/\s+/)[0] || authorLabel;

  const action = (
    icon: IconName,
    title: string,
    body: string,
    onPress: () => void,
    danger = false
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: palette.border, opacity: pressed ? 0.75 : busy ? 0.5 : 1 },
      ]}
    >
      <Ionicons name={icon} size={17} color={danger ? palette.destructive : palette.primary} />
      <View style={styles.choiceText}>
        <AppText variant="bodyStrong" tone={danger ? 'danger' : undefined}>
          {title}
        </AppText>
        <AppText variant="caption" tone="muted">
          {body}
        </AppText>
      </View>
    </Pressable>
  );

  return (
    <SheetShell
      title="This message"
      subtitle={`${firstName}’s words in the conversation.`}
      onClose={onClose}
      scroll
    >
      <InlineError message={error} />
      {confirming ? (
        <View style={styles.confirm}>
          <AppText variant="bodyStrong">Remove this message?</AppText>
          <AppText variant="caption" tone="muted">
            It leaves an empty slot so the thread still reads in order.
          </AppText>
          <View style={styles.confirmActions}>
            <Button
              label="Keep it"
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
          {canDecide
            ? action(
                'bookmark-outline',
                'Mark as a decision',
                'Keep a lasting record of what the group agreed.',
                onDecide
              )
            : null}
          {canEdit
            ? action(
                'create-outline',
                'Edit the wording',
                'Only you can change what you wrote.',
                onEdit
              )
            : null}
          {canRemove
            ? action(
                'trash-outline',
                'Remove message',
                'The slot stays; the words go.',
                () => setConfirming(true),
                true
              )
            : null}
        </>
      )}
    </SheetShell>
  );
}

export function CommentEditSheet({
  initialText,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialText: string;
  busy: boolean;
  error?: string | null;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialText);

  return (
    <SheetShell
      title="Edit the message"
      subtitle="Everyone will see it updated, and it stays part of the thread."
      onClose={onClose}
      scroll
      footer={
        <>
          <Button label="Cancel" variant="ghost" size="sm" disabled={busy} onPress={onClose} />
          <Button
            label={busy ? 'Saving…' : 'Save changes'}
            loading={busy}
            disabled={busy || !draft.trim()}
            onPress={() => onSave(draft.trim())}
          />
        </>
      }
    >
      <TextField
        label="Message"
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={2000}
        style={styles.questionInput}
        autoFocus
      />
      <InlineError message={error} />
    </SheetShell>
  );
}

/* Poll management ---------------------------------------------------------- */

export function PollActionsSheet({
  closed,
  busy,
  error,
  onClosePoll,
  onRemove,
  onClose,
}: {
  closed: boolean;
  busy: boolean;
  error?: string | null;
  onClosePoll: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [confirming, setConfirming] = useState(false);

  return (
    <SheetShell
      title="This poll"
      subtitle="Whoever started a poll — or the trip owner — can manage it."
      onClose={onClose}
      scroll
    >
      <InlineError message={error} />
      {confirming ? (
        <View style={styles.confirm}>
          <AppText variant="bodyStrong">Remove this poll?</AppText>
          <AppText variant="caption" tone="muted">
            The question and every vote disappear from the conversation.
          </AppText>
          <View style={styles.confirmActions}>
            <Button
              label="Keep it"
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
          {!closed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close voting"
              disabled={busy}
              onPress={onClosePoll}
              style={({ pressed }) => [
                styles.choice,
                { borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="lock-closed-outline" size={17} color={palette.primary} />
              <View style={styles.choiceText}>
                <AppText variant="bodyStrong">Close voting</AppText>
                <AppText variant="caption" tone="muted">
                  The tally stays in the thread; no more votes come in.
                </AppText>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove poll"
            disabled={busy}
            onPress={() => setConfirming(true)}
            style={({ pressed }) => [
              styles.choice,
              { borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Ionicons name="trash-outline" size={17} color={palette.destructive} />
            <View style={styles.choiceText}>
              <AppText variant="bodyStrong" tone="danger">
                Remove poll
              </AppText>
              <AppText variant="caption" tone="muted">
                Take it out of the conversation entirely.
              </AppText>
            </View>
          </Pressable>
        </>
      )}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
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
  scroll: { flexGrow: 0 },
  body: { gap: space.md, paddingBottom: space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.md,
  },
  questionInput: { minHeight: 74, textAlignVertical: 'top' },
  optionsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  optionField: { flex: 1 },
  removeOption: { width: 36, height: 52, alignItems: 'center', justifyContent: 'center' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  choiceText: { flex: 1, gap: 1 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { gap: space.sm },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
});
