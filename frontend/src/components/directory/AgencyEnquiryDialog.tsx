import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/UserContext";
import { AGENCY_ENQUIRY_BUDGET_LABELS } from "@/lib/agency";
import { api, ApiError } from "@/services/api";
import type {
  AgencyEnquiryAcknowledgement,
  AgencyEnquiryBudgetBand,
  AgencyEnquiryInput,
} from "@/types/agency";

/**
 * Public enquiry form (Milestone 9 D5).
 *
 * One dialog serves both entry points: the profile CTA (no package) and a
 * package card ("Ask about this trip"), which passes the package id and title.
 * The server re-validates everything, so this form's checks only exist to keep
 * a preventable round-trip out of the traveller's way.
 *
 * A signed-in visitor is prefilled from their account but may edit every field:
 * the enquiry is a message to the agency, not an account action.
 */

interface AgencyEnquiryDialogProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  agencyName: string;
  /** Present when the form was opened from a published package card. */
  packageId?: string;
  packageTitle?: string;
  onSubmitted?: () => void;
}

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 1500;

const BUDGET_OPTIONS = (
  Object.entries(AGENCY_ENQUIRY_BUDGET_LABELS) as Array<
    [AgencyEnquiryBudgetBand, string]
  >
).map(([value, label]) => ({ value, label }));

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const nameFromEmail = (email?: string): string => {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase()) : "";
};

