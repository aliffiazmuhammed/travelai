import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ComponentProps } from 'react';
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

import type {
  ExpenseCategory,
  ExpenseInput,
  ExpenseSplitMode,
  ReceiptFile,
  TripExpense,
  TripParticipant,
} from '@/api/expenses';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  getCategoryMeta,
  isPdfReceipt,
  receiptError as receiptFileError,
  receiptKindLabel,
  RECEIPT_MAX_MB,
} from '@/lib/expenses';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError, TextField } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Picker = 'currency' | 'category' | 'payer';

interface ExpenseSheetProps {
  baseCurrency: string;
  participants: TripParticipant[];
  /** Present when editing an existing row; absent when adding. */
  expense?: TripExpense | null;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (
    input: ExpenseInput,
    receipt?: { file?: ReceiptFile | null; remove?: boolean }
  ) => void;
  onDelete?: () => void;
  deleteBusy?: boolean;
  /** Opens a stored receipt in the device browser/viewer. */
  onViewReceipt?: (url: string) => void;
}

function FieldRow({
  label,
  value,
  icon,
  open,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  icon?: IconName;
  open: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ expanded: open, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        {
          backgroundColor: palette.card,
          borderColor: open ? palette.primary : palette.border,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={palette.mutedForeground} /> : null}
      <View style={styles.fieldText}>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {value}
        </AppText>
      </View>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={15}
        color={palette.mutedForeground}
      />
    </Pressable>
  );
}

function OptionRow({
  label,
  detail,
  selected,
  icon,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  icon?: IconName;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? palette.muted : 'transparent',
          borderColor: selected ? palette.primary : palette.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={palette.primary} /> : null}
      <View style={styles.optionText}>
        <AppText variant="bodyStrong">{label}</AppText>
        {detail ? (
          <AppText variant="caption" tone="muted">
            {detail}
          </AppText>
        ) : null}
      </View>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={18}
        color={selected ? palette.primary : palette.mutedForeground}
      />
    </Pressable>
  );
}

function amountFrom(text: string): number {
  return Number(text.replace(/,/g, '').trim());
}

