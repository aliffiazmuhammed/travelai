import { jsPDF } from "jspdf";
import type { ItineraryData } from "@/types/trip";

/**
 * Purpose-built itinerary PDF (replaces the old `window.print()` screen dump).
 *
 * Renders a clean A4 document directly from the itinerary data — no screen
 * capture, no print-CSS heroics: generous margins, real headings, wrapped
 * text with room to breathe, and controlled page breaks.
 *
 * `jsPDF`'s standard fonts lack the ₹ glyph, so all money is rendered as
 * `Rs.`. Loaded via dynamic import — it never lands in the main bundle.
 */

// A4 + margins (mm)
const PAGE_W = 210;
const PAGE_H = 297;
const M = 16; // side margin
const TOP = 16;
const BOTTOM = 20; // reserved for the footer
const CONTENT_W = PAGE_W - M * 2;

// Palette
const SKY: [number, number, number] = [2, 132, 199]; // primary
const SKY_DEEP: [number, number, number] = [2, 90, 140];
const INK: [number, number, number] = [30, 41, 59]; // slate-800
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const LINE: [number, number, number] = [226, 232, 240]; // slate-200
const SOFT: [number, number, number] = [241, 245, 249]; // slate-100
const AMBER: [number, number, number] = [180, 83, 9];
const EMERALD: [number, number, number] = [5, 120, 100];

