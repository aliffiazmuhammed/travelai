import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInCalendarDays, isBefore, addDays } from "date-fns";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { WizardProgress, WizardStep } from "@/components/wizard/WizardProgress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    switch (stepId) {
      case 1:
        return destination.trim().length > 0;
      case 2:
        return (
          !!startDate &&
          !!endDate &&
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

  const handleReset = () => {
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
    setIsOverlayOpen(false);
    setLoading(false);
  };

  const handleRetryOverlay = () => {
    handleSubmitItinerary();
  };

  // Final Itinerary Generation Submission with Real-time AI Streaming
  const handleSubmitItinerary = async () => {
    if (!isStepValid(6)) {
      setError("Please complete all required fields before generating.");
      return;
    }

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

      await api.generateItineraryStream(payload, {
        onProgress: (evt) => {
          setStreamStage(evt.stage);
          setStreamProgress(evt.progress);
          setStreamMessage(evt.message);
        },
        onComplete: (trip) => {
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
          setTimeout(() => {
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
          setError(errMessage);
          setLoading(false);
        },
      });
    } catch (err: any) {
      console.error("Error generating trip itinerary:", err);
      setError(err.message || "Failed to generate itinerary. Please check your connection.");
      setLoading(false);
    }
  };

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
        className={
          embedded
            ? "flex-1 w-full max-w-4xl mx-auto px-0 pt-2 pb-10"
            : "flex-1 container mx-auto px-4 pt-24 pb-20 max-w-4xl"
        }
      >
        {/* Header Title */}
        <div className="text-center space-y-3 mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-full px-4 sm:px-5 py-1.5 shadow-2xs">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-primary tracking-wide">
              {isAgencyMode ? "Agency trip planner" : "Smart trip planner"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-foreground tracking-tight px-1">
            {isAgencyMode ? "Plan a client trip" : "Design Your Next Adventure"}
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-xl mx-auto px-2">
            {isAgencyMode
              ? `Generate a working draft for ${
                  agencyName || "your agency"
                }, then refine it with your team and invite the client.`
              : "Answer a few quick questions and get a day-by-day plan you can actually follow."}
          </p>
        </div>

        {/* Wizard Card Container */}
        <Card className="border border-border/70 shadow-card bg-card/80 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardContent className="p-4 sm:p-8 md:p-10">
            {/* Top Step Progress Bar */}
            <WizardProgress
              steps={WIZARD_STEPS}
              currentStep={currentStep}
              onStepClick={handleStepClick}
              canNavigateToStep={canNavigateToStep}
            />

            {/* Step Body with Smooth CSS Transition */}
            <div className="relative min-h-[380px] overflow-hidden py-2">
              <div
                key={currentStep}
                className="animate-fade-in transition-all duration-300"
              >
                {currentStep === 1 && (
                  <StepWhere
                    destination={destination}
                    onChange={setDestination}
                    onEnterNext={handleNext}
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

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between pt-8 mt-6 border-t border-border/60">
              <div className="flex items-center gap-2">
                {currentStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="rounded-xl px-4 h-11 text-xs font-semibold gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setResetOpen(true)}
                    className="rounded-xl text-xs text-muted-foreground hover:text-foreground gap-1.5 h-11 px-3"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </Button>
                )}
              </div>

              <div className="text-xs font-semibold text-muted-foreground">
                Step {currentStep} of {WIZARD_STEPS.length}
              </div>

              <div>
                {currentStep < WIZARD_STEPS.length ? (
                  <Button
                    type="button"
                    variant="hero"
                    disabled={!isStepValid(currentStep)}
                    onClick={handleNext}
                    className="rounded-xl px-5 h-11 text-xs font-bold gap-1.5 shadow-sm"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setResetOpen(true)}
                    className="rounded-xl text-xs text-muted-foreground hover:text-foreground gap-1.5 h-11 px-3"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Start Over</span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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

        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-bold">
                Start over?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed">
                Everything you've entered so far will be cleared. Trips you
                already generated are saved and won't be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
                Keep my answers
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl text-xs font-bold h-10"
                onClick={handleReset}
              >
                Clear and restart
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default TripPlanner;