/** One expense, added or edited on its own sheet so the form always starts fresh. */
export function ExpenseSheet({
  baseCurrency,
  participants,
  expense,
  busy,
  error,
  onClose,
  onSubmit,
  onDelete,
  deleteBusy,
  onViewReceipt,
}: ExpenseSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const base = (baseCurrency || 'INR').toUpperCase();
  const me = participants.find((participant) => participant.isMe);

  const [label, setLabel] = useState(expense?.label ?? '');
  const [amountText, setAmountText] = useState(expense ? String(expense.amount) : '');
  const [currency, setCurrency] = useState((expense?.currency ?? base).toUpperCase());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'food_and_drinks');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? me?._id ?? '');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>(
    expense?.splitMode ?? (participants.length > 0 ? 'equal' : 'none')
  );
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<ReceiptFile | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [showReceiptChoices, setShowReceiptChoices] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [pickingReceipt, setPickingReceipt] = useState(false);

  const existingReceipt = expense?.receiptUrl;

  const acceptReceipt = (file: ReceiptFile, size?: number) => {
    const problem = receiptFileError({ type: file.type, size, name: file.name });
    if (problem) {
      setReceiptError(problem);
      return;
    }
    setReceiptFile(file);
    setRemoveReceipt(false);
    setShowReceiptChoices(false);
    setReceiptError(null);
  };

  const extensionFor = (type: string) =>
    type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'application/pdf' ? 'pdf' : 'jpg';

  const choosePhoto = async () => {
    if (pickingReceipt) return;
    setPickingReceipt(true);
    setReceiptError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setReceiptError(
          'Photo access is off. Turn it on in your device settings to choose a receipt.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const type = (asset.mimeType || 'image/jpeg').toLowerCase();
      acceptReceipt(
        {
          uri: asset.uri,
          name: asset.fileName || `receipt-${Date.now()}.${extensionFor(type)}`,
          type,
          file: Platform.OS === 'web' ? await (await fetch(asset.uri)).blob() : undefined,
        },
        asset.fileSize
      );
    } catch {
      setReceiptError('That photo couldn’t be opened. Try another one.');
    } finally {
      setPickingReceipt(false);
    }
  };

  const chooseFile = async () => {
    if (pickingReceipt) return;
    setPickingReceipt(true);
    setReceiptError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const type = (asset.mimeType || 'application/pdf').toLowerCase();
      acceptReceipt(
        {
          uri: asset.uri,
          name: asset.name || `receipt-${Date.now()}.${extensionFor(type)}`,
          type,
          file:
            asset.file ??
            (Platform.OS === 'web' ? await (await fetch(asset.uri)).blob() : undefined),
        },
        asset.size
      );
    } catch {
      setReceiptError('That file couldn’t be opened. Try another one.');
    } finally {
      setPickingReceipt(false);
    }
  };

  const numericAmount = amountFrom(amountText);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const labelValid = label.trim().length > 0;
  const canSubmit = labelValid && amountValid && !busy && !deleteBusy;
  const payer = participants.find((participant) => participant._id === paidBy);
  const categoryMeta = getCategoryMeta(category);
  const message = formError ?? error ?? null;
  const customSplit = splitMode === 'custom';

  const toggle = (next: Picker) => setPicker((current) => (current === next ? null : next));

  const submit = () => {
    if (!labelValid) {
      setFormError('Give the spend a short name, like "Jeep to Mandalpatti".');
      return;
    }
    if (!amountValid) {
      setFormError('Enter an amount above zero.');
      return;
    }
    setFormError(null);
    onSubmit(
      {
        label: label.trim(),
        category,
        amount: numericAmount,
        currency,
        paidBy: paidBy || undefined,
        splitMode: splitMode === 'custom' ? undefined : splitMode,
        notes: notes.trim() || undefined,
      },
      {
        file: receiptFile,
        remove: removeReceipt && !receiptFile,
      }
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
          style={[
            styles.sheet,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="heading">
                {expense ? 'Edit this expense' : 'Add an expense'}
              </AppText>
              <AppText variant="caption" tone="muted">
                What was spent, who paid, and who shares it.
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
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              label="What was it?"
              value={label}
              onChangeText={setLabel}
              placeholder="Jeep to Mandalpatti"
              maxLength={120}
              autoFocus={!expense}
            />

            <View style={styles.amountRow}>
              <TextField
                label="Amount"
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0"
                keyboardType="decimal-pad"
                maxLength={12}
                containerStyle={styles.amountField}
              />
              <View style={styles.currencyField}>
                <AppText variant="label" style={styles.currencyLabel}>
                  Currency
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Currency: ${currency}`}
                  accessibilityState={{ expanded: picker === 'currency' }}
                  onPress={() => toggle('currency')}
                  style={({ pressed }) => [
                    styles.currencyBox,
                    {
                      backgroundColor: palette.card,
                      borderColor: picker === 'currency' ? palette.primary : palette.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <AppText variant="bodyStrong">{currency}</AppText>
                  <Ionicons name="chevron-down" size={14} color={palette.mutedForeground} />
                </Pressable>
              </View>
            </View>

            {currency !== base ? (
              <AppText variant="caption" tone="muted">
                We convert it to {base} at today’s rate when you save.
              </AppText>
            ) : null}

            {picker === 'currency' ? (
              <View style={styles.options}>
                {CURRENCIES.map((option) => (
                  <OptionRow
                    key={option.code}
                    label={`${option.symbol} ${option.code}`}
                    detail={option.name}
                    selected={option.code === currency}
                    onPress={() => {
                      setCurrency(option.code);
                      setPicker(null);
                    }}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.group}>
              <FieldRow
                label="Category"
                value={categoryMeta.label}
                icon={categoryMeta.icon}
                open={picker === 'category'}
                onPress={() => toggle('category')}
              />
              {picker === 'category' ? (
                <View style={styles.options}>
                  {EXPENSE_CATEGORIES.map((option) => (
                    <OptionRow
                      key={option.id}
                      label={option.label}
                      icon={option.icon}
                      selected={option.id === category}
                      onPress={() => {
                        setCategory(option.id);
                        setPicker(null);
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.group}>
              <FieldRow
                label="Paid by"
                value={payer?.name ?? 'Not assigned'}
                icon="person-outline"
                open={picker === 'payer'}
                onPress={() => toggle('payer')}
              />
              {picker === 'payer' ? (
                <View style={styles.options}>
                  {participants.map((participant) => (
                    <OptionRow
                      key={participant._id}
                      label={participant.name}
                      detail={participant.isMe ? 'You' : undefined}
                      selected={participant._id === paidBy}
                      onPress={() => {
                        setPaidBy(participant._id);
                        setPicker(null);
                      }}
                    />
                  ))}
                  <OptionRow
                    label="Not assigned"
                    detail="Borne by nobody in particular"
                    selected={paidBy === ''}
                    onPress={() => {
                      setPaidBy('');
                      setPicker(null);
                    }}
                  />
                </View>
              ) : null}
            </View>

            <View style={styles.group}>
              <AppText variant="label">Who shares it?</AppText>
              {customSplit ? (
                <View style={[styles.note, { backgroundColor: palette.muted }]}>
                  <AppText variant="caption" tone="muted">
                    This one uses custom amounts from the web. Pick an even split below to
                    recalculate it, or edit the name and amount and the shares scale with it.
                  </AppText>
                </View>
              ) : null}
              <View style={styles.options}>
                <OptionRow
                  label="Split evenly"
                  detail={
                    participants.length > 0
                      ? `${participants.length} ${participants.length === 1 ? 'traveller' : 'travellers'} share it equally`
                      : 'Add travellers first'
                  }
                  selected={splitMode === 'equal'}
                  onPress={() => {
                    if (participants.length > 0) setSplitMode('equal');
                  }}
                />
                <OptionRow
                  label="Don’t split"
                  detail="The payer carries the whole amount"
                  selected={splitMode === 'none'}
                  onPress={() => setSplitMode('none')}
                />
                {customSplit ? (
                  <OptionRow
                    label="Custom amounts"
                    detail="Set on the web"
                    selected
                    onPress={() => undefined}
                  />
                ) : null}
              </View>
            </View>

            <TextField
              label="Note (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Split five ways, tip included"
              multiline
              numberOfLines={3}
              maxLength={500}
              style={styles.notes}
            />

            <View style={styles.group}>
              <AppText variant="label">Receipt (optional)</AppText>

              {receiptFile ? (
                <View style={[styles.receiptCard, { backgroundColor: palette.muted, borderColor: palette.border }]}>
                  <Ionicons
                    name={isPdfReceipt(receiptFile.name) ? 'document-text-outline' : 'image-outline'}
                    size={18}
                    color={palette.primary}
                  />
                  <View style={styles.receiptText}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {receiptFile.name}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      Attached when you save
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove chosen receipt"
                    hitSlop={8}
                    onPress={() => setReceiptFile(null)}
                  >
                    <Ionicons name="close-circle" size={20} color={palette.mutedForeground} />
                  </Pressable>
                </View>
              ) : existingReceipt && !removeReceipt ? (
                <>
                  <View style={[styles.receiptCard, { backgroundColor: palette.muted, borderColor: palette.border }]}>
                    <Ionicons
                      name={isPdfReceipt(existingReceipt) ? 'document-text-outline' : 'image-outline'}
                      size={18}
                      color={palette.primary}
                    />
                    <View style={styles.receiptText}>
                      <AppText variant="bodyStrong">{receiptKindLabel(existingReceipt)}</AppText>
                      <AppText variant="caption" tone="muted">
                        Stored with this expense
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.receiptActions}>
                    <Button
                      label="View"
                      variant="secondary"
                      size="sm"
                      icon={<Ionicons name="eye-outline" size={15} color={palette.secondaryForeground} />}
                      onPress={() => onViewReceipt?.(existingReceipt)}
                    />
                    <Button
                      label="Replace"
                      variant="ghost"
                      size="sm"
                      disabled={pickingReceipt}
                      onPress={() => {
                        setReceiptError(null);
                        setShowReceiptChoices(true);
                      }}
                    />
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setReceiptError(null);
                        setRemoveReceipt(true);
                      }}
                    />
                  </View>
                </>
              ) : removeReceipt ? (
                <View style={[styles.receiptCard, { backgroundColor: palette.muted, borderColor: palette.border }]}>
                  <Ionicons name="trash-outline" size={18} color={palette.destructive} />
                  <View style={styles.receiptText}>
                    <AppText variant="bodyStrong">Receipt will be removed</AppText>
                    <AppText variant="caption" tone="muted">
                      Saved without the attachment
                    </AppText>
                  </View>
                  <Button
                    label="Undo"
                    variant="ghost"
                    size="sm"
                    onPress={() => setRemoveReceipt(false)}
                  />
                </View>
              ) : null}

              {!receiptFile && (!existingReceipt || removeReceipt || showReceiptChoices) ? (
                <View style={styles.receiptActions}>
                  <Button
                    label={pickingReceipt ? 'Opening…' : 'Photo library'}
                    variant="secondary"
                    size="sm"
                    icon={<Ionicons name="image-outline" size={15} color={palette.secondaryForeground} />}
                    disabled={pickingReceipt}
                    onPress={() => void choosePhoto()}
                  />
                  <Button
                    label="Choose file"
                    variant="secondary"
                    size="sm"
                    icon={
                      <Ionicons name="document-outline" size={15} color={palette.secondaryForeground} />
                    }
                    disabled={pickingReceipt}
                    onPress={() => void chooseFile()}
                  />
                </View>
              ) : null}

              {receiptError ? (
                <AppText variant="caption" tone="danger">
                  {receiptError}
                </AppText>
              ) : !receiptFile && existingReceipt && !removeReceipt && !showReceiptChoices ? null : (
                <AppText variant="caption" tone="muted">
                  JPEG, PNG, WebP or PDF, up to {RECEIPT_MAX_MB} MB.
                </AppText>
              )}
            </View>

            {confirmDelete && onDelete ? (
              <View style={[styles.confirm, { borderColor: palette.border }]}>
                <AppText variant="bodyStrong">Delete this expense?</AppText>
                <AppText variant="caption" tone="muted">
                  It comes out of the ledger and the balances recalculate right away.
                </AppText>
                <View style={styles.confirmActions}>
                  <Button
                    label="Keep it"
                    variant="ghost"
                    size="sm"
                    onPress={() => setConfirmDelete(false)}
                  />
                  <Button
                    label={deleteBusy ? 'Deleting…' : 'Delete'}
                    variant="danger"
                    size="sm"
                    loading={deleteBusy}
                    onPress={onDelete}
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            {expense && onDelete && !confirmDelete ? (
              <Button
                label="Delete"
                variant="ghost"
                size="sm"
                icon={<Ionicons name="trash-outline" size={15} color={palette.destructive} />}
                disabled={busy || deleteBusy}
                onPress={() => setConfirmDelete(true)}
              />
            ) : (
              <Button
                label="Cancel"
                variant="ghost"
                size="sm"
                disabled={busy || deleteBusy}
                onPress={onClose}
              />
            )}
            <Button
              label={busy ? 'Saving…' : expense ? 'Save expense' : 'Add to ledger'}
              loading={busy}
              disabled={!canSubmit}
              onPress={submit}
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
  form: { gap: space.md, paddingBottom: space.sm },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  amountField: { flex: 1 },
  currencyField: { width: 132, gap: 6 },
  currencyLabel: { marginBottom: 0 },
  currencyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  group: { gap: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fieldText: { flex: 1, gap: 1 },
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
  note: { borderRadius: radius.md, padding: space.md },
  notes: { minHeight: 84, textAlignVertical: 'top' },
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  receiptText: { flex: 1, gap: 1 },
  receiptActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  confirm: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.md,
  },
});