const AgencyEnquiryDialog: React.FC<AgencyEnquiryDialogProps> = ({
  open,
  onClose,
  slug,
  agencyName,
  packageId,
  packageTitle,
  onSubmitted,
}) => {
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [budgetBand, setBudgetBand] = useState<AgencyEnquiryBudgetBand | "">("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [ack, setAck] = useState<AgencyEnquiryAcknowledgement | null>(null);
  const [copied, setCopied] = useState(false);

  const minDate = useMemo(todayIso, []);

  // Reopening the dialog starts a fresh enquiry, but keeps the identity of a
  // signed-in traveller so they do not retype it every time.
  useEffect(() => {
    if (!open) return;
    setName(user?.name?.trim() || nameFromEmail(user?.email));
    setEmail(user?.email ?? "");
    setPhone("");
    setAdults("2");
    setChildren("0");
    setStartDate("");
    setEndDate("");
    setFlexible(false);
    setBudgetBand("");
    setMessage("");
    setConsent(false);
    setError(null);
    setSending(false);
    setSent(false);
    setAck(null);
    setCopied(false);
  }, [open, user?.name, user?.email]);

  // A flexible enquiry has no dates at all: clear them so a stale value cannot
  // make the server reject a form the traveller thinks is flexible-only.
  useEffect(() => {
    if (!flexible) return;
    setStartDate("");
    setEndDate("");
  }, [flexible]);

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Tell the agency your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Enter an email address the agency can reply to.";
    }
    const adultCount = Number(adults);
    if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 20) {
      return "Choose between 1 and 20 adults.";
    }
    const childCount = Number(children);
    if (!Number.isInteger(childCount) || childCount < 0 || childCount > 20) {
      return "Choose between 0 and 20 children.";
    }
    if (adultCount + childCount > 30) {
      return "Tell the agency about parties of 30 or fewer.";
    }
    if (!flexible && !startDate) {
      return 'Choose a start date, or tick "My dates are flexible".';
    }
    if (endDate && !startDate) {
      return "Add a start date along with your end date.";
    }
    if (startDate && endDate && endDate < startDate) {
      return "Your end date must be on or after the start date.";
    }
    if (message.trim().length < MESSAGE_MIN) {
      return `Tell the agency a little about the trip you have in mind (at least ${MESSAGE_MIN} characters).`;
    }
    if (message.length > MESSAGE_MAX) {
      return `Keep your message under ${MESSAGE_MAX} characters.`;
    }
    if (!consent) {
      return "Please agree to share your details with this agency before sending.";
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSending(true);
    setError(null);
    try {
      const payload: AgencyEnquiryInput = {
        name: name.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        adults: Number(adults),
        children: Number(children),
        ...(flexible ? { flexible: true } : {}),
        ...(!flexible && startDate ? { startDate } : {}),
        ...(!flexible && endDate ? { endDate } : {}),
        ...(budgetBand ? { budgetBand } : {}),
        message: message.trim(),
        ...(packageId ? { packageId } : {}),
        consent: true,
      };
      const result = await api.submitAgencyEnquiry(slug, payload);
      setAck(result.enquiry);
      setSent(true);
      onSubmitted?.();
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Your enquiry could not be sent. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const title = sent ? "Enquiry sent" : packageTitle ? "Ask about this trip" : `Enquire with ${agencyName}`;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {sent
              ? "The agency has your enquiry in its inbox."
              : `Share the essentials and ${agencyName} will take it from there. Your details go only to this agency.`}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-xs text-foreground">
                <p className="font-bold">Your enquiry is with {agencyName}.</p>
                <p className="text-muted-foreground">
                  You can read and answer their reply right here — no email
                  needed.
                </p>
                {packageTitle ? (
                  <p className="text-muted-foreground">
                    About the package <span className="font-semibold">{packageTitle}</span>.
                  </p>
                ) : null}
              </div>
            </div>

            {ack ? (
              <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Keep this private conversation link
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 text-[10px] text-muted-foreground">
                    {ack.conversation.url}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs font-bold gap-1.5 shrink-0"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(ack.conversation.url)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Anyone with this link can read the thread
                  {ack.conversation.expiresAt
                    ? ` until ${new Date(ack.conversation.expiresAt).toLocaleDateString()}`
                    : ""}
                  .{" "}
                  {user
                    ? "You can also open it from your profile."
                    : "Keep it if you did not sign in — it is your only way back to the reply."}
                </p>
                {user ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Link to={`/enquiry/${ack.id}`} onClick={onClose}>
                      <MessageSquare className="h-3.5 w-3.5" />
                      Open conversation
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" className="rounded-xl text-xs font-bold" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {packageId && packageTitle ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
                Package: <span className="font-bold">{packageTitle}</span>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="enquiry-name" className="text-xs font-bold">
                  Your name
                </Label>
                <Input
                  id="enquiry-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  className="rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enquiry-email" className="text-xs font-bold">
                  Email
                </Label>
                <Input
                  id="enquiry-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={160}
                  autoComplete="email"
                  className="rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="enquiry-phone" className="text-xs font-bold">
                  Phone <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="enquiry-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={24}
                  autoComplete="tel"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enquiry-adults" className="text-xs font-bold">
                  Adults
                </Label>
                <Input
                  id="enquiry-adults"
                  type="number"
                  min={1}
                  max={20}
                  value={adults}
                  onChange={(event) => setAdults(event.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enquiry-children" className="text-xs font-bold">
                  Children
                </Label>
                <Input
                  id="enquiry-children"
                  type="number"
                  min={0}
                  max={20}
                  value={children}
                  onChange={(event) => setChildren(event.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                When are you thinking?
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="enquiry-start" className="text-[11px] font-semibold">
                    Start date
                  </Label>
                  <Input
                    id="enquiry-start"
                    type="date"
                    min={minDate}
                    value={startDate}
                    disabled={flexible}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enquiry-end" className="text-[11px] font-semibold">
                    End date <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="enquiry-end"
                    type="date"
                    min={startDate || minDate}
                    value={endDate}
                    disabled={flexible}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <Checkbox
                  checked={flexible}
                  onCheckedChange={(value) => setFlexible(value === true)}
                />
                My dates are flexible
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="enquiry-budget" className="text-xs font-bold">
                Budget <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <select
                id="enquiry-budget"
                value={budgetBand}
                onChange={(event) =>
                  setBudgetBand(event.target.value as AgencyEnquiryBudgetBand | "")
                }
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">I&apos;m not sure</option>
                {BUDGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="enquiry-message" className="text-xs font-bold">
                What kind of trip?
              </Label>
              <Textarea
                id="enquiry-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MESSAGE_MAX}
                rows={4}
                placeholder="Who is travelling, the places you have in mind, and anything that matters (pace, food, accessibility)."
                className="rounded-xl"
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {message.length}/{MESSAGE_MAX}
              </p>
            </div>

            <label className="flex items-start gap-2 rounded-2xl border border-border/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <Checkbox
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
                className="mt-0.5"
              />
              <span>
                I agree to share these details with {agencyName} so they can
                reply to this enquiry. TravelAI does not send marketing email.
              </span>
            </label>

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-xs font-bold"
                onClick={onClose}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-xl text-xs font-bold gap-1.5"
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send enquiry
              </Button>
            </DialogFooter>

            <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Mail className="h-3 w-3" />
              <MessageSquare className="h-3 w-3" />
              Replies arrive in the agency&apos;s TravelAI inbox, not by email.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AgencyEnquiryDialog;
