import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  IndianRupee,
  PieChart as PieIcon,
  BarChart3,
  ShieldCheck,
  CreditCard,
  Banknote,
  Info,
  TrendingDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { ItineraryData } from "@/types/trip";

interface BudgetVisualizerProps {
  budget: ItineraryData["budget_breakdown"];
  daysCount: number;
  groupType: string;
  paymentTips: ItineraryData["footnotes_safety_tips"]["payment"];
  perPersonBudget: number;
}

const CATEGORY_COLORS = {
  Accommodation: "#3b82f6", // Blue
  "Food & Drinks": "#f97316", // Orange
  Activities: "#10b981", // Emerald
  Transport: "#8b5cf6", // Purple
  "Buffer / Misc": "#f59e0b", // Amber
};

export const BudgetVisualizer: React.FC<BudgetVisualizerProps> = ({
  budget,
  daysCount,
  groupType,
  paymentTips,
  perPersonBudget,
}) => {
  const [viewMode, setViewMode] = useState<"total" | "perPerson">("total");

  // Determine estimated travelers count
  const estimatedTravelers = Math.max(
    1,
    Math.round(budget.total / Math.max(1, perPersonBudget))
  );

  const multiplier = viewMode === "perPerson" ? 1 / estimatedTravelers : 1;

  const pieData = [
    {
      name: "Accommodation",
      value: Math.round(budget.accommodation * multiplier),
      color: CATEGORY_COLORS.Accommodation,
    },
    {
      name: "Food & Drinks",
      value: Math.round(budget.food_and_drinks * multiplier),
      color: CATEGORY_COLORS["Food & Drinks"],
    },
    {
      name: "Activities",
      value: Math.round(budget.activities_and_entry * multiplier),
      color: CATEGORY_COLORS.Activities,
    },
    {
      name: "Transport",
      value: Math.round(budget.local_transport * multiplier),
      color: CATEGORY_COLORS.Transport,
    },
    {
      name: "Buffer / Misc",
      value: Math.round(budget.miscellaneous_buffer * multiplier),
      color: CATEGORY_COLORS["Buffer / Misc"],
    },
  ];

  // Daily spend distribution estimation
  const dailySpend = Math.round((budget.total * multiplier) / Math.max(1, daysCount));
  const barData = Array.from({ length: daysCount }, (_, i) => ({
    day: `Day ${i + 1}`,
    cost: Math.round(dailySpend * (0.85 + ((i % 3) * 0.15))),
  }));

  const activeTotal = Math.round(budget.total * multiplier);

  return (
    <div className="space-y-8">
      {/* Top Controls Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-card border border-border/70 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Financial Breakdown
            </span>
            <Badge variant="outline" className="text-[10px]">
              ₹ INR
            </Badge>
          </div>
          <h3 className="text-xl font-extrabold text-foreground">
            Budget Allocation & Analytics
          </h3>
        </div>

        {/* View Toggle */}
        <div className="flex flex-col sm:inline-flex sm:flex-row w-full sm:w-auto p-1 bg-muted/60 rounded-2xl border border-border/60 gap-1 sm:gap-0">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "total" ? "hero" : "ghost"}
            onClick={() => setViewMode("total")}
            className="rounded-xl text-xs font-bold h-8 px-3 sm:px-4 w-full sm:w-auto"
          >
            Total Trip (₹{budget.total.toLocaleString("en-IN")})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "perPerson" ? "hero" : "ghost"}
            onClick={() => setViewMode("perPerson")}
            className="rounded-xl text-xs font-bold h-8 px-3 sm:px-4 w-full sm:w-auto"
          >
            Per Person (₹{perPersonBudget.toLocaleString("en-IN")})
          </Button>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Share Donut Chart */}
        <Card className="rounded-3xl border border-border/70 shadow-card bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-primary" />
                Category Share
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                Total: ₹{activeTotal.toLocaleString("en-IN")}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Optimized distribution across stays, meals, transit, and contingency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [
                      `₹${val.toLocaleString("en-IN")} (${Math.round(
                        (val / activeTotal) * 100
                      )}%)`,
                      "Estimated Cost",
                    ]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: "1rem",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Daily Spending Bar Chart */}
        <Card className="rounded-3xl border border-border/70 shadow-card bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                Daily Spending Rhythm
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                Avg: ₹{dailySpend.toLocaleString("en-IN")}/day
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Projected day-by-day cashflow based on activities and dining
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: number) => [`₹${val.toLocaleString("en-IN")}`, "Projected Spend"]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: "1rem",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  />
                  <Bar dataKey="cost" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contingency Buffer & Payment Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contingency Buffer */}
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Emergency Buffer Reserved</span>
          </div>
          <div className="text-2xl font-black text-amber-800 dark:text-amber-300">
            ₹{(budget.miscellaneous_buffer * multiplier).toLocaleString("en-IN")}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Allocated ~10% for mountain weather delays, road block detours, camera entry fees, and unexpected local auto charges.
          </p>
        </div>

        {/* UPI vs Cash Advice */}
        <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <Banknote className="w-4 h-4" />
            <span>Regional Payment Advice</span>
          </div>
          <div className="space-y-1.5 text-xs text-foreground/90">
            <div>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">UPI / QR Code: </span>
              <span className="text-muted-foreground">{paymentTips?.upi || "Accepted at 90% of stores and restaurants."}</span>
            </div>
            <div>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">Cash Reserve: </span>
              <span className="text-muted-foreground">{paymentTips?.cash || "Keep ₹2,000-₹5,000 cash for tolls and mountain passes."}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
