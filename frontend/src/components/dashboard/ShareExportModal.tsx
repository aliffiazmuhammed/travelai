import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Share2,
  Copy,
  Check,
  FileText,
  Download,
  Printer,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { ItineraryData } from "@/types/trip";

interface ShareExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId?: string;
  data: ItineraryData;
  initialShareId?: string;
  /** Creating/reading the share link is owner-only on the server (Milestone 6 §3.3). */
  canManageShare?: boolean;
}

export const ShareExportModal: React.FC<ShareExportModalProps> = ({
  isOpen,
  onClose,
  tripId,
  data,
  initialShareId,
  canManageShare = true,
}) => {
  const [shareId, setShareId] = useState<string | undefined>(initialShareId);
  const [loadingShare, setLoadingShare] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const publicUrl = shareId
    ? `${window.location.origin}/shared/${shareId}`
    : "";

  const handleGenerateLink = async () => {
    if (!tripId) {
      toast.error("Trip must be saved to generate a shareable link.");
      return;
    }
    try {
      setLoadingShare(true);
      const res = await api.shareTrip(tripId);
      setShareId(res.shareId);
      toast.success("Shareable link generated successfully!");
    } catch (err: any) {
      console.error("Failed to generate share link:", err);
      toast.error(err.message || "Failed to generate link.");
    } finally {
      setLoadingShare(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    toast.success("Public link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Generate plain-text structured summary for WhatsApp / Telegram / Email
  const handleCopyFormattedText = () => {
    const textLines = [
      `🌍 Travel Itinerary: ${data.trip_title}`,
      `⏳ Duration: ${data.duration_days} Days / ${Math.max(1, data.duration_days - 1)} Nights`,
      `👥 Group: ${data.group_type} | 🌤️ Season: ${data.season}`,
      `💰 Budget: ₹${data.budget_per_person.toLocaleString("en-IN")}/person (Total: ₹${data.budget_breakdown.total.toLocaleString("en-IN")})`,
      "",
      `✨ Highlights:`,
      ...data.highlights.map((h) => `• ${h}`),
      "",
      `📅 Day-by-Day Schedule:`,
      ...data.day_by_day_itinerary.map(
        (day) =>
          `Day ${day.day}: ${day.title}\n` +
          `  Activities: ${day.activities.map((a) => (typeof a === "object" && a !== null ? (a.title || a.name) : a)).join(" • ")}\n` +
          `  Stay: ${day.stay_recommendations.map((s) => (typeof s === "object" && s !== null ? s.name : s)).join(", ") || "Local stay"}\n` +
          `  Food Spots: ${day.food_spots.join(", ") || "Regional dining"}`
      ),
      "",
      `💸 Budget Allocation:`,
      `• Accommodation: ₹${data.budget_breakdown.accommodation.toLocaleString("en-IN")}`,
      `• Food & Drinks: ₹${data.budget_breakdown.food_and_drinks.toLocaleString("en-IN")}`,
      `• Activities: ₹${data.budget_breakdown.activities_and_entry.toLocaleString("en-IN")}`,
      `• Local Transport: ₹${data.budget_breakdown.local_transport.toLocaleString("en-IN")}`,
      `• Emergency Buffer: ₹${data.budget_breakdown.miscellaneous_buffer.toLocaleString("en-IN")}`,
      "",
      publicUrl ? `🔗 View interactive itinerary online: ${publicUrl}` : `Crafted with TravelAI`,
    ];

    const formatted = textLines.join("\n");
    navigator.clipboard.writeText(formatted);
    setCopiedText(true);
    toast.success("Formatted summary copied! Ready to paste into chat or email.");
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Download JSON export
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = data.trip_title.toLowerCase().replace(/[^a-z0-9]/g, "-");
    link.href = url;
    link.download = `${safeTitle}-itinerary.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Itinerary JSON downloaded!");
  };

  const handlePrint = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden w-[95vw] sm:w-full p-4 sm:p-8 space-y-4 sm:space-y-6">
        <DialogHeader className="text-left space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary w-fit">
            <Share2 className="w-3.5 h-3.5" />
            <span>Share & Export</span>
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black text-foreground">
            Share Your Travel Itinerary
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Distribute your trip with friends, download files, or print a travel guide.
          </DialogDescription>
        </DialogHeader>

        {/* 1. Public Share Link Section (owner-only — link creation is a server gate) */}
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>Public Read-Only Web Link</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              {shareId ? "Active" : canManageShare ? "Not yet generated" : "Owner only"}
            </span>
          </div>

          {canManageShare ? (
            shareId ? (
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicUrl}
                className="h-10 text-xs bg-card rounded-xl border-border/80 font-mono"
              />
              <Button
                type="button"
                size="sm"
                variant="hero"
                onClick={handleCopyLink}
                className="h-10 px-3.5 rounded-xl text-xs font-bold gap-1.5 shrink-0"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={loadingShare}
              onClick={handleGenerateLink}
              className="w-full h-10 rounded-xl text-xs font-bold gap-2"
            >
              {loadingShare ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              <span>{loadingShare ? "Creating Public Link..." : "Create Public Share Link"}</span>
            </Button>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Only the trip owner can create or see the share link.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Anyone with this link can view the interactive itinerary without needing an account.
          </p>
        </div>

        {/* 2. Export Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Copy Plain Text */}
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyFormattedText}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl border-border/70 hover:border-primary/40 space-y-1.5 text-center"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {copiedText ? <Check className="w-4 h-4 text-emerald-500" /> : <FileText className="w-4 h-4" />}
            </div>
            <span className="text-xs font-bold text-foreground">
              {copiedText ? "Copied Text" : "Copy as Text"}
            </span>
            <span className="text-[10px] text-muted-foreground">For WhatsApp / Email</span>
          </Button>

          {/* Download JSON */}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadJson}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl border-border/70 hover:border-primary/40 space-y-1.5 text-center"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-foreground">Export JSON</span>
            <span className="text-[10px] text-muted-foreground">Full data backup</span>
          </Button>

          {/* Print / PDF */}
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl border-border/70 hover:border-primary/40 space-y-1.5 text-center"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-foreground">Print / PDF</span>
            <span className="text-[10px] text-muted-foreground">Browser print</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
