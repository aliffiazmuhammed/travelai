import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  differenceInCalendarDays,
  isBefore,
  addDays,
  startOfToday,
} from "date-fns";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { WizardProgress, WizardStep } from "@/components/wizard/WizardProgress";
import {
  ConfirmDestructive,
} from "@/components/ui/confirm-destructive";
import { StepWhere } from "@/components/wizard/StepWhere";
import { StepWhen } from "@/components/wizard/StepWhen";
import { StepWho } from "@/components/wizard/StepWho";
import { StepBudget } from "@/components/wizard/StepBudget";
import { StepStyle } from "@/components/wizard/StepStyle";
import { StepReview } from "@/components/wizard/StepReview";
import { GenerationOverlay } from "@/components/wizard/GenerationOverlay";
import { api } from "@/services/api";
import type { TripLanguage, TravelPace } from "@/types/trip";

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, title: "Destination", shortTitle: "Where" },
  { id: 2, title: "Dates & Time", shortTitle: "When" },
  { id: 3, title: "Travelers", shortTitle: "Who" },
  { id: 4, title: "Budget", shortTitle: "Budget" },
  { id: 5, title: "Travel Style", shortTitle: "Style" },
  { id: 6, title: "Review", shortTitle: "Review" },
];

/** Page headline per step. The card carries the concrete question. */
const STEP_HEADLINES: { personal: string; agency: string }[] = [
  { personal: "Where are you headed?", agency: "Where are your clients headed?" },
  { personal: "When are you going?", agency: "When is the trip?" },
  { personal: "Who's coming along?", agency: "Who's traveling?" },
  { personal: "What's the budget?", agency: "What's the client's budget?" },
  { personal: "What kind of trip is it?", agency: "What kind of trip should it be?" },
  { personal: "Ready to see your plan?", agency: "Ready to draft the itinerary?" },
];

const LOCAL_STORAGE_KEY = "travelai_trip_wizard_draft_v1";
const LAST_PREFS_KEY = "travelai_trip_wizard_last_prefs_v1";

const ALL_STYLES = [
  "Adventure",
  "Culture",
  "Relaxation",
  "Food",
  "Nature",
  "Photography",
  "Nightlife",
  "Shopping",
];

