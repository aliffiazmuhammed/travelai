import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORIES, getCategoryMeta, plannedByCategory } from "@/lib/budget";
import { DEFAULT_BASE_CURRENCY, SUPPORTED_CURRENCIES, formatMoney } from "@/lib/currency";
import { settleUp } from "@/lib/settlement";
import { api } from "@/services/api";
import { toast } from "sonner";
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Pencil,
  UserPlus,
  Users,
  Receipt,
  Loader2,
  RefreshCw,
  ArrowRight,
  HandCoins,
} from "lucide-react";
import { ExpenseEditor } from "./ExpenseEditor";
import type {
  ExpenseInput,
  ItineraryData,
  Trip,
  TripExpense,
  TripParticipant,
} from "@/types/trip";

interface ExpenseTrackerProps {
  tripId?: string;
  expenses: TripExpense[];
  participants: TripParticipant[];
  baseCurrency: string;
  /** Base-per-unit rates cached on the trip (1 unit of X in the base currency). */
  exchangeRates?: Record<string, number>;
  ratesUpdatedAt?: string;
  plannedBudget: ItineraryData["budget_breakdown"];
  daysCount: number;
  /** Whether the current trip is persisted and editable. */
  canEdit: boolean;
  onUpdated?: (trip: Trip) => void;
}

const SHORT_LABEL: Record<string, string> = {
  accommodation: "Stay",
  food_and_drinks: "Food",
  activities_and_entry: "Activities",
  local_transport: "Transport",
  miscellaneous_buffer: "Buffer",
  other: "Other",
};

