import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Eye,
  History,
  Loader2,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAgency } from '@/context/AgencyContext';
import { useAuth } from '@/context/UserContext';
import { formatAgencyDate } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyClient,
  AgencyQuote,
  AgencyQuoteInput,
  AgencyTerms,
  QuoteClient,
  QuoteLineDraft,
  QuoteStatus,
} from '@/types';
import { toast } from 'sonner';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
const MAX_QUANTITY = 10_000;
const MAX_UNIT_PRICE = 100_000_000;
const MAX_DISCOUNT = 100_000_000;
const MAX_MARKUP_PCT = 1000;
const MAX_TERMS_ITEMS = 30;
const MAX_TERMS_LENGTH = 300;

const statusLabel: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const statusClass: Record<QuoteStatus, string> = {
  draft:
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  sent: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  accepted:
    'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  expired:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  cancelled:
    'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

type LineEditor = {
  key: string;
  label: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type QuoteFormState = {
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  adults: string;
  children: string;
  rooms: string;
  currency: string;
  lineItems: LineEditor[];
  markupPct: string;
  taxPct: string;
  discount: string;
  validUntil: string;
  inclusions: string;
  exclusions: string;
  terms: string;
  preparedBy: string;
};

let lineKeySeed = 0;
const nextLineKey = () => `line-${++lineKeySeed}`;

const numberOr = (value: string, fallback = 0): number => {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const toMinor = (amount: number): number => Math.round(amount * 100);
const fromMinor = (minor: number): number => Math.round(minor) / 100;

function formatMoney(amount: number | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function dateInputValue(daysFromNow = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The API stores date-only validity at end-of-day UTC; recover the chosen day. */
function quoteDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateInputValue(14);
  return date.toISOString().slice(0, 10);
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function blankLine(): LineEditor {
  return {
    key: nextLineKey(),
    label: '',
    description: '',
    quantity: '1',
    unitPrice: '',
  };
}

function emptyEditor(defaults?: AgencyTerms | null, preparedBy?: string): QuoteFormState {
  return {
    clientId: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    adults: '2',
    children: '0',
    rooms: '',
    currency: 'INR',
    lineItems: [blankLine()],
    markupPct: '0',
    taxPct: '0',
    discount: '0',
    validUntil: dateInputValue(14),
    inclusions: (defaults?.inclusions ?? []).join('\n'),
    exclusions: (defaults?.exclusions ?? []).join('\n'),
    terms: (defaults?.terms ?? []).join('\n'),
    preparedBy: preparedBy ?? '',
  };
}

function editorFromQuote(quote: AgencyQuote): QuoteFormState {
  return {
    clientId: quote.clientId ?? '',
    clientName: quote.client.name,
    clientEmail: quote.client.email ?? '',
    clientPhone: quote.client.phone ?? '',
    adults: String(quote.client.adults),
    children: String(quote.client.children),
    rooms:
      quote.client.rooms === undefined ? '' : String(quote.client.rooms),
    currency: quote.currency,
    lineItems: quote.lineItems.map((item) => ({
      key: nextLineKey(),
      label: item.label,
      description: item.description ?? '',
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
    markupPct: String(quote.markupPct ?? 0),
    taxPct: String(quote.taxPct ?? 0),
    discount: String(quote.discount ?? 0),
    validUntil: quoteDateInput(quote.validUntil),
    inclusions: (quote.inclusions ?? []).join('\n'),
    exclusions: (quote.exclusions ?? []).join('\n'),
    terms: (quote.terms ?? []).join('\n'),
    preparedBy: quote.preparedBy ?? '',
  };
}

interface QuotePreviewData {
  number: string;
  version?: number;
  currency: string;
  client: QuoteClient;
  lineItems: Array<QuoteLineDraft & { total: number }>;
  subtotal: number;
  markupPct: number;
  markupAmount: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  validUntil: string;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  preparedBy?: string;
}

/** Mirrors the server's minor-unit maths so the live preview never rounds differently. */
function editorPreview(form: QuoteFormState, quoteNumber: string): QuotePreviewData | null {
  const adults = numberOr(form.adults);
  const children = numberOr(form.children, 0);
  if (!Number.isFinite(adults) || !Number.isFinite(children)) return null;

  const lines: Array<QuoteLineDraft & { total: number }> = [];
  let subtotalMinor = 0;
  for (const line of form.lineItems) {
    const quantity = numberOr(line.quantity);
    const unitPrice = numberOr(line.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
    const total = fromMinor(Math.round(quantity * unitPrice * 100));
    subtotalMinor += toMinor(total);
    lines.push({
      label: line.label,
      ...(line.description.trim() ? { description: line.description.trim() } : {}),
      quantity,
      unitPrice,
      total,
    });
  }

  const markupPct = numberOr(form.markupPct);
  const taxPct = numberOr(form.taxPct);
  const discount = numberOr(form.discount);
  if (
    !Number.isFinite(markupPct) ||
    !Number.isFinite(taxPct) ||
    !Number.isFinite(discount)
  ) {
    return null;
  }

  const markupMinor = Math.round((subtotalMinor * markupPct) / 100);
  const discountMinor = toMinor(discount);
  const taxableMinor = subtotalMinor + markupMinor - discountMinor;
  const taxMinor = Math.round((taxableMinor * taxPct) / 100);
  const totalMinor = taxableMinor + taxMinor;
  const travelers = Math.max(1, Math.round(adults + children));

  return {
    number: quoteNumber,
    currency: form.currency,
    client: {
      name: form.clientName.trim(),
      ...(form.clientEmail.trim() ? { email: form.clientEmail.trim().toLowerCase() } : {}),
      ...(form.clientPhone.trim() ? { phone: form.clientPhone.trim() } : {}),
      adults: Number.isFinite(adults) ? adults : 1,
      children: Number.isFinite(children) ? children : 0,
      ...(form.rooms.trim() && Number.isFinite(numberOr(form.rooms))
        ? { rooms: numberOr(form.rooms) }
        : {}),
    },
    lineItems: lines,
    subtotal: fromMinor(subtotalMinor),
    markupPct,
    markupAmount: fromMinor(markupMinor),
    taxPct,
    taxAmount: fromMinor(taxMinor),
    discount: fromMinor(discountMinor),
    total: fromMinor(totalMinor),
    perPerson: fromMinor(Math.round(totalMinor / travelers)),
    validUntil: form.validUntil,
    inclusions: toLines(form.inclusions),
    exclusions: toLines(form.exclusions),
    terms: toLines(form.terms),
    ...(form.preparedBy.trim() ? { preparedBy: form.preparedBy.trim() } : {}),
  };
}

function quotePreviewData(quote: AgencyQuote): QuotePreviewData {
  return {
    number: quote.number,
    version: quote.version,
    currency: quote.currency,
    client: quote.client,
    lineItems: quote.lineItems,
    subtotal: quote.subtotal,
    markupPct: quote.markupPct ?? 0,
    markupAmount: quote.markupAmount ?? 0,
    taxPct: quote.taxPct,
    taxAmount: quote.taxAmount,
    discount: quote.discount,
    total: quote.total,
    perPerson: quote.perPerson,
    validUntil: quote.validUntil,
    inclusions: quote.inclusions ?? [],
    exclusions: quote.exclusions ?? [],
    terms: quote.terms ?? [],
    ...(quote.preparedBy ? { preparedBy: quote.preparedBy } : {}),
  };
}

function validateEditor(form: QuoteFormState): string | null {
  if (!form.clientName.trim()) return "Enter the client's name.";
  if (form.clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim())) {
    return 'Enter a valid client email address.';
  }
  const adults = numberOr(form.adults);
  const children = numberOr(form.children, 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) {
    return 'Adult travellers must be a whole number between 1 and 30.';
  }
  if (!Number.isInteger(children) || children < 0 || children > 30) {
    return 'Child travellers must be a whole number between 0 and 30.';
  }
  if (form.rooms.trim()) {
    const rooms = numberOr(form.rooms);
    if (!Number.isInteger(rooms) || rooms < 0 || rooms > 30) {
      return 'Rooms must be a whole number between 0 and 30.';
    }
  }
  if (form.lineItems.length === 0) return 'Add at least one line item.';
  for (let index = 0; index < form.lineItems.length; index += 1) {
    const line = form.lineItems[index];
    if (!line.label.trim()) return `Line ${index + 1} needs a label.`;
    const quantity = numberOr(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > MAX_QUANTITY) {
      return `Quantity on line ${index + 1} must be between 0.01 and ${MAX_QUANTITY}.`;
    }
    const unitPrice = numberOr(line.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_UNIT_PRICE) {
      return `Unit price on line ${index + 1} must be between 0 and ${MAX_UNIT_PRICE}.`;
    }
  }
  const markupPct = numberOr(form.markupPct);
  if (!Number.isFinite(markupPct) || markupPct < 0 || markupPct > MAX_MARKUP_PCT) {
    return `Markup must be between 0 and ${MAX_MARKUP_PCT}%.`;
  }
  const taxPct = numberOr(form.taxPct);
  if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
    return 'Tax must be between 0 and 100%.';
  }
  const discount = numberOr(form.discount);
  if (!Number.isFinite(discount) || discount < 0 || discount > MAX_DISCOUNT) {
    return 'Enter a valid discount amount.';
  }
  if (!form.validUntil) return 'Choose how long this quote stays valid.';
  for (const [label, value] of [
    ['inclusions', form.inclusions],
    ['exclusions', form.exclusions],
    ['terms', form.terms],
  ] as const) {
    const lines = toLines(value);
    if (lines.length > MAX_TERMS_ITEMS) {
      return `Add at most ${MAX_TERMS_ITEMS} ${label} lines.`;
    }
    if (lines.some((line) => line.length > MAX_TERMS_LENGTH)) {
      return `Keep each ${label} line under ${MAX_TERMS_LENGTH} characters.`;
    }
  }
  return null;
}

interface AgencyQuotePanelProps {
  agencyId: string;
  tripId: string;
  tripTitle: string;
  tripStartDate?: string;
  tripEndDate?: string;
}

/**
 * Quote tab for an agency trip (A4).
 *
 * Drafts are edited in place; once sent, saving creates a new version with the
 * same quote number. Totals shown here are a local mirror of the server maths —
 * the saved response remains authoritative and replaces the form afterwards.
 */
const AgencyQuotePanel: React.FC<AgencyQuotePanelProps> = ({
  agencyId,
  tripId,
  tripTitle,
  tripStartDate,
  tripEndDate,
}) => {
  const { activeAgency, canManage } = useAgency();
  const { user } = useAuth();
  const role = activeAgency?.role;
  const canPlan = canManage || role === 'planner';
  const canSeeMargin = canPlan;
  const defaultTerms = activeAgency?.defaultTerms;
  const fallbackPreparedBy =
    user?.name?.trim() || user?.label || user?.email?.split('@')[0] || '';

  const [quote, setQuote] = useState<AgencyQuote | null>(null);
  const [versions, setVersions] = useState<AgencyQuote[]>([]);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<QuoteFormState>(() =>
    emptyEditor(defaultTerms, fallbackPreparedBy)
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<'send' | 'accept' | 'cancel' | null>(null);
  const [previewMode, setPreviewMode] = useState<'internal' | 'client'>(
    canPlan ? 'internal' : 'client'
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadQuote = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [quoteResult, versionsResult] = await Promise.all([
        api.getAgencyQuote(agencyId, tripId),
        api.getAgencyQuoteVersions(agencyId, tripId),
      ]);
      if (requestId !== requestRef.current) return;
      const latest = quoteResult.quote;
      setQuote(latest);
      setVersions(versionsResult.versions || []);
      setSelectedVersionId(null);
      if (latest) {
        setEditor(editorFromQuote(latest));
        setEditing(canPlan && latest.status === 'draft');
      } else {
        setEditor(emptyEditor(defaultTerms, fallbackPreparedBy));
        setEditing(canPlan);
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setLoadError(
        err instanceof Error ? err.message : 'Could not load this trip quote.'
      );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [agencyId, tripId, canPlan, defaultTerms, fallbackPreparedBy]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getAgencyClients(agencyId)
      .then((result) => {
        if (!cancelled) setClients(result.clients || []);
      })
      .catch(() => {
        /* inline client fields keep working without the directory */
      });
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  const applySavedQuote = (saved: AgencyQuote) => {
    setQuote(saved);
    setVersions((prev) =>
      [saved, ...prev.filter((entry) => entry._id !== saved._id)].sort(
        (a, b) => b.version - a.version
      )
    );
    setSelectedVersionId(null);
    setEditor(editorFromQuote(saved));
    setEditing(saved.status === 'draft' && canPlan);
  };

  const buildPayload = (): AgencyQuoteInput | null => {
    const problem = validateEditor(editor);
    if (problem) {
      toast.error(problem);
      return null;
    }
    return {
      ...(editor.clientId ? { clientId: editor.clientId } : {}),
      client: {
        name: editor.clientName.trim(),
        ...(editor.clientEmail.trim()
          ? { email: editor.clientEmail.trim() }
          : {}),
        ...(editor.clientPhone.trim()
          ? { phone: editor.clientPhone.trim() }
          : {}),
        adults: numberOr(editor.adults),
        children: numberOr(editor.children, 0),
        ...(editor.rooms.trim() ? { rooms: numberOr(editor.rooms) } : {}),
      },
      currency: editor.currency,
      lineItems: editor.lineItems.map((line) => ({
        label: line.label.trim(),
        ...(line.description.trim()
          ? { description: line.description.trim() }
          : {}),
        quantity: numberOr(line.quantity),
        unitPrice: numberOr(line.unitPrice),
      })),
      markupPct: numberOr(editor.markupPct),
      taxPct: numberOr(editor.taxPct),
      discount: numberOr(editor.discount),
      validUntil: editor.validUntil,
      inclusions: toLines(editor.inclusions),
      exclusions: toLines(editor.exclusions),
      terms: toLines(editor.terms),
      ...(editor.preparedBy.trim()
        ? { preparedBy: editor.preparedBy.trim() }
        : {}),
    };
  };

  /** Returns the saved quote, or null when local validation already reported why. */
  const persist = async (): Promise<AgencyQuote | null> => {
    const payload = buildPayload();
    if (!payload) return null;
    const result = await api.saveAgencyQuote(agencyId, tripId, payload);
    applySavedQuote(result.quote);
    return result.quote;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await persist();
      if (saved) toast.success('Quote draft saved.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save this quote.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setAction('send');
    try {
      if (editing) {
        const saved = await persist();
        if (!saved) return;
      }
      const result = await api.sendAgencyQuote(agencyId, tripId);
      applySavedQuote(result.quote);
      toast.success('Quote marked as sent. It is now locked as a version.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not send this quote.'
      );
    } finally {
      setAction(null);
    }
  };

  const handleAccept = async () => {
    setAction('accept');
    try {
      const result = await api.acceptAgencyQuote(agencyId, tripId);
      applySavedQuote(result.quote);
      toast.success('Quote marked as accepted.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not accept this quote.'
      );
    } finally {
      setAction(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this quote version? This cannot be undone.')) {
      return;
    }
    setAction('cancel');
    try {
      const result = await api.cancelAgencyQuote(agencyId, tripId);
      applySavedQuote(result.quote);
      toast.success('Quote cancelled.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not cancel this quote.'
      );
    } finally {
      setAction(null);
    }
  };

  const startEditing = () => {
    if (!quote) {
      setEditor(emptyEditor(defaultTerms, fallbackPreparedBy));
    } else {
      setEditor(editorFromQuote(quote));
    }
    setSelectedVersionId(null);
    setEditing(true);
  };

  const discardEdits = () => {
    if (!quote) return;
    setEditor(editorFromQuote(quote));
    setEditing(false);
  };

  const resetToAgencyDefaults = () => {
    setEditor((prev) => ({
      ...prev,
      inclusions: (defaultTerms?.inclusions ?? []).join('\n'),
      exclusions: (defaultTerms?.exclusions ?? []).join('\n'),
      terms: (defaultTerms?.terms ?? []).join('\n'),
    }));
    toast.success('Quote terms reset to the agency defaults.');
  };

  const selectClient = (value: string) => {
    if (value === 'none') {
      setEditor((prev) => ({ ...prev, clientId: '' }));
      return;
    }
    const client = clients.find((entry) => entry._id === value);
    setEditor((prev) => ({
      ...prev,
      clientId: value,
      clientName: client?.name ?? prev.clientName,
      clientEmail: client?.email ?? '',
      clientPhone: client?.phone ?? '',
    }));
  };

  const updateLine = (key: string, patch: Partial<LineEditor>) => {
    setEditor((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((line) =>
        line.key === key ? { ...line, ...patch } : line
      ),
    }));
  };

  const addLine = () => {
    setEditor((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, blankLine()],
    }));
  };

  const removeLine = (key: string) => {
    setEditor((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((line) => line.key !== key),
    }));
  };

  const selectedVersion = useMemo(
    () => versions.find((entry) => entry._id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );
  const displayedQuote = selectedVersion ?? quote;

  const preview = useMemo(() => {
    if (editing) {
      return editorPreview(editor, quote?.number ?? 'New quote');
    }
    if (displayedQuote) return quotePreviewData(displayedQuote);
    return null;
  }, [displayedQuote, editor, editing, quote?.number]);

  const lineTotals = useMemo(() => {
    if (editing) {
      return editor.lineItems.map((line) => {
        const quantity = numberOr(line.quantity);
        const unitPrice = numberOr(line.unitPrice);
        if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
        return fromMinor(Math.round(quantity * unitPrice * 100));
      });
    }
    return (displayedQuote?.lineItems ?? []).map((line) => line.total);
  }, [displayedQuote?.lineItems, editor.lineItems, editing]);

  const currency = editing
    ? editor.currency
    : displayedQuote?.currency ?? 'INR';
  const draftVersion = quote ? quote.version + (quote.status === 'draft' ? 0 : 1) : 1;
  const viewingOldVersion =
    !editing && selectedVersion && quote && selectedVersion._id !== quote._id;
  const busy = saving || action !== null;

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the trip quote...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="rounded-3xl border-rose-200 dark:border-rose-900/60">
        <CardContent className="space-y-3 py-14 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-rose-500" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadQuote()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border-border/70">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-600 text-white">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  Quote & pricing
                </h2>
                {quote ? (
                  <>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {quote.number}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      v{quote.version}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', statusClass[quote.status])}
                    >
                      {statusLabel[quote.status]}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    Not created yet
                  </Badge>
                )}
              </div>
              <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                Prices are computed by the server in {currency}. Sending locks
                this version; later changes create a new version with the same
                quote number.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadQuote()}
              disabled={busy}
              title="Reload the latest quote"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {!canPlan ? (
              <Badge variant="outline" className="gap-1 text-[10px] text-slate-500">
                <Lock className="h-3 w-3" />
                Read-only
              </Badge>
            ) : editing ? (
              <>
                {quote ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={discardEdits}
                    disabled={busy}
                  >
                    Discard changes
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleSend()}
                  disabled={busy || editor.lineItems.length === 0}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {action === 'send' ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save &amp; send
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={busy}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save draft
                </Button>
              </>
            ) : quote?.status === 'draft' ? (
              <>
                <Button
                  size="sm"
                  onClick={() => void handleSend()}
                  disabled={busy}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {action === 'send' ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Send quote
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                  disabled={busy}
                >
                  Continue editing
                </Button>
              </>
            ) : quote ? (
              <>
                {quote.status === 'sent' && !viewingOldVersion ? (
                  <Button
                    size="sm"
                    onClick={() => void handleAccept()}
                    disabled={busy}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {action === 'accept' ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Mark accepted
                  </Button>
                ) : null}
                {quote.status === 'sent' && !viewingOldVersion ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCancel()}
                    disabled={busy}
                  >
                    {action === 'cancel' ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Cancel quote
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                  disabled={busy}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {quote.status === 'expired'
                    ? 'Renew quote'
                    : quote.status === 'cancelled'
                      ? 'Revise quote'
                      : 'New version'}
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!editing && !quote ? (
        <Card className="rounded-3xl border-dashed">
          <CardContent className="space-y-3 py-16 text-center">
            <Receipt className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
            <h3 className="text-sm font-semibold">No quote for this trip yet</h3>
            <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
              {canPlan
                ? 'Create a priced quote with client details, line items, taxes and validity.'
                : 'A planner has not created a quote for this trip yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <div className="space-y-4">
            {editing ? (
              <QuoteEditor
                form={editor}
                setForm={setEditor}
                clients={clients}
                canSeeMargin={canSeeMargin}
                lineTotals={lineTotals}
                onSelectClient={selectClient}
                onUpdateLine={updateLine}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                onResetTerms={resetToAgencyDefaults}
                mode={
                  !quote ? 'new' : quote.status === 'draft' ? 'draft' : 'version'
                }
                currentVersion={quote?.version}
                nextVersion={draftVersion}
              />
            ) : (
              <QuoteDetails
                quote={displayedQuote as AgencyQuote}
                canSeeMargin={canSeeMargin}
                isOldVersion={Boolean(viewingOldVersion)}
                latestVersion={quote?.version}
              />
            )}
          </div>

          <div className="space-y-4">
            <QuotePreviewCard
              data={preview}
              mode={previewMode}
              onModeChange={setPreviewMode}
              canSeeMargin={canSeeMargin}
              agencyName={activeAgency?.name ?? 'Your agency'}
              tripTitle={tripTitle}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              isDraft={editing || displayedQuote?.status === 'draft'}
              isEditingPreview={editing}
            />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="h-4 w-4" />
                  Version history
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {versions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-500 dark:border-slate-800">
                    Versions appear here after the first save.
                  </p>
                ) : (
                  versions.map((version) => {
                    const isLatest = version._id === quote?._id;
                    const isSelected = editing
                      ? isLatest
                      : (selectedVersionId ?? quote?._id) === version._id;
                    return (
                      <button
                        key={version._id}
                        type="button"
                        onClick={() => {
                          if (editing) {
                            toast.info('Save or discard this draft before viewing another version.');
                            return;
                          }
                          setSelectedVersionId(version._id);
                        }}
                        className={cn(
                          'w-full rounded-xl border px-3 py-2 text-left transition',
                          isSelected
                            ? 'border-teal-300 bg-teal-50/70 dark:border-teal-800 dark:bg-teal-950/30'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-semibold">
                            v{version.version}
                            {isLatest ? (
                              <Badge variant="outline" className="text-[9px]">
                                Latest
                              </Badge>
                            ) : null}
                            <Badge
                              variant="outline"
                              className={cn('text-[9px]', statusClass[version.status])}
                            >
                              {statusLabel[version.status]}
                            </Badge>
                          </span>
                          <span className="text-xs font-semibold">
                            {formatMoney(version.total, version.currency)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{formatAgencyDate(version.createdAt)}</span>
                          {version.sentAt ? (
                            <span>Sent {formatAgencyDate(version.sentAt)}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
                {editing ? (
                  <p className="text-[11px] text-slate-500">
                    The unsaved draft is not in history until you save.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Editor                                                                    */
/* -------------------------------------------------------------------------- */

interface QuoteEditorProps {
  form: QuoteFormState;
  setForm: React.Dispatch<React.SetStateAction<QuoteFormState>>;
  clients: AgencyClient[];
  canSeeMargin: boolean;
  lineTotals: Array<number | null>;
  onSelectClient: (value: string) => void;
  onUpdateLine: (key: string, patch: Partial<LineEditor>) => void;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onResetTerms: () => void;
  mode: 'new' | 'draft' | 'version';
  currentVersion?: number;
  nextVersion: number;
}

const QuoteEditor: React.FC<QuoteEditorProps> = ({
  form,
  setForm,
  clients,
  canSeeMargin,
  lineTotals,
  onSelectClient,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onResetTerms,
  mode,
  currentVersion,
  nextVersion,
}) => {
  const update = (patch: Partial<QuoteFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const lineTotalFor = (index: number) => {
    const total = lineTotals[index];
    return total == null ? '—' : formatMoney(total, form.currency);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {mode === 'new'
              ? 'New quote'
              : mode === 'draft'
                ? `Editing version ${currentVersion} draft`
                : `New version ${nextVersion}`}
          </CardTitle>
          {mode !== 'new' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'draft'
                ? 'Changes to a draft update this version in place.'
                : 'Saving creates a new draft with the same quote number; the issued version stays unchanged.'}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quote-client-select">Client directory</Label>
              <Select
                value={form.clientId || 'none'}
                onValueChange={onSelectClient}
              >
                <SelectTrigger id="quote-client-select">
                  <SelectValue placeholder="Choose a saved client or enter one below" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-off client (not saved)</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client._id} value={client._id}>
                      {client.name}
                      {client.company ? ` · ${client.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                The quote keeps a snapshot of these fields, so directory edits
                never rewrite history.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-client-name">Client name</Label>
              <Input
                id="quote-client-name"
                value={form.clientName}
                onChange={(event) => update({ clientName: event.target.value })}
                placeholder="Who is this quote for?"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-client-email">Client email</Label>
              <Input
                id="quote-client-email"
                type="email"
                value={form.clientEmail}
                onChange={(event) => update({ clientEmail: event.target.value })}
                placeholder="client@example.com"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-client-phone">Client phone</Label>
              <Input
                id="quote-client-phone"
                value={form.clientPhone}
                onChange={(event) => update({ clientPhone: event.target.value })}
                placeholder="+91 ..."
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(value) => update({ currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="space-y-2">
                <Label htmlFor="quote-adults">Adults</Label>
                <Input
                  id="quote-adults"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={form.adults}
                  onChange={(event) => update({ adults: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-children">Children</Label>
                <Input
                  id="quote-children"
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={form.children}
                  onChange={(event) => update({ children: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-rooms">Rooms</Label>
                <Input
                  id="quote-rooms"
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={form.rooms}
                  onChange={(event) => update({ rooms: event.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-valid-until">Valid until</Label>
              <Input
                id="quote-valid-until"
                type="date"
                value={form.validUntil}
                min={dateInputValue(0)}
                onChange={(event) => update({ validUntil: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-prepared-by">Prepared by</Label>
              <Input
                id="quote-prepared-by"
                value={form.preparedBy}
                onChange={(event) => update({ preparedBy: event.target.value })}
                placeholder="Your name"
                maxLength={120}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm">Line items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={onAddLine}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.lineItems.map((line, index) => (
            <div
              key={line.key}
              className="space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {index + 1}
                </span>
                <Input
                  aria-label={`Line ${index + 1} label`}
                  value={line.label}
                  onChange={(event) =>
                    onUpdateLine(line.key, { label: event.target.value })
                  }
                  placeholder="e.g. 7 nights in Munnar, private cab"
                  maxLength={160}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveLine(line.key)}
                  disabled={form.lineItems.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <Input
                aria-label={`Line ${index + 1} description`}
                value={line.description}
                onChange={(event) =>
                  onUpdateLine(line.key, { description: event.target.value })
                }
                placeholder="Optional details shown under the line"
                maxLength={500}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Quantity</Label>
                  <Input
                    type="number"
                    min={0.01}
                    max={MAX_QUANTITY}
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) =>
                      onUpdateLine(line.key, { quantity: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Unit price</Label>
                  <Input
                    type="number"
                    min={0}
                    max={MAX_UNIT_PRICE}
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) =>
                      onUpdateLine(line.key, { unitPrice: event.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Line total</Label>
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold dark:border-slate-800 dark:bg-slate-900">
                    {lineTotalFor(index)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Markup, tax and discount</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Markup is internal margin and never appears in the client preview.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="quote-markup">
              Markup {canSeeMargin ? '(%)' : '(internal)'}
            </Label>
            <Input
              id="quote-markup"
              type="number"
              min={0}
              max={MAX_MARKUP_PCT}
              step="0.01"
              value={form.markupPct}
              onChange={(event) => update({ markupPct: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-tax">Tax (%)</Label>
            <Input
              id="quote-tax"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.taxPct}
              onChange={(event) => update({ taxPct: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-discount">Discount (amount)</Label>
            <Input
              id="quote-discount"
              type="number"
              min={0}
              max={MAX_DISCOUNT}
              step="0.01"
              value={form.discount}
              onChange={(event) => update({ discount: event.target.value })}
            />
          </div>
          <p className="text-[11px] text-slate-500 sm:col-span-3">
            Tax is applied after markup and discount. The server recomputes every
            amount in minor units when you save.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm">Inclusions, exclusions and terms</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              One line per entry. Clear a box to remove that section from the quote.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetTerms}
            title="Replace these lists with the agency defaults"
          >
            Reset to defaults
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="quote-inclusions">Inclusions</Label>
            <Textarea
              id="quote-inclusions"
              rows={5}
              value={form.inclusions}
              onChange={(event) => update({ inclusions: event.target.value })}
              placeholder={'Return airport transfers\nBreakfast daily'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-exclusions">Exclusions</Label>
            <Textarea
              id="quote-exclusions"
              rows={5}
              value={form.exclusions}
              onChange={(event) => update({ exclusions: event.target.value })}
              placeholder={'International flights\nTravel insurance'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-terms">Terms</Label>
            <Textarea
              id="quote-terms"
              rows={5}
              value={form.terms}
              onChange={(event) => update({ terms: event.target.value })}
              placeholder={'50% deposit to confirm\nBalance due 21 days before travel'}
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {mode === 'draft'
          ? 'Saving updates this draft in place.'
          : mode === 'new'
            ? 'Saving creates version 1 of this quote.'
            : `Saving creates version ${nextVersion} with the same quote number.`}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Read-only details and preview                                             */
/* -------------------------------------------------------------------------- */

const QuoteDetails: React.FC<{
  quote: AgencyQuote;
  canSeeMargin: boolean;
  isOldVersion: boolean;
  latestVersion?: number;
}> = ({ quote, canSeeMargin, isOldVersion, latestVersion }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">
        Quote details
        {isOldVersion ? (
          <span className="ml-2 text-xs font-normal text-slate-500">
            viewing v{quote.version}; latest is v{latestVersion}
          </span>
        ) : null}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Prepared for
          </div>
          <div className="mt-0.5 text-sm font-semibold">{quote.client.name}</div>
          <div className="text-xs text-slate-500">
            {[quote.client.email, quote.client.phone].filter(Boolean).join(' · ') ||
              'No contact details'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Travellers
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-3.5 w-3.5" />
            {quote.client.adults} adult{quote.client.adults === 1 ? '' : 's'}
            {quote.client.children
              ? ` · ${quote.client.children} child${quote.client.children === 1 ? '' : 'ren'}`
              : ''}
          </div>
          <div className="text-xs text-slate-500">
            {quote.client.rooms !== undefined
              ? `${quote.client.rooms} room${quote.client.rooms === 1 ? '' : 's'}`
              : 'Room count not specified'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Validity
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatAgencyDate(quote.validUntil)}
          </div>
          <div className="text-xs text-slate-500">
            {quote.sentAt
              ? `Sent ${formatAgencyDate(quote.sentAt)}`
              : 'Not sent yet'}
            {quote.acceptedAt
              ? ` · Accepted ${formatAgencyDate(quote.acceptedAt)}`
              : ''}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Total
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {formatMoney(quote.total, quote.currency)}
          </div>
          <div className="text-xs text-slate-500">
            {formatMoney(quote.perPerson, quote.currency)} per person
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Lines
        </div>
        {quote.lineItems.map((line, index) => (
          <div
            key={`${line.label}-${index}`}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{line.label}</div>
              {line.description ? (
                <div className="text-xs text-slate-500">{line.description}</div>
              ) : null}
              <div className="text-[11px] text-slate-500">
                {line.quantity} × {formatMoney(line.unitPrice, quote.currency)}
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold">
              {formatMoney(line.total, quote.currency)}
            </div>
          </div>
        ))}
      </div>

      {canSeeMargin ? (
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Internal margin: markup {quote.markupPct ?? 0}% (
          {formatMoney(quote.markupAmount ?? 0, quote.currency)}). This never
          appears in the client preview.
        </div>
      ) : null}

      <TermLists quote={quote} />
    </CardContent>
  </Card>
);

const TermLists: React.FC<{ quote: AgencyQuote }> = ({ quote }) => {
  const sections = [
    { title: 'Inclusions', items: quote.inclusions },
    { title: 'Exclusions', items: quote.exclusions },
    { title: 'Terms', items: quote.terms },
  ].filter((section) => section.items.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {sections.map((section) => (
        <div key={section.title} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {section.title}
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {section.items.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-1.5">
                <span className="text-slate-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

interface QuotePreviewCardProps {
  data: QuotePreviewData | null;
  mode: 'internal' | 'client';
  onModeChange: (mode: 'internal' | 'client') => void;
  canSeeMargin: boolean;
  agencyName: string;
  tripTitle: string;
  tripStartDate?: string;
  tripEndDate?: string;
  isDraft: boolean;
  isEditingPreview: boolean;
}

const QuotePreviewCard: React.FC<QuotePreviewCardProps> = ({
  data,
  mode: modeProp,
  onModeChange,
  canSeeMargin,
  agencyName,
  tripTitle,
  tripStartDate,
  tripEndDate,
  isDraft,
  isEditingPreview,
}) => {
  const mode = canSeeMargin ? modeProp : 'client';
  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-xs text-slate-500">
          Fill in the client, dates and line items to see the preview.
        </CardContent>
      </Card>
    );
  }

  const packagePrice = fromMinor(toMinor(data.subtotal) + toMinor(data.markupAmount));
  const hideMargin = mode === 'client' || !canSeeMargin;
  const showTax = data.taxAmount > 0;
  const showDiscount = data.discount > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b bg-slate-50/70 pb-3 dark:bg-slate-900/40">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {mode === 'client' ? (
              <Eye className="h-4 w-4" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
            {mode === 'client' ? 'Client preview' : 'Internal preview'}
          </CardTitle>
          {canSeeMargin ? (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => onModeChange('internal')}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium',
                  mode === 'internal'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500'
                )}
              >
                Internal
              </button>
              <button
                type="button"
                onClick={() => onModeChange('client')}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium',
                  mode === 'client'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500'
                )}
              >
                Client
              </button>
            </div>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          {mode === 'client'
            ? 'Markup, internal margin and the preparing agent are hidden. The client only sees prices, terms and the trip content.'
            : 'Internal view includes margin and prepared-by. Nothing here is shared from this panel.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-teal-700 dark:text-teal-300">
              {agencyName}
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight">
              {tripTitle || 'Trip proposal'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {[tripStartDate, tripEndDate]
                .filter(Boolean)
                .map((date) => formatAgencyDate(date as string))
                .join(' – ') || 'Dates to be confirmed'}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] text-slate-500">{data.number}</div>
            {data.version ? (
              <div className="text-[10px] text-slate-500">v{data.version}</div>
            ) : null}
            <Badge
              variant="outline"
              className={cn(
                'mt-1 text-[9px]',
                isDraft
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
              )}
            >
              {isEditingPreview ? 'Draft preview' : isDraft ? 'Draft' : 'Issued'}
            </Badge>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <span className="font-semibold">{data.client.name || 'Client name'}</span>
            <span className="text-slate-500">
              {data.client.adults} adult{data.client.adults === 1 ? '' : 's'}
              {data.client.children > 0
                ? ` · ${data.client.children} child${data.client.children === 1 ? '' : 'ren'}`
                : ''}
            </span>
          </div>
          {data.client.email || data.client.phone ? (
            <div className="mt-0.5 text-slate-500">
              {[data.client.email, data.client.phone].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          {data.lineItems.map((line, index) => (
            <div key={`${line.label}-${index}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium">
                  {line.label || `Line ${index + 1}`}
                </div>
                {line.description ? (
                  <div className="text-[11px] text-slate-500">{line.description}</div>
                ) : null}
                <div className="text-[10px] text-slate-500">
                  {line.quantity} × {formatMoney(line.unitPrice, data.currency)}
                </div>
              </div>
              <div className="shrink-0 text-xs font-semibold">
                {formatMoney(line.total, data.currency)}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t pt-3 text-xs">
          {hideMargin ? (
            <>
              <PreviewRow
                label={data.markupAmount > 0 ? 'Package price' : 'Subtotal'}
                value={formatMoney(
                  data.markupAmount > 0 ? packagePrice : data.subtotal,
                  data.currency
                )}
              />
              {showDiscount ? (
                <PreviewRow
                  label="Discount"
                  value={`− ${formatMoney(data.discount, data.currency)}`}
                />
              ) : null}
              {showTax ? (
                <PreviewRow
                  label={`Tax (${data.taxPct}%)`}
                  value={formatMoney(data.taxAmount, data.currency)}
                />
              ) : null}
            </>
          ) : (
            <>
              <PreviewRow
                label="Subtotal"
                value={formatMoney(data.subtotal, data.currency)}
              />
              {data.markupPct || data.markupAmount ? (
                <PreviewRow
                  label={`Markup (${data.markupPct}%)`}
                  value={formatMoney(data.markupAmount, data.currency)}
                />
              ) : null}
              {showDiscount ? (
                <PreviewRow
                  label="Discount"
                  value={`− ${formatMoney(data.discount, data.currency)}`}
                />
              ) : null}
              {showTax ? (
                <PreviewRow
                  label={`Tax (${data.taxPct}%)`}
                  value={formatMoney(data.taxAmount, data.currency)}
                />
              ) : null}
            </>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-base font-bold">
              {formatMoney(data.total, data.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Per person</span>
            <span>{formatMoney(data.perPerson, data.currency)}</span>
          </div>
          {hideMargin && data.markupAmount > 0 ? (
            <p className="pt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
              The package price includes agency planning, sourcing and handling
              fees. Taxes and discounts are shown separately.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Valid until {formatAgencyDate(data.validUntil)}
          </span>
          {!hideMargin && data.preparedBy ? (
            <span>Prepared by {data.preparedBy}</span>
          ) : null}
        </div>

        <TermPreview data={data} />
      </CardContent>
    </Card>
  );
};

const PreviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-slate-600 dark:text-slate-400">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

const TermPreview: React.FC<{ data: QuotePreviewData }> = ({ data }) => {
  const sections = [
    { title: 'Inclusions', items: data.inclusions },
    { title: 'Exclusions', items: data.exclusions },
    { title: 'Terms', items: data.terms },
  ].filter((section) => section.items.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {section.title}
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
            {section.items.map((item, index) => (
              <li key={`${item}-${index}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default AgencyQuotePanel;
