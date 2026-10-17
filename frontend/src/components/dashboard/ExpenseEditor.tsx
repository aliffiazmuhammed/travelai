import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, Coins, Tag, CalendarDays, User, Users, Save } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/budget";
import {
  DEFAULT_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  convertToBase,
  currencyMeta,
  formatMoney,
} from "@/lib/currency";
import type {
  ExpenseCategory,
  ExpenseInput,
  ExpenseSplitMode,
  TripExpense,
  TripParticipant,
} from "@/types/trip";

interface ExpenseEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing expense when editing, or null when creating a new one. */
  expense?: TripExpense | null;
  participants: TripParticipant[];
  baseCurrency: string;
  /** Base-per-unit rates cached on the trip (1 unit of X in the base currency). */
  exchangeRates?: Record<string, number>;
  /** Total number of days in the trip (for the day selector). */
  days: number;
  onSave: (payload: ExpenseInput) => Promise<void> | void;
}

const UNASSIGNED = "__unassigned__";

interface FormState {
  label: string;
  amount: string;
  category: ExpenseCategory;
  currency: string;
  exchangeRate: string;
  date: string;
  day: string;
  paidBy: string;
  splitMode: ExpenseSplitMode;
  notes: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function emptyForm(baseCurrency: string): FormState {
  return {
    label: "",
    amount: "",
    category: "food_and_drinks",
    currency: baseCurrency,
    exchangeRate: "1",
    date: todayISO(),
    day: UNASSIGNED,
    paidBy: UNASSIGNED,
    splitMode: "none",
    notes: "",
  };
}

export const ExpenseEditor: React.FC<ExpenseEditorProps> = ({
  open,
  onOpenChange,
  expense,
  participants,
  baseCurrency,
  exchangeRates,
  days,
  onSave,
}) => {
  const base = (baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const [form, setForm] = useState<FormState>(emptyForm(base));
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!expense) {
      setForm(emptyForm(base));
      setCustomShares({});
    } else {
      setForm({
        label: expense.label || "",
        amount: expense.amount != null ? String(expense.amount) : "",
        category: (expense.category as ExpenseCategory) || "other",
        currency: (expense.currency || base).toUpperCase(),
        exchangeRate: expense.exchangeRate != null ? String(expense.exchangeRate) : "1",
        date: expense.date ? expense.date.slice(0, 10) : todayISO(),
        day: expense.day != null ? String(expense.day) : UNASSIGNED,
        paidBy: expense.paidBy || UNASSIGNED,
        splitMode: expense.splitMode || "none",
        notes: expense.notes || "",
      });
      setCustomShares(
        Object.fromEntries(
          (expense.shares || []).map((share) => [share.participantId, String(share.amount)])
        )
      );
    }
    setError(null);
    setSaving(false);
  }, [open, expense, base]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCurrencyChange = (code: string) => {
    const next = code.toUpperCase();
    const cached = Number(exchangeRates?.[next]);
    setForm((prev) => ({
      ...prev,
      currency: next,
      exchangeRate:
        next === base ? "1" : Number.isFinite(cached) && cached > 0 ? String(cached) : "",
    }));
  };

  const amountNumber = Number(form.amount);
  const rateNumber = Number(form.exchangeRate);
  const previewBase = useMemo(
    () => convertToBase(amountNumber, form.currency, base, { [form.currency]: rateNumber }),
    [amountNumber, form.currency, base, rateNumber]
  );

  const customTotal = useMemo(
    () =>
      round2(
        participants.reduce((sum, participant) => sum + (Number(customShares[participant._id]) || 0), 0)
      ),
    [participants, customShares]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.label.trim()) {
      setError("Please add a short description for this expense.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Please enter an amount greater than zero.");
      return;
    }

    const isForeign = form.currency !== base;
    if (isForeign && (!Number.isFinite(rateNumber) || rateNumber <= 0)) {
      setError(`Enter how much 1 ${form.currency} is worth in ${base}.`);
      return;
    }
    if (previewBase == null) {
      setError("This currency cannot be converted. Please enter a manual rate.");
      return;
    }

    if (form.splitMode === "custom") {
      if (participants.length === 0) {
        setError("Add travellers before setting a custom split.");
        return;
      }
      if (Math.abs(customTotal - previewBase) > 0.01) {
        setError(
          `Custom shares must add up to ${formatMoney(previewBase, base)} (currently ${formatMoney(
            customTotal,
            base
          )}).`
        );
        return;
      }
    }

    const payload: ExpenseInput = {
      label: form.label.trim(),
      amount,
      category: form.category,
      currency: form.currency,
      exchangeRate: isForeign ? rateNumber : 1,
      date: form.date ? new Date(form.date).toISOString() : undefined,
      day: form.day !== UNASSIGNED ? Number(form.day) : undefined,
      paidBy: form.paidBy !== UNASSIGNED ? form.paidBy : undefined,
      splitMode: form.splitMode,
      notes: form.notes.trim() || undefined,
    };

