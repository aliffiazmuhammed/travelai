import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  createTripExpense,
  deleteExpenseReceipt,
  deleteTripExpense,
  fetchExpenseLedger,
  saveTripTravellers,
  updateTripExpense,
  uploadExpenseReceipt,
  type ExpenseInput,
  type ReceiptFile,
  type TripExpense,
  type TravellerInput,
} from '@/api/expenses';
import { fetchTripMembers } from '@/api/people';
import { fetchMyTrip } from '@/api/trips';
import { useSession } from '@/auth/SessionProvider';
import { ExpenseSheet } from '@/components/expenses/ExpenseSheet';
import { TravellersSheet } from '@/components/expenses/TravellersSheet';
import {
  baseAmountOf,
  computeBalances,
  expenseDay,
  formatMoney,
  getCategoryMeta,
  isPdfReceipt,
  payerName,
  receiptLink,
  settleTransfers,
  splitLabel,
} from '@/lib/expenses';
import { tripTitle } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, Screen, Skeleton } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const EXPENSE_PAGE = 6;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/** The server pushes new expenses at the end; `createdAt` settles any reordering. */
function newestExpenseId(rows: TripExpense[]): string | null {
  if (rows.length === 0) return null;
  let newest = rows[rows.length - 1];
  let newestTime = new Date(newest.createdAt ?? 0).getTime() || 0;
  for (const row of rows) {
    const time = new Date(row.createdAt ?? 0).getTime() || 0;
    if (time >= newestTime) {
      newest = row;
      newestTime = time;
    }
  }
  return newest._id;
}