/** Idempotency key for one submit→cancel→retry generation session. */
const createAttemptId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `attempt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

interface TripPlannerProps {
  /** A2: set by the agency shell to create a tenant trip. */
  agencyId?: string;
  agencyName?: string;
  /** Render inside the agency layout instead of the personal Navbar shell. */
  embedded?: boolean;
}

const TripPlanner: React.FC<TripPlannerProps> = ({
  agencyId,
  agencyName,
  embedded = false,
}) => {
  const navigate = useNavigate();
  const isAgencyMode = Boolean(agencyId);

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [resetOpen, setResetOpen] = useState<boolean>(false);
  /** Set once when a saved draft is adopted, so the page explains the jump. */
  const [restoredDraft, setRestoredDraft] = useState<{ at: string | null } | null>(
    null
  );

  // Form State
  const [destination, setDestination] = useState<string>("");
  const [startDate, setStartDate] = useState<Date | undefined>(() => addDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(() => addDays(new Date(), 12));
  const [groupType, setGroupType] = useState<string>("Couple");
  const [adultsCount, setAdultsCount] = useState<number>(2);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [budgetPerPerson, setBudgetPerPerson] = useState<number>(20000);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Culture",
    "Food",
    "Nature",
  ]);
  const [language, setLanguage] = useState<TripLanguage>("en");
  const [pace, setPace] = useState<TravelPace>("balanced");
  const [dietary, setDietary] = useState<string[]>([]);

  // Loading & Submission State
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState<boolean>(false);
  const [streamStage, setStreamStage] = useState<number>(1);
  const [streamProgress, setStreamProgress] = useState<number>(10);
  const [streamMessage, setStreamMessage] = useState<string>("Initializing trip planner AI...");

  // Generation lifecycle guards (C-03). Refs avoid the one-render window where
  // state has not flushed yet, and keep the abort/attempt identity stable
  // across cancel-then-retry.
  const abortControllerRef = useRef<AbortController | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const navigateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      submittingRef.current = false;
      if (navigateTimerRef.current !== null) {
        window.clearTimeout(navigateTimerRef.current);
        navigateTimerRef.current = null;
      }
    };
  }, []);

  // Restore Draft from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.destination) setDestination(parsed.destination);
        if (parsed.startDate) setStartDate(new Date(parsed.startDate));
        if (parsed.endDate) setEndDate(new Date(parsed.endDate));
        if (parsed.groupType) setGroupType(parsed.groupType);
        if (typeof parsed.adultsCount === "number") setAdultsCount(parsed.adultsCount);
        if (typeof parsed.childrenCount === "number") setChildrenCount(parsed.childrenCount);
        if (typeof parsed.budgetPerPerson === "number") setBudgetPerPerson(parsed.budgetPerPerson);
        if (Array.isArray(parsed.selectedInterests)) setSelectedInterests(parsed.selectedInterests);
        if (parsed.language) setLanguage(parsed.language);
        if (parsed.pace) setPace(parsed.pace);
        if (Array.isArray(parsed.dietary)) setDietary(parsed.dietary);
        // Only announce a draft that actually holds a trip. The save effect
        // writes defaults on first visit, and those should not read as restored.
        if (typeof parsed.destination === "string" && parsed.destination.trim()) {
          setRestoredDraft({
            at: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
          });
        }
      } else {
        // No draft: carry over the group and style choices from the last trip
        // so a repeat traveler never re-enters the same preferences.
        const lastPrefs = localStorage.getItem(LAST_PREFS_KEY);
        if (!lastPrefs) return;
        const parsed = JSON.parse(lastPrefs);
        if (parsed.groupType) setGroupType(parsed.groupType);
        if (typeof parsed.adultsCount === "number") setAdultsCount(parsed.adultsCount);
        if (typeof parsed.childrenCount === "number") setChildrenCount(parsed.childrenCount);
        if (typeof parsed.budgetPerPerson === "number") setBudgetPerPerson(parsed.budgetPerPerson);
        if (Array.isArray(parsed.selectedInterests)) setSelectedInterests(parsed.selectedInterests);
        if (parsed.language) setLanguage(parsed.language);
        if (parsed.pace) setPace(parsed.pace);
        if (Array.isArray(parsed.dietary)) setDietary(parsed.dietary);
      }
    } catch (e) {
      console.warn("Could not load draft from localStorage", e);
    }
  }, []);

  // Save Draft to LocalStorage whenever values change
  useEffect(() => {
    try {
      const draft = {
        savedAt: new Date().toISOString(),
        destination,
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
        groupType,
        adultsCount,
        childrenCount,
        budgetPerPerson,
        selectedInterests,
        language,
        pace,
        dietary,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn("Could not save draft to localStorage", e);
    }
  }, [
    destination,
    startDate,
    endDate,
    groupType,
    adultsCount,
    childrenCount,
    budgetPerPerson,
    selectedInterests,
    language,
    pace,
    dietary,
  ]);

  // Validation Logic per step
  const isStepValid = (stepId: number): boolean => {
    const today = startOfToday();
    switch (stepId) {
      case 1:
        return destination.trim().length > 0;
      case 2:
        return (
          !!startDate &&
          !!endDate &&
          !isBefore(startDate, today) &&
          !isBefore(endDate, startDate) &&
          differenceInCalendarDays(endDate, startDate) >= 0
        );
      case 3:
        return adultsCount >= 1;
      case 4:
        return budgetPerPerson >= 1000;
      case 5:
        return selectedInterests.length > 0;
      case 6:
        return (
          destination.trim().length > 0 &&
          !!startDate &&
          !!endDate &&
          !isBefore(startDate, today) &&
          !isBefore(endDate, startDate) &&
          adultsCount >= 1 &&
          budgetPerPerson >= 1000 &&
          selectedInterests.length > 0
        );
      default:
        return false;
    }
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep <= currentStep) return true;
    for (let i = 1; i < targetStep; i++) {
      if (!isStepValid(i)) return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!isStepValid(currentStep)) return;
    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  };

  const handleStepClick = (stepId: number) => {
    if (canNavigateToStep(stepId)) {
      setCurrentStep(stepId);
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  };

  /**
   * Stops the active stream without consuming the attempt key: a later retry
   * reuses it so the server can replay instead of creating a second trip.
   */
  const stopActiveGeneration = () => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (navigateTimerRef.current !== null) {
      window.clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = null;
    }
  };

  const handleReset = () => {
    stopActiveGeneration();
    attemptIdRef.current = null;
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setDestination("");
    setStartDate(addDays(new Date(), 7));
    setEndDate(addDays(new Date(), 12));
    setGroupType("Couple");
    setAdultsCount(2);
    setChildrenCount(0);
    setBudgetPerPerson(20000);
    setSelectedInterests(["Culture", "Food", "Nature"]);
    setLanguage("en");
    setPace("balanced");
    setDietary([]);
    setCurrentStep(1);
    setRestoredDraft(null);
  };

  // Interests Handlers
  const handleToggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const handleSelectAllInterests = () => {
    setSelectedInterests(ALL_STYLES);
  };

  const handleClearAllInterests = () => {
    setSelectedInterests([]);
  };

  const handleToggleDietary = (item: string) => {
    setDietary((prev) =>
      prev.includes(item) ? prev.filter((d) => d !== item) : [...prev, item]
    );
  };

  const handleCancelOverlay = () => {
    stopActiveGeneration();
    setError(null);
    setIsOverlayOpen(false);
    setLoading(false);
  };

  const handleRetryOverlay = () => {
    handleSubmitItinerary();
  };

  // A rough duration picked on the Where step writes the real dates here,
  // using the same base-start rule as the quick presets on the When step.
  const handleSelectDuration = (days: number) => {
    const today = startOfToday();
    const baseStart = startDate && !isBefore(startDate, today) ? startDate : today;
    setStartDate(baseStart);
    setEndDate(addDays(baseStart, days - 1));
  };

  const durationDays =
    startDate && endDate && !isBefore(endDate, startDate)
      ? differenceInCalendarDays(endDate, startDate) + 1
      : 0;

  // Final Itinerary Generation Submission with Real-time AI Streaming
  const handleSubmitItinerary = async () => {
    // Synchronous guard: two clicks before React flushes `loading` must not
    // start two streams (and therefore two trips).
    if (submittingRef.current || loading) return;

    if (!isStepValid(6)) {
      setError("Please complete all required fields before generating.");
      return;
    }

    submittingRef.current = true;
    cancelledRef.current = false;

    // Reuse the key after a cancel/error so retry cannot duplicate a trip.
    const attemptId = attemptIdRef.current ?? createAttemptId();
    attemptIdRef.current = attemptId;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isCurrentAttempt = () =>
      mountedRef.current && !cancelledRef.current && !controller.signal.aborted;

    setLoading(true);
    setError(null);
    setStreamStage(1);
    setStreamProgress(15);
    setStreamMessage(`Analyzing destination climate and seasonal advisory for ${destination.trim()}...`);
    setIsOverlayOpen(true);

    try {
      const days = differenceInCalendarDays(endDate!, startDate!) + 1;

      const payload = {
        destination: destination.trim(),
        days,
        startdate: format(startDate!, "yyyy-MM-dd"),
        enddate: format(endDate!, "yyyy-MM-dd"),
        budget: budgetPerPerson,
        interests: selectedInterests,
        groupType,
        language,
        preferences: {
          pace,
          ...(dietary.length ? { dietary } : {}),
        },
        ...(agencyId ? { agencyId } : {}),
      };

      await api.generateItineraryStream(
        payload,
        {
          onProgress: (evt) => {
            if (!isCurrentAttempt()) return;
            setStreamStage(evt.stage);
            setStreamProgress(evt.progress);
            setStreamMessage(evt.message);
          },
          onComplete: (trip) => {
            if (!isCurrentAttempt()) return;
            // This attempt produced (or replayed) its trip; the next submit is
            // a new logical attempt with a new key.
            attemptIdRef.current = null;
            setStreamProgress(100);
            setStreamMessage("Your personalized itinerary is ready!");
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            try {
              localStorage.setItem(
                LAST_PREFS_KEY,
                JSON.stringify({
                  groupType,
                  adultsCount,
                  childrenCount,
                  budgetPerPerson,
                  selectedInterests,
                  language,
                  pace,
                  dietary,
                })
              );
            } catch (e) {
              console.warn("Could not save trip preferences", e);
            }
            navigateTimerRef.current = window.setTimeout(() => {
              navigateTimerRef.current = null;
              // Back/unmount between "ready" and the hand-off must not navigate.
              if (!mountedRef.current || cancelledRef.current) return;
              setIsOverlayOpen(false);
              setLoading(false);
              // Hand off the exact document id as well as the payload. The old
              // title match could open a *different* trip with the same title.
              navigate(
                agencyId ? `/agency/trips/${trip._id}` : "/dashboard",
                { state: { itinerary: trip.tripDetails, tripId: trip._id } }
              );
            }, 800);
          },
          onError: (errMessage) => {
            if (!isCurrentAttempt()) return;
            setError(errMessage);
            setLoading(false);
          },
        },
        { signal: controller.signal, attemptId }
      );
    } catch (err: unknown) {
      if (!isCurrentAttempt()) return;
      console.error("Error generating trip itinerary:", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to generate itinerary. Please check your connection."
      );
      setLoading(false);
    } finally {
      submittingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const currentHeading = STEP_HEADLINES[currentStep - 1];
  const currentStepMeta = WIZARD_STEPS[currentStep - 1];
  const stepValid = isStepValid(currentStep);
  const stepHint = (() => {
    if (stepValid) return null;
    switch (currentStep) {
      case 1:
        return "Add a destination to continue.";
      case 2:
        if (!startDate || !endDate) return "Choose a start and end date to continue.";
        if (isBefore(startDate, startOfToday())) {
          return "Choose a start date from today onward. Past dates cannot generate a trip.";
        }
        return "The end date must be on or after the start date.";
      case 3:
        return "Add at least one adult traveller.";
      case 4:
        return "Set a budget per person of at least 1,000.";
      case 5:
        return "Pick at least one travel style.";
      default:
        return "Complete the earlier steps before generating the plan.";
    }
  })();

  return (
    <div
      className={
        embedded
          ? "flex flex-col"
          : "min-h-screen bg-gradient-hero flex flex-col"
      }
    >
      {!embedded && <Navbar />}

      <main
        id="main-content"
        tabIndex={-1}
        className={
          embedded
            ? "mx-auto w-full max-w-3xl flex-1 px-0 pb-10 pt-2"
            : "container mx-auto max-w-3xl flex-1 px-4 pb-16 pt-24"
        }
      >
        {/* Page Header */}
        <header className="text-center">
          <p className="text-xs font-semibold tracking-wide text-primary">
            {isAgencyMode ? "Agency trip planner" : "Plan a trip"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {isAgencyMode ? currentHeading.agency : currentHeading.personal}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {isAgencyMode
              ? `Generate a working draft for ${
                  agencyName || "your agency"
                }, then refine it with your team and invite the client.`
              : "One message is enough — you can change every detail later."}
          </p>
        </header>

        {restoredDraft ? (
          <div
            role="status"
            className="mt-6 flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 px-4 py-3 text-left"
          >
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-info-ink">
              We restored the trip you started
              {restoredDraft.at
                ? (() => {
                    const at = new Date(restoredDraft.at);
                    return Number.isNaN(at.getTime())
                      ? " earlier"
                      : ` on ${format(at, "d MMM yyyy")}`;
                  })()
                : " earlier"}
              . Check the dates before generating — past dates need updating.
            </p>
            <button
              type="button"
              onClick={() => setRestoredDraft(null)}
              aria-label="Dismiss restored draft notice"
              className="rounded-md p-1 text-info-ink transition-colors hover:bg-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true" className="block text-sm leading-none">
                ×
              </span>
            </button>
          </div>
        ) : null}

        {/* Six-step rail */}
        <div className="mt-8 sm:mt-10">
          <WizardProgress
            steps={WIZARD_STEPS}
            currentStep={currentStep}
            onStepClick={handleStepClick}
            canNavigateToStep={canNavigateToStep}
          />
        </div>

        {/* The step card */}
        <Card className="mt-6 rounded-3xl border border-border/70 bg-card shadow-card">
          <CardContent className="p-5 sm:p-8">
            <div className="relative min-h-[300px]">
              <div
                key={currentStep}
                className="animate-fade-in transition-all duration-300"
              >
                {currentStep === 1 && (
                  <StepWhere
                    destination={destination}
                    onChange={setDestination}
                    onEnterNext={handleNext}
                    durationDays={durationDays}
                    onSelectDuration={handleSelectDuration}
                  />
                )}

                {currentStep === 2 && (
                  <StepWhen
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                )}

                {currentStep === 3 && (
                  <StepWho
                    groupType={groupType}
                    adultsCount={adultsCount}
                    childrenCount={childrenCount}
                    onGroupTypeChange={setGroupType}
                    onAdultsChange={setAdultsCount}
                    onChildrenChange={setChildrenCount}
                  />
                )}

                {currentStep === 4 && (
                  <StepBudget
                    budgetPerPerson={budgetPerPerson}
                    totalTravelers={adultsCount + childrenCount}
                    onChange={setBudgetPerPerson}
                  />
                )}

                {currentStep === 5 && (
                  <StepStyle
                    selectedInterests={selectedInterests}
                    onToggleInterest={handleToggleInterest}
                    onSelectAll={handleSelectAllInterests}
                    onClearAll={handleClearAllInterests}
                    language={language}
                    onLanguageChange={setLanguage}
                    pace={pace}
                    onPaceChange={setPace}
                    dietary={dietary}
                    onToggleDietary={handleToggleDietary}
                  />
                )}

                {currentStep === 6 && (
                  <StepReview
                    destination={destination}
                    startDate={startDate}
                    endDate={endDate}
                    groupType={groupType}
                    adultsCount={adultsCount}
                    childrenCount={childrenCount}
                    budgetPerPerson={budgetPerPerson}
                    interests={selectedInterests}
                    language={language}
                    pace={pace}
                    dietary={dietary}
                    loading={loading}
                    error={error}
                    onEditStep={handleStepClick}
                    onSubmit={handleSubmitItinerary}
                  />
                )}
              </div>
            </div>

            {/* AI promise, shown alongside every editable step */}
            {currentStep < WIZARD_STEPS.length && (
              <div className="mt-7 flex items-center gap-2 text-xs font-semibold text-accent-ink">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>AI will draft a day-by-day plan you can edit.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wizard Footer */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <p className="text-xs font-medium text-muted-foreground">
              Step {currentStep} of {WIZARD_STEPS.length}
              <span aria-hidden="true"> · </span>
              {currentStepMeta.shortTitle}
            </p>
            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="h-11 rounded-xl border-border/80 bg-card px-4 text-xs font-semibold gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>

            {currentStep < WIZARD_STEPS.length ? (
              <Button
                type="button"
                variant="hero"
                disabled={!stepValid}
                aria-describedby={stepHint ? "wizard-step-hint" : undefined}
                onClick={handleNext}
                className="h-11 rounded-xl px-5 text-xs font-bold gap-1.5 shadow-soft"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResetOpen(true)}
                className="h-11 rounded-xl px-4 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Start over</span>
              </Button>
            )}
          </div>
        </div>

        {stepHint ? (
          <p
            id="wizard-step-hint"
            role="status"
            className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground sm:justify-end sm:text-right"
          >
            <span aria-hidden="true">•</span>
            <span>{stepHint}</span>
          </p>
        ) : null}

        {/* Live AI Generation Streaming Overlay */}
        <GenerationOverlay
          isOpen={isOverlayOpen}
          destination={destination || "your destination"}
          days={
            startDate && endDate
              ? differenceInCalendarDays(endDate, startDate) + 1
              : 5
          }
          stage={streamStage}
          progress={streamProgress}
          statusMessage={streamMessage}
          error={error}
          onRetry={handleRetryOverlay}
          onCancel={handleCancelOverlay}
        />

        <ConfirmDestructive
          open={resetOpen}
          onOpenChange={setResetOpen}
          tone="warning"
          icon={RotateCcw}
          title="Start over?"
          description="Everything you've entered so far will be cleared. Trips you already generated are saved and won't be affected."
          confirmLabel="Clear and restart"
          cancelLabel="Keep my answers"
          onConfirm={handleReset}
        />
      </main>
    </div>
  );
};

export default TripPlanner;