export const ExpenseTracker: React.FC<ExpenseTrackerProps> = ({
  tripId,
  expenses,
  participants,
  baseCurrency,
  exchangeRates,
  ratesUpdatedAt,
  plannedBudget,
  daysCount,
  canEdit,
  onUpdated,
}) => {
  const [items, setItems] = useState<TripExpense[]>(expenses || []);
  const [people, setPeople] = useState<TripParticipant[]>(participants || []);
  const [base, setBase] = useState(baseCurrency || DEFAULT_BASE_CURRENCY);
  const [rates, setRates] = useState<Record<string, number>>(exchangeRates || {});
  const [ratesAt, setRatesAt] = useState<string | undefined>(ratesUpdatedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newParticipant, setNewParticipant] = useState("");
  const [savingPeople, setSavingPeople] = useState(false);

  useEffect(() => setItems(expenses || []), [expenses]);
  useEffect(() => setPeople(participants || []), [participants]);
  useEffect(() => setBase(baseCurrency || DEFAULT_BASE_CURRENCY), [baseCurrency]);
  useEffect(() => setRates(exchangeRates || {}), [exchangeRates]);
  useEffect(() => setRatesAt(ratesUpdatedAt), [ratesUpdatedAt]);

  const applyTrip = (trip: Trip) => {
    setItems(trip.expenses || []);
    setPeople(trip.participants || []);
    if (trip.finance?.baseCurrency) setBase(trip.finance.baseCurrency);
    if (trip.finance?.exchangeRates) setRates(trip.finance.exchangeRates);
    if (trip.finance?.ratesUpdatedAt) setRatesAt(trip.finance.ratesUpdatedAt);
    onUpdated?.(trip);
  };

  const summary = useMemo(() => {
    const planned = plannedByCategory(plannedBudget);
    const byCategory = EXPENSE_CATEGORIES.map((category) => {
      const actual = (items || [])
        .filter((expense) => (expense.category || "other") === category.id)
        .reduce((sum, expense) => sum + (Number(expense.amountInBase) || 0), 0);
      return {
        ...category,
        planned: Number(planned[category.id]) || 0,
        actual,
      };
    });

    const totalActual = byCategory.reduce((sum, category) => sum + category.actual, 0);
    const totalPlanned = byCategory.reduce((sum, category) => sum + category.planned, 0);

    const chartData = byCategory.map((category) => ({
      name: SHORT_LABEL[category.id] || category.label,
      Planned: Math.round(category.planned),
      Actual: Math.round(category.actual),
    }));

    return { byCategory, totalActual, totalPlanned, chartData };
  }, [items, plannedBudget]);

  const remaining = summary.totalPlanned - summary.totalActual;
  const variancePct =
    summary.totalPlanned > 0
      ? Math.round(((summary.totalActual - summary.totalPlanned) / summary.totalPlanned) * 100)
      : null;

  const sortedItems = useMemo(
    () =>
      [...(items || [])].sort(
        (a, b) =>
          new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
      ),
    [items]
  );

  const settlement = useMemo(() => settleUp(items || [], people || []), [items, people]);

  const personName = (id?: string) =>
    id ? people.find((p) => p._id === id)?.name || "Traveller" : null;

  const handleSaveExpense = async (payload: ExpenseInput) => {
    if (!tripId) return;
    const trip =
      editingExpense != null
        ? await api.updateExpense(tripId, editingExpense._id, payload)
        : await api.addExpense(tripId, payload);
    applyTrip(trip);
    toast.success(editingExpense != null ? "Expense updated" : "Expense logged");
  };

  const handleDeleteExpense = async (expense: TripExpense) => {
    if (!tripId) return;
    try {
      setBusyId(expense._id);
      const trip = await api.deleteExpense(tripId, expense._id);
      applyTrip(trip);
      toast.success("Expense removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the expense.");
    } finally {
      setBusyId(null);
    }
  };

  const handleBaseCurrencyChange = async (code: string) => {
    if (!tripId || code === base) return;
    try {
      setRefreshing(true);
      const trip = await api.updateFinance(tripId, { baseCurrency: code });
      applyTrip(trip);
      toast.success(`Budget currency changed to ${code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the currency.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshRates = async () => {
    if (!tripId) return;
    try {
      setRefreshing(true);
      const trip = await api.updateFinance(tripId, { refresh: true });
      applyTrip(trip);
      toast.success("Exchange rates refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh rates.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!tripId || !newParticipant.trim()) return;
    try {
      setSavingPeople(true);
      const trip = await api.updateParticipants(tripId, [
        ...people.map((p) => ({ name: p.name, isMe: p.isMe })),
        { name: newParticipant.trim() },
      ]);
      applyTrip(trip);
      setNewParticipant("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the traveller.");
    } finally {
      setSavingPeople(false);
    }
  };

  const handleRemoveParticipant = async (id: string) => {
    if (!tripId) return;
    try {
      setSavingPeople(true);
      const trip = await api.updateParticipants(
        tripId,
        people.filter((p) => p._id !== id).map((p) => ({ name: p.name, isMe: p.isMe }))
      );
      applyTrip(trip);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the traveller.");
    } finally {
      setSavingPeople(false);
    }
  };

  const ratesCount = Object.keys(rates || {}).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-border/70 bg-card/60">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              <span>Planned</span>
            </div>
            <p className="text-lg font-black text-foreground">{formatMoney(summary.totalPlanned, base)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Receipt className="w-3.5 h-3.5 text-primary" />
              <span>Spent</span>
            </div>
            <p className="text-lg font-black text-foreground">{formatMoney(summary.totalActual, base)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <PiggyBank className="w-3.5 h-3.5 text-primary" />
              <span>Remaining</span>
            </div>
            <p
              className={`text-lg font-black ${
                remaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}
            >
              {formatMoney(remaining, base)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {variancePct != null && variancePct > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>Variance</span>
            </div>
            <p
              className={`text-lg font-black ${
                variancePct != null && variancePct > 0
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {variancePct == null ? "—" : `${variancePct > 0 ? "+" : ""}${variancePct}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Planned vs Actual Chart */}
      <Card className="rounded-3xl border-border/70 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-black flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Planned vs Actual
          </CardTitle>
          <CardDescription className="text-xs">
            Compare what you planned to spend against what you have logged so far.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} width={54} />
                <Tooltip
                  formatter={(value: number) => formatMoney(Number(value), base)}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Planned" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Actual" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Currency Settings */}
      {canEdit && (
        <Card className="rounded-3xl border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-primary" />
              Currency &amp; Rates
            </CardTitle>
            <CardDescription className="text-xs">
              Pick the currency you settle up in. Logged expenses are converted automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Base currency</span>
              <Select value={base} onValueChange={handleBaseCurrencyChange}>
                <SelectTrigger className="h-9 w-52 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.code} — {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-[11px] text-muted-foreground">
                {ratesCount > 0
                  ? `${ratesCount} rates cached${
                      ratesAt ? ` · ${new Date(ratesAt).toLocaleDateString()}` : ""
                    }`
                  : "No rates cached yet"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefreshRates}
                disabled={refreshing}
                className="rounded-xl text-xs h-9 font-bold gap-1.5"
              >
                {refreshing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Refresh rates</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Travellers */}
      {canEdit && (
        <Card className="rounded-3xl border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Travellers
            </CardTitle>
            <CardDescription className="text-xs">
              Add companions to track who paid and enable bill splitting.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {people.length === 0 && (
                <span className="text-xs text-muted-foreground">No travellers added yet.</span>
              )}
              {people.map((person) => (
                <Badge
                  key={person._id}
                  variant="outline"
                  className="text-xs px-2.5 py-1 rounded-full gap-1.5 border-border/70"
                >
                  {person.name}
                  {person.isMe && <span className="text-[10px] text-primary font-bold">you</span>}
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(person._id)}
                    disabled={savingPeople}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${person.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddParticipant();
                  }
                }}
                placeholder="Add a traveller's name..."
                className="h-9 text-sm rounded-xl max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddParticipant}
                disabled={savingPeople || !newParticipant.trim()}
                className="rounded-xl text-xs font-bold h-9 gap-1.5"
              >
                {savingPeople ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>Add</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settlement */}
      {canEdit && people.length > 0 && sortedItems.length > 0 && (
        <Card className="rounded-3xl border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-primary" />
              Settle Up
            </CardTitle>
            <CardDescription className="text-xs">
              Who paid, who owes, and the fewest transfers to balance the books.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {settlement.balances.map((balance) => (
                <div
                  key={balance.participantId}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-background/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {balance.name || personName(balance.participantId) || "Traveller"}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold">
                      paid {formatMoney(balance.paid, base)} · share{" "}
                      {formatMoney(balance.share, base)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-black shrink-0 ${
                      balance.net > 0.004
                        ? "text-emerald-600 dark:text-emerald-400"
                        : balance.net < -0.004
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {balance.net > 0.004
                      ? `gets ${formatMoney(balance.net, base)}`
                      : balance.net < -0.004
                      ? `owes ${formatMoney(-balance.net, base)}`
                      : "settled"}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground">Suggested transfers</p>
              {settlement.transfers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Everyone is settled up. 🎉</p>
              ) : (
                settlement.transfers.map((transfer, index) => (
                  <div
                    key={`${transfer.from}-${transfer.to}-${index}`}
                    className="flex items-center gap-2 text-xs font-semibold p-2.5 rounded-xl bg-primary/5 border border-primary/15"
                  >
                    <span className="text-foreground truncate">
                      {personName(transfer.from) || "Traveller"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-foreground truncate">
                      {personName(transfer.to) || "Traveller"}
                    </span>
                    <span className="ml-auto font-black text-primary shrink-0">
                      {formatMoney(transfer.amount, base)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense Ledger */}
      <Card className="rounded-3xl border-border/70 bg-card/60">
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              Expense Ledger
            </CardTitle>
            <CardDescription className="text-xs">
              {items.length} expense{items.length === 1 ? "" : "s"} logged
            </CardDescription>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="hero"
              onClick={() => {
                setEditingExpense(null);
                setEditorOpen(true);
              }}
              className="rounded-xl text-xs font-bold h-9 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Expense</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-2 space-y-2">
          {sortedItems.length === 0 ? (
            <div className="text-center py-10 space-y-1">
              <Receipt className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No expenses yet</p>
              <p className="text-xs text-muted-foreground">
                {canEdit
                  ? "Log your first expense to start tracking your actual spend."
                  : "Expenses logged during the trip will appear here."}
              </p>
            </div>
          ) : (
            sortedItems.map((expense) => {
              const meta = getCategoryMeta(expense.category);
              const payer = personName(expense.paidBy);
              const isForeign = (expense.currency || base).toUpperCase() !== base;
              return (
                <div
                  key={expense._id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-background/60"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold text-foreground truncate">{expense.label}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-2 py-0 border-border/60">
                          {meta.label}
                        </Badge>
                        {expense.day != null && (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0">
                            Day {expense.day}
                          </Badge>
                        )}
                        {payer && (
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            Paid by {payer}
                          </span>
                        )}
                        {expense.splitMode === "equal" && (
                          <span className="text-[10px] text-primary font-semibold">Split equally</span>
                        )}
                        {expense.splitMode === "custom" && (
                          <span className="text-[10px] text-primary font-semibold">
                            Custom split
                          </span>
                        )}
                        {isForeign && (
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {formatMoney(expense.amount, expense.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-black text-foreground">
                      {formatMoney(expense.amountInBase, base)}
                    </span>
                    {canEdit && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Edit expense"
                          className="h-7 w-7 text-muted-foreground hover:text-primary rounded-lg"
                          onClick={() => {
                            setEditingExpense(expense);
                            setEditorOpen(true);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Delete expense"
                          disabled={busyId === expense._id}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                          onClick={() => handleDeleteExpense(expense)}
                        >
                          {busyId === expense._id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <ExpenseEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          expense={editingExpense}
          participants={people}
          baseCurrency={base}
          exchangeRates={rates}
          days={daysCount}
          onSave={handleSaveExpense}
        />
      )}
    </div>
  );
};

export default ExpenseTracker;