function CardHead({ icon, title, count }: { icon: IconName; title: string; count?: number }) {
  const { palette } = useTheme();

  return (
    <View style={styles.cardHead}>
      <Ionicons name={icon} size={16} color={palette.primary} />
      <AppText variant="heading" style={styles.cardTitle}>
        {title}
      </AppText>
      {typeof count === 'number' ? (
        <View style={[styles.countPill, { backgroundColor: palette.muted }]}>
          <AppText variant="caption" tone="muted">
            {count}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <View style={styles.pager}>
      <Button
        label="Previous"
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <AppText variant="caption" tone="muted">
        Page {page} of {pageCount}
      </AppText>
      <Button
        label="Next"
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}

function ExpensesSkeleton() {
  return (
    <View style={styles.page}>
      <View style={styles.titleBlock}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="75%" height={34} />
        <Skeleton width="65%" height={14} />
      </View>
      <Card style={styles.skeletonCard}>
        <Skeleton width="35%" height={36} />
        <Skeleton height={13} />
        <Skeleton width="55%" height={13} />
      </Card>
      <Card style={styles.skeletonCard}>
        <Skeleton width="40%" height={20} />
        <Skeleton height={48} radius={radius.lg} />
        <Skeleton height={48} radius={radius.lg} />
      </Card>
    </View>
  );
}

export default function ExpensesScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;
  const id = tripId ?? '';

  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [travellersOpen, setTravellersOpen] = useState(false);
  const [travellersError, setTravellersError] = useState<string | null>(null);
  const [ledgerNote, setLedgerNote] = useState<{ text: string; error: boolean } | null>(null);

  const tripQuery = useQuery({
    queryKey: ['my-trip', tripId],
    queryFn: () => (tripId ? fetchMyTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
  const trip = tripQuery.data;
  const role = trip?.role;
  const canEdit = role === 'owner' || role === 'editor';

  const ledgerQuery = useQuery({
    queryKey: ['expense-ledger', tripId],
    queryFn: () => fetchExpenseLedger(id),
    enabled: Boolean(tripId),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });

  const membersQuery = useQuery({
    queryKey: ['members', tripId],
    queryFn: () => fetchTripMembers(id),
    enabled: Boolean(tripId) && canEdit,
    retry: 1,
  });

  const ledger = ledgerQuery.data;
  const base = (ledger?.finance.baseCurrency || 'INR').toUpperCase();
  const participants = useMemo(() => ledger?.participants ?? [], [ledger?.participants]);

  const expenses = useMemo(() => {
    const time = (expense: TripExpense) =>
      new Date(expense.date ?? expense.createdAt ?? 0).getTime() || 0;
    return [...(ledger?.expenses ?? [])].sort((a, b) => time(b) - time(a));
  }, [ledger?.expenses]);

  const total = useMemo(
    () => expenses.reduce((sum, expense) => sum + baseAmountOf(expense), 0),
    [expenses]
  );

  const balances = useMemo(() => computeBalances(expenses, participants), [expenses, participants]);
  const transfers = useMemo(() => settleTransfers(balances), [balances]);
  const nameOf = (participantId: string) =>
    participants.find((participant) => participant._id === participantId)?.name ?? 'Someone';
  // Who "you" are comes from the member link; the stored isMe flag is the
  // whole list's marker, not this viewer's, so only trust it for editors.
  const myParticipant =
    participants.find((participant) => user?._id && participant.userId === user._id) ??
    (canEdit ? participants.find((participant) => participant.isMe) : undefined);
  const myBalance = myParticipant
    ? balances.find((balance) => balance.participantId === myParticipant._id)
    : undefined;

  const pageCount = Math.max(1, Math.ceil(expenses.length / EXPENSE_PAGE));
  const safePage = Math.min(page, pageCount);
  const visibleExpenses = expenses.slice((safePage - 1) * EXPENSE_PAGE, safePage * EXPENSE_PAGE);

  const suggested = (membersQuery.data ?? []).map((member) => ({
    name: member.label,
    isYou: Boolean(member.isYou),
  }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['expense-ledger', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['my-trip', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['my-trips'] });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingExpense(null);
    setSheetError(null);
  };

  const saveExpense = useMutation({
    mutationFn: async ({
      input,
      receipt,
    }: {
      input: ExpenseInput;
      receipt?: { file?: ReceiptFile | null; remove?: boolean };
    }): Promise<{ text: string; error: boolean } | null> => {
      const rows = editingExpense
        ? await updateTripExpense(id, editingExpense._id, input)
        : await createTripExpense(id, input);

      if (!receipt?.file && !receipt?.remove) return null;
      // The expense itself is saved; a receipt problem must not lose it, so it
      // is reported instead of rethrowing (a retry would add a duplicate).
      const expenseId = editingExpense?._id ?? newestExpenseId(rows);
      if (!expenseId) return null;

      try {
        if (receipt.file) {
          await uploadExpenseReceipt(id, expenseId, receipt.file);
          return { text: 'Receipt attached.', error: false };
        }
        await deleteExpenseReceipt(id, expenseId);
        return { text: 'Receipt removed.', error: false };
      } catch (error) {
        return {
          text: `Saved, but the receipt didn’t go through: ${messageOf(error)}`,
          error: true,
        };
      }
    },
    onSuccess: (note) => {
      refresh();
      closeSheet();
      setLedgerNote(note);
    },
    onError: (error) => setSheetError(messageOf(error)),
  });

  const removeExpense = useMutation({
    mutationFn: (expenseId: string) => deleteTripExpense(id, expenseId),
    onSuccess: () => {
      refresh();
      closeSheet();
    },
    onError: (error) => setSheetError(messageOf(error)),
  });

  const saveTravellers = useMutation({
    mutationFn: (rows: TravellerInput[]) =>
      saveTripTravellers(id, Number(trip?.rev ?? 1), rows),
    onSuccess: () => {
      refresh();
      setTravellersOpen(false);
      setTravellersError(null);
    },
    onError: (error) => setTravellersError(messageOf(error)),
  });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/trips');
  };

  const openAdd = () => {
    setEditingExpense(null);
    setSheetError(null);
    setLedgerNote(null);
    setSheetOpen(true);
  };

  const openEdit = (expense: TripExpense) => {
    setEditingExpense(expense);
    setSheetError(null);
    setLedgerNote(null);
    setSheetOpen(true);
  };

  const openReceipt = (url?: string | null) => {
    const target = receiptLink(url);
    if (!target) return;
    Linking.openURL(target).catch(() => {
      setLedgerNote({ text: 'That receipt couldn’t be opened on this device.', error: true });
    });
  };

  const topRow = (right?: ReactNode) => (
    <View style={styles.topRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
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

  const addAction = canEdit ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add expense"
      onPress={openAdd}
      style={({ pressed }) => [
        styles.addAction,
        { backgroundColor: palette.primary, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <Ionicons name="add" size={15} color={palette.primaryForeground} />
      <AppText variant="label" style={{ color: palette.primaryForeground }}>
        Add
      </AppText>
    </Pressable>
  ) : undefined;

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow()}
        <ExpensesSkeleton />
      </Screen>
    );
  }

  if (!trip || tripQuery.isError) {
    const status = tripQuery.error instanceof ApiError ? tripQuery.error.status : 0;
    const forbidden = status === 403;
    const notFound = status === 404;

    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow()}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={forbidden ? 'lock-closed-outline' : notFound ? 'map-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {forbidden
                ? 'This ledger is for its members'
                : notFound
                  ? 'This trip has moved on'
                  : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {forbidden
                ? 'Your account doesn’t have access. If someone shared this trip with you, ask them for a fresh invite.'
                : notFound
                  ? 'It may have been deleted, or the link is out of date.'
                  : tripQuery.error instanceof Error
                    ? tripQuery.error.message
                    : 'This ledger could not be loaded right now.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to your trips" onPress={() => router.navigate('/trips')} />
              {!forbidden && !notFound ? (
                <Button label="Try again" variant="secondary" onPress={() => tripQuery.refetch()} />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const budget = trip.tripDetails?.budget_per_person;
  const readOnlyLine = `Only the owner and editors change the ledger for ${tripTitle(trip)}.`;
  const plannedTotal =
    typeof budget === 'number' && budget > 0 && participants.length > 0
      ? budget * participants.length
      : null;
  const budgetPct =
    plannedTotal && plannedTotal > 0 ? Math.round((total / plannedTotal) * 100) : null;

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow(addAction)}

        <View style={styles.page}>
          <View style={styles.titleBlock}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                MONEY
              </AppText>
            </View>
            <AppText variant="display">What it’s costing</AppText>
            <AppText variant="caption" tone="muted">
              Every spend, who paid, and who owes whom — no spreadsheet required.
            </AppText>
            {!canEdit ? (
              <View style={[styles.readOnly, { backgroundColor: palette.muted }]}>
                <Ionicons name="eye-outline" size={13} color={palette.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.readOnlyText}>
                  {readOnlyLine}
                </AppText>
              </View>
            ) : null}
          </View>

          {ledgerQuery.isPending ? (
            <Card style={styles.skeletonCard}>
              <Skeleton width="35%" height={36} />
              <Skeleton height={13} />
              <Skeleton width="55%" height={13} />
            </Card>
          ) : ledgerQuery.isError ? (
            <Card style={styles.errorCard}>
              <AppText variant="bodyStrong">The ledger didn’t load</AppText>
              <AppText variant="caption" tone="muted">
                {messageOf(ledgerQuery.error)}
              </AppText>
              <Button
                label="Try again"
                variant="secondary"
                size="sm"
                onPress={() => ledgerQuery.refetch()}
              />
            </Card>
          ) : (
            <>
              <Card
                style={[
                  styles.summaryCard,
                  { backgroundColor: palette.primary, borderColor: palette.primary },
                ]}
              >
                <View style={styles.summaryTop}>
                  <View style={styles.summaryText}>
                    <AppText
                      variant="caption"
                      style={[styles.summaryLabel, { color: palette.primaryForeground, opacity: 0.72 }]}
                    >
                      TOTAL SPENT
                    </AppText>
                    <AppText variant="display" style={{ color: palette.primaryForeground }}>
                      {formatMoney(total, base)}
                    </AppText>
                    <AppText
                      variant="caption"
                      style={{ color: palette.primaryForeground, opacity: 0.8 }}
                    >
                      {expenses.length === 0
                        ? 'Nothing logged yet.'
                        : `${expenses.length} ${expenses.length === 1 ? 'entry' : 'entries'} · ${
                            participants.length
                          } ${participants.length === 1 ? 'traveller' : 'travellers'}`}
                    </AppText>
                  </View>
                  <View style={[styles.summaryIcon, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                    <Ionicons name="wallet-outline" size={20} color={palette.primaryForeground} />
                  </View>
                </View>

                {myBalance ? (
                  <View style={[styles.myStrip, { borderTopColor: 'rgba(255,255,255,0.22)' }]}>
                    <View style={styles.myStripItem}>
                      <AppText
                        variant="caption"
                        style={{ color: palette.primaryForeground, opacity: 0.72 }}
                      >
                        Your share
                      </AppText>
                      <AppText variant="bodyStrong" style={{ color: palette.primaryForeground }}>
                        {formatMoney(myBalance.share, base)}
                      </AppText>
                    </View>
                    <View style={[styles.myStripItem, styles.myStripRight]}>
                      <AppText
                        variant="caption"
                        style={{ color: palette.primaryForeground, opacity: 0.72 }}
                      >
                        Standing
                      </AppText>
                      <AppText
                        variant="bodyStrong"
                        style={{
                          color:
                            myBalance.net > 0
                              ? palette.accent
                              : myBalance.net < 0
                                ? '#ffd0c2'
                                : palette.primaryForeground,
                        }}
                      >
                        {myBalance.net > 0
                          ? `Owed ${formatMoney(myBalance.net, base)}`
                          : myBalance.net < 0
                            ? `Owe ${formatMoney(-myBalance.net, base)}`
                            : 'All square'}
                      </AppText>
                    </View>
                  </View>
                ) : null}

                {plannedTotal && budgetPct !== null ? (
                  <View style={styles.budgetBarBlock}>
                    <View style={styles.budgetTrack}>
                      <View
                        style={[
                          styles.budgetFill,
                          { width: `${Math.min(budgetPct, 100)}%` as `${number}%` },
                        ]}
                      />
                    </View>
                    <AppText
                      variant="caption"
                      style={{ color: palette.primaryForeground, opacity: 0.8 }}
                    >
                      {budgetPct}% of the {formatMoney(plannedTotal, 'INR')} plan
                    </AppText>
                  </View>
                ) : typeof budget === 'number' && budget > 0 ? (
                  <AppText
                    variant="caption"
                    style={{ color: palette.primaryForeground, opacity: 0.75 }}
                  >
                    Planned at {formatMoney(budget, 'INR')} per person. The ledger tracks what was
                    actually spent.
                  </AppText>
                ) : null}
              </Card>

              {participants.length > 1 && expenses.length > 0 ? (
                <Card style={styles.card}>
                  <CardHead icon="swap-horizontal-outline" title="Who owes whom" />
                  <AppText variant="caption" tone="muted">
                    After every logged expense, in {base}.
                  </AppText>
                  <View style={styles.list}>
                    {balances.map((balance) => (
                      <View key={balance.participantId} style={styles.balanceRow}>
                        <Avatar name={balance.name} size={28} />
                        <AppText variant="bodyStrong" numberOfLines={1} style={styles.balanceName}>
                          {balance.name}
                        </AppText>
                        <AppText
                          variant="caption"
                          tone={balance.net > 0 ? 'primary' : balance.net < 0 ? 'danger' : 'muted'}
                        >
                          {balance.net > 0
                            ? `gets back ${formatMoney(balance.net, base)}`
                            : balance.net < 0
                              ? `owes ${formatMoney(-balance.net, base)}`
                              : 'all square'}
                        </AppText>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.divider, { backgroundColor: palette.border }]} />
                  <AppText variant="label">Settle up</AppText>
                  {transfers.length === 0 ? (
                    <AppText variant="caption" tone="muted">
                      Everyone’s square — nothing to send.
                    </AppText>
                  ) : (
                    <View style={styles.list}>
                      {transfers.map((transfer) => (
                        <View key={`${transfer.from}-${transfer.to}`} style={styles.transferRow}>
                          <AppText variant="bodyStrong" numberOfLines={1} style={styles.transferName}>
                            {nameOf(transfer.from)}
                          </AppText>
                          <Ionicons
                            name="arrow-forward"
                            size={13}
                            color={palette.mutedForeground}
                          />
                          <AppText variant="bodyStrong" numberOfLines={1} style={styles.transferName}>
                            {nameOf(transfer.to)}
                          </AppText>
                          <AppText variant="bodyStrong" style={styles.transferAmount}>
                            {formatMoney(transfer.amount, base)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              ) : null}

              <Card style={styles.card}>
                <CardHead icon="receipt-outline" title="The ledger" count={expenses.length} />
                <AppText variant="caption" tone="muted">
                  {canEdit
                    ? 'Newest first. Tap a row to edit it.'
                    : 'Newest first, exactly as they were logged.'}
                </AppText>

                {ledgerNote ? (
                  <AppText variant="caption" tone={ledgerNote.error ? 'danger' : 'primary'}>
                    {ledgerNote.text}
                  </AppText>
                ) : null}

                {expenses.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="receipt-outline" size={22} color={palette.mutedForeground} />
                    <AppText variant="bodyStrong">Nothing logged yet</AppText>
                    <AppText variant="caption" tone="muted">
                      Add the first spend and the split takes care of itself.
                    </AppText>
                    {canEdit ? (
                      <Button
                        label="Add an expense"
                        variant="secondary"
                        size="sm"
                        onPress={openAdd}
                      />
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.list}>
                    {visibleExpenses.map((expense) => {
                      const meta = getCategoryMeta(expense.category);
                      const payer = payerName(expense, participants);
                      const currency = (expense.currency ?? base).toUpperCase();
                      const metaLine = [
                        expenseDay(expense),
                        meta.label,
                        payer ? `paid by ${payer}` : '',
                        splitLabel(expense.splitMode),
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <Pressable
                          key={expense._id}
                          accessibilityRole={canEdit ? 'button' : undefined}
                          accessibilityLabel={canEdit ? `Edit ${expense.label}` : undefined}
                          disabled={!canEdit}
                          onPress={() => openEdit(expense)}
                          style={({ pressed }) => [
                            styles.expenseRow,
                            { borderColor: palette.border, opacity: pressed ? 0.72 : 1 },
                          ]}
                        >
                          <View style={[styles.categoryDot, { backgroundColor: meta.color }]}>
                            <Ionicons name={meta.icon} size={14} color="#ffffff" />
                          </View>
                          <View style={styles.expenseText}>
                            <AppText variant="bodyStrong" numberOfLines={1}>
                              {expense.label}
                            </AppText>
                            <AppText variant="caption" tone="muted" numberOfLines={1}>
                              {metaLine}
                            </AppText>
                            {expense.notes ? (
                              <AppText variant="caption" tone="muted" numberOfLines={1}>
                                {expense.notes}
                              </AppText>
                            ) : null}
                          </View>
                          {expense.receiptUrl ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="View receipt"
                              hitSlop={8}
                              onPress={() => openReceipt(expense.receiptUrl)}
                              style={[styles.receiptBadge, { backgroundColor: palette.muted }]}
                            >
                              <Ionicons
                                name={
                                  isPdfReceipt(expense.receiptUrl)
                                    ? 'document-text-outline'
                                    : 'image-outline'
                                }
                                size={14}
                                color={palette.primary}
                              />
                            </Pressable>
                          ) : null}
                          <View style={styles.expenseAmount}>
                            <AppText variant="bodyStrong">
                              {formatMoney(baseAmountOf(expense), base)}
                            </AppText>
                            {currency !== base ? (
                              <AppText variant="caption" tone="muted">
                                {formatMoney(expense.amount, currency)}
                              </AppText>
                            ) : null}
                          </View>
                          {canEdit ? (
                            <Ionicons
                              name="chevron-forward"
                              size={14}
                              color={palette.mutedForeground}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Pager page={safePage} pageCount={pageCount} onChange={setPage} />
              </Card>

              <Card style={styles.card}>
                <CardHead icon="people-outline" title="Travellers" count={participants.length} />
                <AppText variant="caption" tone="muted">
                  Splits use these names, not accounts — so anyone can be included.
                </AppText>

                {participants.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="people-outline" size={22} color={palette.mutedForeground} />
                    <AppText variant="bodyStrong">No travellers yet</AppText>
                    <AppText variant="caption" tone="muted">
                      Add everyone who shares costs so even splits know who’s in.
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {participants.map((participant) => (
                      <View key={participant._id} style={styles.balanceRow}>
                        <Avatar name={participant.name} size={28} />
                        <AppText variant="bodyStrong" numberOfLines={1} style={styles.balanceName}>
                          {participant.name}
                        </AppText>
                        {participant.isMe ? (
                          <View style={[styles.youChip, { backgroundColor: palette.primary }]}>
                            <AppText
                              variant="caption"
                              style={{ color: palette.primaryForeground }}
                            >
                              You
                            </AppText>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}

                {canEdit ? (
                  <Button
                    label={participants.length > 0 ? 'Edit travellers' : 'Add travellers'}
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setTravellersError(null);
                      setTravellersOpen(true);
                    }}
                  />
                ) : null}
              </Card>

              {!canEdit ? (
                <AppText variant="caption" tone="muted">
                  {readOnlyLine}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      </Screen>

      {sheetOpen && ledger ? (
        <ExpenseSheet
          baseCurrency={base}
          participants={participants}
          expense={editingExpense}
          busy={saveExpense.isPending}
          deleteBusy={removeExpense.isPending}
          error={sheetError}
          onClose={closeSheet}
          onSubmit={(input, receipt) => saveExpense.mutate({ input, receipt })}
          onViewReceipt={openReceipt}
          onDelete={
            editingExpense ? () => removeExpense.mutate(editingExpense._id) : undefined
          }
        />
      ) : null}

      {travellersOpen && ledger ? (
        <TravellersSheet
          participants={participants}
          suggested={suggested}
          busy={saveTravellers.isPending}
          error={travellersError}
          onClose={() => {
            setTravellersOpen(false);
            setTravellersError(null);
          }}
          onSave={(rows) => saveTravellers.mutate(rows)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  addAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  titleBlock: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2 },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  readOnlyText: { flexShrink: 1 },
  card: { gap: space.md },
  summaryCard: { gap: space.md },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  summaryText: { flex: 1, gap: 2 },
  summaryLabel: { letterSpacing: 0.8, fontSize: 11 },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    borderTopWidth: 1,
    paddingTop: space.md,
  },
  myStripItem: { gap: 2 },
  myStripRight: { alignItems: 'flex-end' },
  budgetBarBlock: { gap: 6, marginTop: space.xs },
  budgetTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  budgetFill: { height: '100%', borderRadius: radius.pill, backgroundColor: '#e87656' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  countPill: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  list: { gap: space.sm },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  balanceName: { flex: 1 },
  youChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  transferName: { flexShrink: 1 },
  transferAmount: { marginLeft: 'auto' },
  divider: { height: 1 },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  categoryDot: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseText: { flex: 1, gap: 1 },
  expenseAmount: { alignItems: 'flex-end', gap: 1 },
  receiptBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.sm,
  },
  skeletonCard: { gap: space.sm },
  errorCard: { alignItems: 'flex-start', gap: space.sm },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