    if (form.splitMode === "custom") {
      payload.shares = participants
        .map((participant) => ({
          participantId: participant._id,
          amount: round2(Number(customShares[participant._id]) || 0),
        }))
        .filter((share) => share.amount > 0);
    }

    try {
      setSaving(true);
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this expense.");
    } finally {
      setSaving(false);
    }
  };

  const dayOptions = Array.from({ length: Math.max(days, 0) }, (_, i) => i + 1);
  const isForeign = form.currency !== base;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[94vw] sm:w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            {expense ? "Edit Expense" : "Log an Expense"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Track what you actually spent. Totals are reported in {base}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="expense-label" className="text-xs font-bold">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="expense-label"
              value={form.label}
              onChange={(e) => update("label", e.target.value)}
              placeholder="e.g. Houseboat lunch at Alleppey"
              className="h-10 text-sm rounded-xl"
              autoFocus
            />
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="expense-amount" className="text-xs font-bold flex items-center gap-1">
                <Coins className="w-3 h-3 text-primary" /> Amount
              </Label>
              <Input
                id="expense-amount"
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="1200"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Currency</Label>
              <Select value={form.currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.code} · {option.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Exchange rate + converted preview */}
          {isForeign ? (
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="expense-rate" className="text-xs font-bold">
                  1 {form.currency} =
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="expense-rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.exchangeRate}
                    onChange={(e) => update("exchangeRate", e.target.value)}
                    className="h-9 w-28 text-sm rounded-xl"
                  />
                  <span className="text-xs font-bold text-muted-foreground">{base}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {previewBase == null
                  ? "Enter a rate to convert this expense."
                  : `≈ ${formatMoney(previewBase, base)} will be recorded.`}
              </p>
            </div>
          ) : (
            previewBase != null && (
              <p className="text-[11px] text-muted-foreground">
                Recorded as {formatMoney(previewBase, base)}.
              </p>
            )
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1">
                <Tag className="w-3 h-3 text-primary" /> Category
              </Label>
              <Select
                value={form.category}
                onValueChange={(value) => update("category", value as ExpenseCategory)}
              >
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-date" className="text-xs font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-primary" /> Date
              </Label>
              <Input
                id="expense-date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className="h-10 text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Trip Day</Label>
            <Select value={form.day} onValueChange={(value) => update("day", value)}>
              <SelectTrigger className="h-10 text-sm rounded-xl">
                <SelectValue placeholder="Not linked to a day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Not linked to a day</SelectItem>
                {dayOptions.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    Day {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {participants.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-border/70 p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1">
                    <User className="w-3 h-3 text-primary" /> Paid By
                  </Label>
                  <Select value={form.paidBy} onValueChange={(value) => update("paidBy", value)}>
                    <SelectTrigger className="h-10 text-sm rounded-xl">
                      <SelectValue placeholder="Who paid?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Not specified</SelectItem>
                      {participants.map((participant) => (
                        <SelectItem key={participant._id} value={participant._id}>
                          {participant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1">
                    <Users className="w-3 h-3 text-primary" /> Split
                  </Label>
                  <Select
                    value={form.splitMode}
                    onValueChange={(value) => update("splitMode", value as ExpenseSplitMode)}
                  >
                    <SelectTrigger className="h-10 text-sm rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not split</SelectItem>
                      <SelectItem value="equal">Split equally</SelectItem>
                      <SelectItem value="custom">Custom amounts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.splitMode === "custom" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Enter each person's share in {base}. Leave someone at 0 to exclude them.
                  </p>
                  {participants.map((participant) => (
                    <div key={participant._id} className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {participant.name}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={customShares[participant._id] || ""}
                        onChange={(e) =>
                          setCustomShares((prev) => ({
                            ...prev,
                            [participant._id]: e.target.value,
                          }))
                        }
                        placeholder="0"
                        className="h-9 w-28 text-sm rounded-xl"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 text-[11px] font-bold">
                    <span className="text-muted-foreground">Total allocated</span>
                    <span
                      className={
                        previewBase != null && Math.abs(customTotal - previewBase) <= 0.01
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      }
                    >
                      {formatMoney(customTotal, base)}
                      {previewBase != null ? ` / ${formatMoney(previewBase, base)}` : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="expense-notes" className="text-xs font-bold">
              Notes (optional)
            </Label>
            <Textarea
              id="expense-notes"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything worth remembering about this spend..."
              className="text-sm rounded-xl min-h-[70px]"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs font-semibold h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="hero"
              disabled={saving}
              className="rounded-xl text-xs font-bold h-10 gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : expense ? "Save Expense" : "Add Expense"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseEditor;
