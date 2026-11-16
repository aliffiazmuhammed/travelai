import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
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

import type { TravellerInput, TripParticipant } from '@/api/expenses';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError, TextField } from '@/ui';

export interface SuggestedTraveller {
  name: string;
  isYou?: boolean;
}

interface TravellersSheetProps {
  participants: TripParticipant[];
  suggested: SuggestedTraveller[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (rows: TravellerInput[]) => void;
}

interface Row {
  key: string;
  id?: string;
  name: string;
  isMe: boolean;
}

const MAX_TRAVELLERS = 20;

/** The split list is per traveller, not per account, so names stay editable. */
export function TravellersSheet({
  participants,
  suggested,
  busy,
  error,
  onClose,
  onSave,
}: TravellersSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const nextKey = useRef(0);
  const makeKey = () => `new-${nextKey.current++}`;

  const [rows, setRows] = useState<Row[]>(() =>
    participants.map((participant, index) => ({
      key: participant._id || `saved-${index}`,
      id: participant._id,
      name: participant.name,
      isMe: Boolean(participant.isMe),
    }))
  );
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const named = rows.filter((row) => row.name.trim().length > 0);
  const missing = suggested.filter(
    (person) =>
      !rows.some((row) => row.name.trim().toLowerCase() === person.name.trim().toLowerCase())
  );
  const message = formError ?? error ?? null;

  const markMe = (key: string) => {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        isMe: row.key === key ? !row.isMe : false,
      }))
    );
  };

  const addName = (name: string, isYou = false) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (rows.length >= MAX_TRAVELLERS) {
      setFormError(`A trip supports up to ${MAX_TRAVELLERS} travellers.`);
      return;
    }
    if (rows.some((row) => row.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setFormError('That name is already on the list.');
      return;
    }
    setRows((current) => [
      ...current,
      { key: makeKey(), name: trimmed, isMe: isYou && !current.some((row) => row.isMe) },
    ]);
    setFormError(null);
  };

  const addDraft = () => {
    if (!draft.trim()) {
      setFormError('Type a name first.');
      return;
    }
    addName(draft);
    setDraft('');
  };

  const addSuggested = () => {
    const additions: Row[] = [];
    const taken = new Set(rows.map((row) => row.name.trim().toLowerCase()));
    const hasMe = rows.some((row) => row.isMe);

    for (const person of suggested) {
      const trimmed = person.name.trim();
      if (!trimmed || rows.length + additions.length >= MAX_TRAVELLERS) continue;
      if (taken.has(trimmed.toLowerCase())) continue;
      taken.add(trimmed.toLowerCase());
      additions.push({
        key: makeKey(),
        name: trimmed,
        isMe: Boolean(person.isYou) && !hasMe,
      });
    }

    if (additions.length > 0) setRows((current) => [...current, ...additions]);
    setFormError(null);
  };

  const save = () => {
    if (named.length === 0) {
      setFormError('Add at least one traveller before saving.');
      return;
    }
    setFormError(null);
    onSave(
      named.map((row) => ({
        ...(row.id ? { _id: row.id } : {}),
        name: row.name.trim(),
        isMe: row.isMe,
      }))
    );
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
          style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="heading">Who’s sharing costs?</AppText>
              <AppText variant="caption" tone="muted">
                Splits are per traveller, not per account. Mark yourself so your share lands on
                you.
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

          {message ? <InlineError message={message} /> : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {rows.length > 0 ? (
              rows.map((row) => (
                <View
                  key={row.key}
                  style={[styles.row, { borderColor: palette.border }]}
                >
                  <View
                    style={[
                      styles.initial,
                      { backgroundColor: row.isMe ? palette.primary : palette.muted },
                    ]}
                  >
                    <AppText
                      variant="label"
                      style={{ color: row.isMe ? palette.primaryForeground : palette.primary }}
                    >
                      {row.name.trim().slice(0, 1).toUpperCase() || '?'}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {row.name.trim() || 'Unnamed traveller'}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      row.isMe ? `Unmark ${row.name} as you` : `Mark ${row.name} as you`
                    }
                    accessibilityState={{ selected: row.isMe }}
                    disabled={busy}
                    onPress={() => markMe(row.key)}
                    style={[
                      styles.meChip,
                      {
                        backgroundColor: row.isMe ? palette.primary : 'transparent',
                        borderColor: row.isMe ? palette.primary : palette.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      style={{ color: row.isMe ? palette.primaryForeground : palette.mutedForeground }}
                    >
                      You
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${row.name}`}
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                    style={styles.remove}
                  >
                    <Ionicons name="close" size={16} color={palette.mutedForeground} />
                  </Pressable>
                </View>
              ))
            ) : (
              <AppText variant="caption" tone="muted">
                No travellers yet. Add everyone who shares costs — including you.
              </AppText>
            )}

            {missing.length > 0 ? (
              <Button
                label={`Add ${missing.length} from this trip`}
                variant="secondary"
                size="sm"
                disabled={busy || rows.length >= MAX_TRAVELLERS}
                onPress={addSuggested}
              />
            ) : null}

            <View style={styles.addRow}>
              <TextField
                label="Add a traveller"
                value={draft}
                onChangeText={setDraft}
                placeholder="Name"
                maxLength={60}
                containerStyle={styles.draftField}
                onSubmitEditing={addDraft}
                returnKeyType="done"
              />
              <Button
                label="Add"
                variant="secondary"
                size="sm"
                disabled={busy || !draft.trim() || rows.length >= MAX_TRAVELLERS}
                onPress={addDraft}
              />
            </View>

            <AppText variant="caption" tone="muted">
              Up to {MAX_TRAVELLERS} travellers. Names can be edited later; existing splits keep
              their ids.
            </AppText>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            <Button label="Cancel" variant="ghost" size="sm" disabled={busy} onPress={onClose} />
            <Button
              label={busy ? 'Saving…' : 'Save travellers'}
              loading={busy}
              disabled={busy || named.length === 0}
              onPress={save}
            />
          </View>
          <View style={{ height: insets.bottom + space.sm }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  body: { flexGrow: 0 },
  list: { gap: space.sm, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 52,
  },
  initial: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1 },
  meChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  draftField: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.md,
  },
});