const rs = (n: number) =>
  `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const clean = (s: string) =>
  String(s ?? "")
    .replace(/₹/g, "Rs.")
    // jsPDF text() chokes on rare control chars
    .replace(/[\u0000-\u001F\u007F]/g, "");

interface Ctx {
  doc: jsPDF;
  y: number;
}

const MAG_R = 10; // right inset for day titles

function ensureSpace(c: Ctx, needed: number) {
  if (c.y + needed > PAGE_H - BOTTOM) {
    // Note: no footer stamping here — footers are drawn once at the end, when
    // the true page total is known (mid-document stamping left stale "of N").
    c.doc.addPage();
    c.y = TOP;
  }
}

function fillRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
  radius = 0
) {
  doc.setFillColor(...color);
  if (radius > 0) doc.roundedRect(x, y, w, h, radius, radius, "F");
  else doc.rect(x, y, w, h, "F");
}

function strokeRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
  radius = 0
) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  if (radius > 0) doc.roundedRect(x, y, w, h, radius, radius, "S");
  else doc.rect(x, y, w, h, "S");
}

/** Wrapped text returning the lines actually drawn (caller adds spacing). */
function text(
  doc: jsPDF,
  s: string,
  x: number,
  yy: number,
  w: number,
  opts?: { size?: number; color?: [number, number, number]; bold?: boolean; lineH?: number; align?: "left" | "center" | "right" }
): number {
  const size = opts?.size ?? 10;
  const lineH = opts?.lineH ?? size * 0.55;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(opts?.color ?? INK));
  const lines = doc.splitTextToSize(clean(s), w) as string[];
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, yy + i * lineH, { align: opts?.align ?? "left" });
  }
  return lines.length;
}

function drawFooter(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Generated with TravelAI", M, PAGE_H - 10);
    doc.text(`Page ${i} of ${total}`, PAGE_W - M, PAGE_H - 10, { align: "right" });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 14, PAGE_W - M, PAGE_H - 14);
  }
}

// ---------------------------------------------------------------- sections

function drawCover(ctx: Ctx, data: ItineraryData) {
  const { doc } = ctx;
  const bandH = 46;
  // Gradient-ish header band (solid with a deeper base strip)
  fillRect(doc, M, TOP, CONTENT_W, bandH, SKY, 5);
  fillRect(doc, M, TOP + bandH - 6, CONTENT_W, 6, SKY_DEEP, 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(220, 240, 255);
  doc.text(clean("TRAVELAI  ·  AI 2.5"), PAGE_W - M - 6, TOP + 10, { align: "right" });

  // Titles — shrink rather than truncate when the destination name is long
  doc.setFont("helvetica", "bold");
  let titleSize = 19;
  doc.setFontSize(titleSize);
  let titleLines = doc.splitTextToSize(clean(data.trip_title || "Your Trip"), CONTENT_W - 24) as string[];
  if (titleLines.length > 2) {
    titleSize = 15.5;
    doc.setFontSize(titleSize);
    titleLines = doc.splitTextToSize(clean(data.trip_title || "Your Trip"), CONTENT_W - 20) as string[];
  }
  doc.setTextColor(255, 255, 255);
  let ty = TOP + 17;
  titleLines.slice(0, 2).forEach((line: string) => {
    doc.text(line, M + 10, ty);
    ty += titleSize * 0.45;
  });

  // Meta line under the title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(235, 248, 255);
  const nights = Math.max(1, data.duration_days - 1);
  doc.text(
    clean(
      `${data.duration_days} Days / ${nights} Nights   ·   ${data.group_type || "Travelers"}   ·   ${data.season || "Any"} Season`
    ),
    M + 10,
    TOP + bandH - 12
  );

  ctx.y = TOP + bandH + 10;

  // Quick stats — 4 mini cards in one row
  const total = data.budget_breakdown.total;
  const stats: [string, string][] = [
    ["Total (est.)", rs(total)],
    ["Per person", rs(data.budget_per_person)],
    ["Per day", `Rs. ${Math.round(total / Math.max(1, data.duration_days)).toLocaleString("en-IN")}`],
    ["Stay", `${data.duration_days}D / ${nights}N`],
  ];
  const gap = 4;
  const cardW = (CONTENT_W - gap * 3) / 4;
  const cardH = 18;
  stats.forEach(([label, value], i) => {
    const x = M + i * (cardW + gap);
    fillRect(doc, x, ctx.y, cardW, cardH, SOFT, 2.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, ctx.y + 6.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(label === "Stay" ? 9.5 : 9);
    doc.setTextColor(...INK);
    doc.text(clean(value), x + 3, ctx.y + 13.5);
  });

  ctx.y += cardH + 8;

  // Highlights
  if (data.highlights?.length) {
    sectionHeading(ctx, "Trip Highlights");
    const boxX = M;
    data.highlights.forEach((h, i) => {
      const yy = ctx.y;
      const lines = text(doc, h, boxX + 6, yy + 4, CONTENT_W - 12, { size: 9.5, color: INK });
      // bullet
      doc.setFillColor(...SKY);
      doc.circle(boxX + 2, yy + 4 - 1.2, 1, "F");
      ctx.y = yy + 4 + lines * 4.4 - 2.4;
      if (i < data.highlights.length - 1) ctx.y += 1.6;
    });
    ctx.y += 6;
  }
}

function sectionHeading(ctx: Ctx, s: string) {
  const { doc } = ctx;
  ctx.y += 3; // breathing room before a new major section
  ensureSpace(ctx, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...SKY_DEEP);
  doc.text(clean(s), M, ctx.y + 2);
  const w = doc.getTextWidth(clean(s));
  doc.setDrawColor(...SKY);
  doc.setLineWidth(0.8);
  doc.line(M, ctx.y + 4, M + w, ctx.y + 4);
  ctx.y += 9;
}

function drawDay(ctx: Ctx, day: ItineraryData["day_by_day_itinerary"][number]) {
  const { doc } = ctx;

  // Day header: badge + title
  ensureSpace(ctx, 18);
  const badgeR = 5.5;
  doc.setFillColor(...SKY);
  doc.circle(M + badgeR, ctx.y + 4.5, badgeR, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(String(day.day), M + badgeR, ctx.y + 6.4, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  const title = clean(day.title).replace(/^day\s*\d+\s*[:\-–]\s*/i, "");
  const titleLines = doc.splitTextToSize(title, CONTENT_W - MAG_R - badgeR * 2 + 8) as string[];
  let ty = ctx.y + 2.4;
  titleLines.slice(0, 3).forEach((line: string) => {
    doc.text(line, M + badgeR * 2 + 2, ty);
    ty += 6;
  });
  ctx.y = Math.max(ctx.y + badgeR + 5, ty + 1) + 1.5;

  // Permit pill
  if (day.permit_required) {
    ensureSpace(ctx, 10);
    doc.setFillColor(253, 230, 138);
    const pw = 46;
    doc.roundedRect(M, ctx.y, pw, 7, 3.5, 3.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...AMBER);
    doc.text("PERMIT REQUIRED", M + pw / 2, ctx.y + 4.8, { align: "center" });
    ctx.y += 10;
  }

  // Activities
  const slotOf = (i: number) =>
    ["Morning", "Afternoon", "Sunset / Evening", "Night"][i % 4];

  day.activities.forEach((act, i) => {
    const isObj = typeof act === "object" && act !== null;
    const titleA = isObj ? act.title || act.name || "" : String(act);
    const desc = isObj ? act.description || "" : "";
    const loc = isObj ? act.location_name || act.location || "" : "";
    const time = isObj ? act.time || "" : "";
    const cost = isObj ? act.approx_cost : null;

    const headH = 6.5; // slot label row + gap before the title
    let blockH = headH + 2;
    if (time || loc || (cost != null && cost > 0)) blockH += 5;
    const estDesc =
      desc
        ? (doc as any).splitTextToSize(clean(desc), CONTENT_W - 6, {}).length * 4.2
        : 0;
    blockH += estDesc;

    ensureSpace(ctx, blockH + 6);

    const startY = ctx.y;

    // Time-slot label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(clean((time ? `${time}` : slotOf(i)).toUpperCase()), M + 2, startY + 3.2);
    if (cost != null && cost > 0) {
      doc.setTextColor(...EMERALD);
      doc.text(clean(rs(cost)), PAGE_W - M, startY + 3.2, { align: "right" });
    }

    let yy = startY + headH + 1;
    const tLines = text(doc, titleA, M + 2, yy, CONTENT_W - 4, {
      size: 10.5,
      bold: true,
      lineH: 5,
    });
    yy += tLines * 5;

    if (desc) {
      yy += 1.2;
      const dLines = text(doc, desc, M + 2, yy, CONTENT_W - 4, {
        size: 9,
        color: MUTED,
        lineH: 4.2,
      });
      yy += dLines * 4.2;
    }

    if (loc) {
      yy += 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...SKY_DEEP);
      doc.text(clean(`@ ${loc}`), M + 2, yy);
      yy += 4;
    }

    ctx.y = yy + 2.5;

    // Subtle separator between activities
    if (i < day.activities.length - 1) {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(M + 2, ctx.y, PAGE_W - M, ctx.y);
      ctx.y += 2.5;
    }
  });

  // Day logistics: stay / food / transport
  const stay = day.stay_recommendations
    .map((sv) => (typeof sv === "object" && sv !== null ? sv.name : String(sv)))
    .filter(Boolean)
    .join(", ");
  const food = day.food_spots.filter(Boolean).join(", ");
  const transport = day.transport.filter(Boolean).join(" - ");
  const proTip = (day.pro_tip || []).filter(Boolean).join(" ");

  if (stay || food || transport || proTip) {
    const rows: [string, string][] = [
      stay ? ["Stay", stay] : null,
      food ? ["Food", food] : null,
      transport ? ["Getting around", transport] : null,
    ].filter(Boolean) as [string, string][];

    const tipLines = proTip
      ? ((doc as any).splitTextToSize(clean(proTip), CONTENT_W - 16, {}).length as number)
      : 0;
    const boxH = rows.length * 6.5 + (tipLines ? tipLines * 4.4 + 7 : 5);
    ensureSpace(ctx, boxH + 6);

    const y0 = ctx.y;
    fillRect(doc, M, y0, CONTENT_W, boxH, SOFT, 3);
    strokeRect(doc, M, y0, CONTENT_W, boxH, LINE, 3);

    let yy = y0 + 6;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...SKY_DEEP);
      doc.text(label.toUpperCase(), M + 5, yy);
      const vLines = text(doc, value, M + 32, yy - 0.4, CONTENT_W - 38, {
        size: 9,
        color: INK,
        lineH: 4,
      });
      yy += Math.max(6, vLines * 4 + 2);
    });

    if (proTip) {
      yy += 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...AMBER);
      doc.text("TIP", M + 5, yy);
      text(doc, proTip, M + 14, yy - 0.2, CONTENT_W - 22, {
        size: 8.5,
        color: AMBER,
      });
    }

    ctx.y = y0 + boxH + 7;
  }
}

function drawBudget(ctx: Ctx, data: ItineraryData) {
  const b = data.budget_breakdown;
  sectionHeading(ctx, "Budget Breakdown");

  // Keep the table intact on one page (5 rows + total + header) — avoids an
  // orphaned first row at the bottom of a page.
  ensureSpace(ctx, 52);

  const rows: [string, number][] = [
    ["Accommodation", b.accommodation],
    ["Food & Drinks", b.food_and_drinks],
    ["Activities & Entry", b.activities_and_entry],
    ["Local Transport", b.local_transport],
    ["Emergency Buffer", b.miscellaneous_buffer],
  ];

  const colW = CONTENT_W * 0.62;
  rows.forEach(([label, value], i) => {
    ensureSpace(ctx, 7);
    if (i % 2 === 0) {
      fillRect(ctx.doc, M, ctx.y - 0.5, CONTENT_W, 6.2, SOFT, 1.5);
    }
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(9.5);
    ctx.doc.setTextColor(...INK);
    ctx.doc.text(clean(label), M + 3, ctx.y + 3.4);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.text(clean(rs(value)), M + colW, ctx.y + 3.4);
    ctx.y += 6.2;
  });

  // Total row
  ensureSpace(ctx, 9);
  fillRect(ctx.doc, M, ctx.y - 0.5, CONTENT_W, 8, SKY, 2);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(255, 255, 255);
  ctx.doc.text("Total Estimated", M + 3, ctx.y + 4.8);
  ctx.doc.text(clean(rs(b.total)), M + colW, ctx.y + 4.8);
  ctx.y += 11;

  // Payment advice
  const pay = data.footnotes_safety_tips?.payment;
  if (pay && (pay.upi || pay.cash)) {
    ensureSpace(ctx, 20);
    fillRect(ctx.doc, M, ctx.y, CONTENT_W, 22, [236, 253, 245], 3);
    strokeRect(ctx.doc, M, ctx.y, CONTENT_W, 22, [167, 233, 212], 3);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(9);
    ctx.doc.setTextColor(...EMERALD);
    ctx.doc.text("PAYMENT ADVICE", M + 5, ctx.y + 6.5);
    let yy = ctx.y + 12;
    if (pay.upi) {
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(...INK);
      ctx.doc.text("UPI:", M + 5, yy);
      text(ctx.doc, pay.upi, M + 16, yy, CONTENT_W - 20, { size: 8.5, color: INK });
      yy += 5;
    }
    if (pay.cash) {
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(...INK);
      ctx.doc.text("Cash:", M + 5, yy);
      text(ctx.doc, pay.cash, M + 16, yy, CONTENT_W - 20, { size: 8.5, color: INK });
    }
    ctx.y += 26;
  }
}

export function exportItineraryPdf(data: ItineraryData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ctx: Ctx = { doc, y: 0 };

  drawCover(ctx, data);

  data.day_by_day_itinerary.forEach((day) => {
    ctx.y = Math.max(ctx.y, TOP) + 4;
    ensureSpace(ctx, 26);
    drawDay(ctx, day);
    ctx.y += 6;
  });

  drawBudget(ctx, data);

  // Weather advisory snapshot (short section above the footer)
  const wx = data.weather_advisory;
  if (wx && (wx.expected_weather || wx.risks?.length || wx.packing_tips?.length)) {
    ctx.y = Math.max(ctx.y, TOP) + 2;
    ensureSpace(ctx, 30);
    sectionHeading(ctx, "Weather & Packing");
    if (wx.expected_weather) {
      text(doc, wx.expected_weather, M, ctx.y + 3, CONTENT_W, { size: 9, color: MUTED });
      ctx.y += 8;
    }
    const chips = [
      ...wx.packing_tips.map((t: string) => `Pack: ${t}`),
      ...wx.risks.map((r: string) => `Risk: ${r}`),
    ];
    chips.forEach((c: string) => {
      ensureSpace(ctx, 6);
      const lines = text(doc, `- ${c}`, M + 2, ctx.y + 3, CONTENT_W - 4, { size: 8.5, color: INK });
      ctx.y += lines * 4.2 + 1.8;
    });
  }

  if (data.footnotes_safety_tips) {
    ctx.y = Math.max(ctx.y, TOP) + 2;
    ensureSpace(ctx, 26);
    sectionHeading(ctx, "Safety & Etiquette");
    const groups: [string, string[]][] = [
      ["Safety", data.footnotes_safety_tips.safety || []],
      ["Cultural etiquette", data.footnotes_safety_tips.cultural_etiquette || []],
    ];
    groups.forEach(([label, items]) => {
      if (!items.length) return;
      ensureSpace(ctx, 10);
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setFontSize(9);
      ctx.doc.setTextColor(...SKY_DEEP);
      ctx.doc.text(clean(label.toUpperCase()), M, ctx.y + 2.5);
      ctx.y += 6;
      items.forEach((s: string) => {
        ensureSpace(ctx, 6);
        const lines = text(doc, `- ${s}`, M + 2, ctx.y + 3, CONTENT_W - 4, {
          size: 8.5,
          color: INK,
        });
        ctx.y += lines * 4.2 + 1.8;
      });
      ctx.y += 2;
    });
  }

  drawFooter(doc);

  const safeTitle =
    (data.trip_title || "travelai-trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "travelai-trip";
  doc.save(`${safeTitle}-itinerary.pdf`);
}
