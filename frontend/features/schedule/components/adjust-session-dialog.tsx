"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Clock, AlertCircle, ArrowRight, CheckCircle2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { StudySession } from "@/lib/types";
import { parseBackendDateTime, formatForDateTimeLocal } from "@/lib/utils";

interface AdjustSessionDialogProps {
  readonly session: StudySession;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdjust: (sessionId: number, startTime: string, endTime: string) => Promise<void>;
  readonly onFinishEarly: (sessionId: number, endTime: string, markAs: "partial" | "completed") => Promise<void>;
  readonly onFullReschedule: (sessionId: number, startTime: string, endTime: string) => Promise<void>;
}

type SessionContext = "before_start" | "in_progress" | "after_end" | "future";

interface BeforeStartOptionsProps {
  readonly plannedMinutes: number;
  readonly now: Date;
  readonly plannedEnd: Date;
  readonly extendEndTime: Date;
  readonly isSubmitting: boolean;
  readonly selectedOption: string | null;
  readonly onQuickAdjust: (option: string) => void;
}

function BeforeStartOptions(props: BeforeStartOptionsProps) {
  const { plannedMinutes, now, plannedEnd, extendEndTime, isSubmitting, selectedOption, onQuickAdjust } = props;
  return (
    <>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Extend to maintain duration</p>
            <p className="text-xs text-muted-foreground mb-2">
              Start now and extend end time to keep the full {plannedMinutes} minutes
            </p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(now, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(extendEndTime, "h:mm a")}</span>
              <span className="text-muted-foreground">({plannedMinutes} min)</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={() => onQuickAdjust("start_early_extend")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "start_early_extend" ? "Adjusting..." : "Extend Duration"}
        </Button>
        <p className="text-xs text-muted-foreground">⚠️ May conflict with next session</p>
      </div>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Keep planned end time</p>
            <p className="text-xs text-muted-foreground mb-2">Start now, keep original end time (longer session)</p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(now, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(plannedEnd, "h:mm a")}</span>
              <span className="text-muted-foreground">({Math.round((plannedEnd.getTime() - now.getTime()) / (1000 * 60))} min)</span>
            </div>
          </div>
        </div>
        <Button variant="default" className="w-full" onClick={() => onQuickAdjust("start_early_keep_end")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "start_early_keep_end" ? "Adjusting..." : "Keep End Time"}
        </Button>
        <p className="text-xs text-green-600 font-medium">✓ Safe option - no conflicts</p>
      </div>
    </>
  );
}

interface InProgressOptionsProps {
  readonly plannedMinutes: number;
  readonly now: Date;
  readonly plannedStart: Date;
  readonly extendEndTimeLate: Date;
  readonly remainingEndTime: Date;
  readonly minutesRemaining: number;
  readonly minutesWorked: number;
  readonly isSubmitting: boolean;
  readonly selectedOption: string | null;
  readonly onQuickAdjust: (option: string) => void;
  readonly onFinishEarly: (markAs: "partial" | "completed") => void;
}

function InProgressOptions(props: InProgressOptionsProps) {
  const { plannedMinutes, now, plannedStart, extendEndTimeLate, remainingEndTime, minutesRemaining, minutesWorked, isSubmitting, selectedOption, onQuickAdjust, onFinishEarly } = props;
  return (
    <>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Extend to maintain duration</p>
            <p className="text-xs text-muted-foreground mb-2">Start now and extend end time to keep the full {plannedMinutes} minutes</p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(now, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(extendEndTimeLate, "h:mm a")}</span>
              <span className="text-muted-foreground">({plannedMinutes} min)</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={() => onQuickAdjust("late_start_extend")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "late_start_extend" ? "Adjusting..." : "Extend Duration"}
        </Button>
        <p className="text-xs text-muted-foreground">⚠️ May conflict with next session</p>
      </div>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Use remaining time</p>
            <p className="text-xs text-muted-foreground mb-2">Start now and use the remaining {minutesRemaining} minutes until original end time</p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(now, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(remainingEndTime, "h:mm a")}</span>
              <span className="text-muted-foreground">({minutesRemaining} min)</span>
            </div>
          </div>
        </div>
        <Button variant="default" className="w-full" onClick={() => onQuickAdjust("late_start_remaining")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "late_start_remaining" ? "Adjusting..." : "Use Remaining Time"}
        </Button>
        <p className="text-xs text-green-600 font-medium">✓ No conflicts - safe option</p>
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Finish now - Mark as Completed
            </p>
            <p className="text-xs text-muted-foreground mb-2">Finished the work in less time than planned ({minutesWorked} min)</p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(plannedStart, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(now, "h:mm a")}</span>
              <span className="text-muted-foreground">({minutesWorked} min)</span>
            </div>
          </div>
        </div>
        <Button variant="default" className="w-full bg-green-600 hover:bg-green-700" onClick={() => onFinishEarly("completed")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "finish_completed" ? "Updating..." : "Mark Completed"}
        </Button>
        <p className="text-xs text-green-700 font-medium">✓ Task progress will be updated</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Finish now - Mark as Partial</p>
            <p className="text-xs text-muted-foreground mb-2">Did some work ({minutesWorked} min) but need to finish later ({minutesRemaining} min remaining)</p>
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>{format(plannedStart, "h:mm a")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(now, "h:mm a")}</span>
              <span className="text-muted-foreground">({minutesWorked} min worked)</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => onFinishEarly("partial")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "finish_partial" ? "Updating..." : "Mark Partial"}
        </Button>
        <p className="text-xs text-amber-700 font-medium">✓ Task progress will be updated • Remaining work will be rescheduled</p>
      </div>
    </>
  );
}

interface AfterEndOptionsProps {
  readonly minutesWorked: number;
  readonly plannedMinutes: number;
  readonly isSubmitting: boolean;
  readonly selectedOption: string | null;
  readonly onFinishEarly: (markAs: "partial" | "completed") => void;
}

function AfterEndOptions(props: AfterEndOptionsProps) {
  const { minutesWorked, plannedMinutes, isSubmitting, selectedOption, onFinishEarly } = props;
  return (
    <>
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Mark as Completed
            </p>
            <p className="text-xs text-muted-foreground mb-2">You worked {minutesWorked} minutes (original plan was {plannedMinutes} min)</p>
          </div>
        </div>
        <Button variant="default" className="w-full bg-green-600 hover:bg-green-700" onClick={() => onFinishEarly("completed")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "finish_completed" ? "Updating..." : "Mark Completed"}
        </Button>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Mark as Partial</p>
            <p className="text-xs text-muted-foreground mb-2">You did some work ({minutesWorked} min) but didn't complete the full session</p>
          </div>
        </div>
        <Button variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => onFinishEarly("partial")} disabled={isSubmitting}>
          {isSubmitting && selectedOption === "finish_partial" ? "Updating..." : "Mark Partial"}
        </Button>
      </div>
    </>
  );
}

function FutureOptions() {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground mb-4">This session is in the future. Use the full reschedule option to change its time.</p>
    </div>
  );
}

export function AdjustSessionDialog({
  session,
  open,
  onOpenChange,
  onAdjust,
  onFinishEarly,
  onFullReschedule,
}: Readonly<AdjustSessionDialogProps>) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFullReschedule, setShowFullReschedule] = useState(false);
  const [customStartTime, setCustomStartTime] = useState("");
  const [customEndTime, setCustomEndTime] = useState("");

  // Calculate times - memoize to prevent unnecessary re-renders
  // Backend sends UTC times (with 'Z' or timezone info), parseBackendDateTime handles conversion
  // When displayed, browser automatically shows in user's local timezone
  const plannedStart = useMemo(() => parseBackendDateTime(session.start_time), [session.start_time]);
  const plannedEnd = useMemo(() => parseBackendDateTime(session.end_time), [session.end_time]);
  // Use useState to ensure 'now' updates when dialog is open (for accurate context detection)
  // Note: Date comparisons are timezone-independent (compare milliseconds since epoch)
  // plannedStart/plannedEnd are UTC times, now is current time - comparison works correctly
  const [now] = useState(() => new Date());
  const plannedDuration = plannedEnd.getTime() - plannedStart.getTime();
  const plannedMinutes = Math.round(plannedDuration / (1000 * 60));

  // Detect context
  // All Date objects represent absolute moments in time, so comparisons are timezone-independent
  const detectContext = (): SessionContext => {
    if (now < plannedStart) return "before_start";
    if (now >= plannedStart && now < plannedEnd) return "in_progress";
    if (now >= plannedEnd && session.status === "planned") return "after_end";
    return "future";
  };

  const context = detectContext();

  // Helper functions to get context-based styles
  const getStatusBorderClass = (ctx: SessionContext) => {
    if (ctx === "before_start") return "border-blue-200 bg-blue-50/50";
    if (ctx === "in_progress") return "border-amber-200 bg-amber-50/50";
    if (ctx === "after_end") return "border-red-200 bg-red-50/50";
    return "border-gray-200 bg-gray-50/50";
  };

  const getStatusIconClass = (ctx: SessionContext) => {
    if (ctx === "before_start") return "text-blue-600";
    if (ctx === "in_progress") return "text-amber-600";
    if (ctx === "after_end") return "text-red-600";
    return "text-gray-600";
  };

  // Use shared utility for consistent datetime-local formatting
  const formatForInput = formatForDateTimeLocal;

  // Initialize custom times when opening full reschedule
  // Only run when showFullReschedule changes, not on every render
  useEffect(() => {
    if (showFullReschedule) {
      // Parse backend times (handles UTC properly) and format for datetime-local input
      const start = parseBackendDateTime(session.start_time);
      const end = parseBackendDateTime(session.end_time);
      setCustomStartTime(formatForInput(start));
      setCustomEndTime(formatForInput(end));
    } else {
      // Reset when closing full reschedule
      setCustomStartTime("");
      setCustomEndTime("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullReschedule]);

  const taskName = session.focus || "this session";

  // Context-specific calculations
  const minutesEarly = context === "before_start" 
    ? Math.round((plannedStart.getTime() - now.getTime()) / (1000 * 60))
    : 0;
  const minutesLate = context === "in_progress"
    ? Math.round((now.getTime() - plannedStart.getTime()) / (1000 * 60))
    : 0;
  const minutesWorked = context === "in_progress" || context === "after_end"
    ? Math.round((now.getTime() - plannedStart.getTime()) / (1000 * 60))
    : 0;
  const minutesRemaining = context === "in_progress"
    ? Math.max(0, Math.round((plannedEnd.getTime() - now.getTime()) / (1000 * 60)))
    : 0;

  // Options for "before_start" (starting early)
  const extendEndTime = new Date(now.getTime() + plannedDuration);
  const shiftEndTime = new Date(now.getTime() + plannedDuration);

  // Options for "in_progress" (started late or finishing early)
  const extendEndTimeLate = new Date(now.getTime() + plannedDuration);
  const remainingEndTime = plannedEnd;

  const handleQuickAdjust = async (option: string) => {
    setIsSubmitting(true);
    setSelectedOption(option);

    try {
      let newStart: Date;
      let newEnd: Date;

      switch (option) {
        case "start_early_extend":
          // Start now, extend end to maintain duration
          newStart = now;
          newEnd = extendEndTime;
          await onAdjust(session.id, newStart.toISOString(), newEnd.toISOString());
          toast({
            title: "Session adjusted",
            description: `Started early, extended to ${format(newEnd, "h:mm a")} to maintain ${plannedMinutes} minutes`,
          });
          break;

        case "start_early_shift":
          // Start now, end early (shift entire session)
          newStart = now;
          newEnd = shiftEndTime;
          await onAdjust(session.id, newStart.toISOString(), newEnd.toISOString());
          toast({
            title: "Session adjusted",
            description: `Shifted to ${format(newStart, "h:mm a")} - ${format(newEnd, "h:mm a")}`,
          });
          break;

        case "start_early_keep_end":
          // Start now, keep original end time
          newStart = now;
          newEnd = plannedEnd;
          await onAdjust(session.id, newStart.toISOString(), newEnd.toISOString());
          toast({
            title: "Session adjusted",
            description: `Started early, keeping end time at ${format(newEnd, "h:mm a")}`,
          });
          break;

        case "late_start_extend":
          // Start now, extend end to maintain duration
          newStart = now;
          newEnd = extendEndTimeLate;
          await onAdjust(session.id, newStart.toISOString(), newEnd.toISOString());
          toast({
            title: "Session adjusted",
            description: `Extended to ${format(newEnd, "h:mm a")} to maintain ${plannedMinutes} minutes`,
          });
          break;

        case "late_start_remaining":
          // Start now, use remaining time
          newStart = now;
          newEnd = remainingEndTime;
          await onAdjust(session.id, newStart.toISOString(), newEnd.toISOString());
          toast({
            title: "Session adjusted",
            description: `Using remaining ${Math.round((newEnd.getTime() - newStart.getTime()) / (1000 * 60))} minutes`,
          });
          break;

        default:
          throw new Error("Unknown option");
      }

      onOpenChange(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to adjust session";
      toast({
        variant: "destructive",
        title: "Adjustment failed",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  };

  const handleFinishEarly = async (markAs: "partial" | "completed") => {
    if (now <= plannedStart) {
      toast({
        variant: "destructive",
        title: "Invalid time",
        description: "You can't finish before the session starts.",
      });
      return;
    }

    setIsSubmitting(true);
    setSelectedOption(`finish_${markAs}`);

    try {
      await onFinishEarly(session.id, now.toISOString(), markAs);
      toast({
        title: "Session ended early",
        description: markAs === "completed"
          ? `Marked as completed after ${minutesWorked} minutes`
          : `Marked as partial - ${minutesWorked} minutes worked, ${minutesRemaining} min remaining`,
      });
      onOpenChange(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to end session early";
      toast({
        variant: "destructive",
        title: "Failed",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  };

  const handleFullReschedule = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customStartTime || !customEndTime) {
      toast({
        variant: "destructive",
        title: "Invalid time",
        description: "Please provide both start and end times.",
      });
      return;
    }

    // datetime-local input gives local time string (e.g., "2025-12-08T19:45")
    // new Date() interprets it as local time, toISOString() converts to UTC
    // This is correct: user enters 7:45 PM local → stored as UTC → displayed as 7:45 PM local
    const startDateLocal = new Date(customStartTime);
    const endDateLocal = new Date(customEndTime);

    if (startDateLocal >= endDateLocal) {
      toast({
        variant: "destructive",
        title: "Invalid time",
        description: "Start time must be before end time.",
      });
      return;
    }

    // Validate minimum duration (at least 5 minutes)
    const durationMinutes = Math.round((endDateLocal.getTime() - startDateLocal.getTime()) / (1000 * 60));
    if (durationMinutes < 5) {
      toast({
        variant: "destructive",
        title: "Invalid duration",
        description: "Session must be at least 5 minutes long.",
      });
      return;
    }

    // Validate maximum duration (max 8 hours)
    if (durationMinutes > 480) {
      toast({
        variant: "destructive",
        title: "Invalid duration",
        description: "Session cannot be longer than 8 hours.",
      });
      return;
    }

    // Convert local time to UTC ISO string for backend
    const startDate = startDateLocal;
    const endDate = endDateLocal;

    setIsSubmitting(true);
    setSelectedOption("full_reschedule");

    try {
      await onFullReschedule(
        session.id,
        startDate.toISOString(),
        endDate.toISOString()
      );
      toast({
        title: "Session rescheduled",
        description: `Moved to ${format(startDate, "MMM d, h:mm a")} - ${format(endDate, "h:mm a")}`,
      });
      onOpenChange(false);
      setShowFullReschedule(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to reschedule session";
      toast({
        variant: "destructive",
        title: "Reschedule failed",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  };

  // Render full reschedule form
  if (showFullReschedule) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Reschedule Session
            </DialogTitle>
            <DialogDescription>
              Change the time for <span className="font-medium">{taskName}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFullReschedule} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Start Time
              </Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Current: {format(plannedStart, "MMM d, h:mm a")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                End Time
              </Label>
              <Input
                id="end-time"
                type="datetime-local"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Current: {format(plannedEnd, "MMM d, h:mm a")} ({plannedMinutes} min)
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                If this time conflicts with another session, you'll be notified and the change won't be saved.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowFullReschedule(false);
                  setCustomStartTime("");
                  setCustomEndTime("");
                }}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Rescheduling..." : "Reschedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Render context-specific options
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {context === "before_start" && "Starting Early?"}
            {context === "in_progress" && "Adjust Session"}
            {context === "after_end" && "Record Session"}
            {context === "future" && "Reschedule Session"}
          </DialogTitle>
          <DialogDescription>
            {context === "before_start" && (
              <>You're {minutesEarly} minutes early for <span className="font-medium">{taskName}</span></>
            )}
            {context === "in_progress" && (
              <>You're {minutesLate} minutes late for <span className="font-medium">{taskName}</span></>
            )}
            {context === "after_end" && (
              <>The session time has passed for <span className="font-medium">{taskName}</span></>
            )}
            {context === "future" && (
              <>Change the time for <span className="font-medium">{taskName}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Status */}
          <div className={`rounded-lg border p-3 ${getStatusBorderClass(context)}`}>
            <div className="flex items-start gap-2">
              <AlertCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getStatusIconClass(context)}`} />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Original Schedule</p>
                <p className="text-xs text-muted-foreground">
                  {format(plannedStart, "h:mm a")} – {format(plannedEnd, "h:mm a")} ({plannedMinutes} min)
                </p>
              </div>
            </div>
          </div>

          {context === "before_start" && (
            <BeforeStartOptions
              plannedMinutes={plannedMinutes}
              now={now}
              plannedEnd={plannedEnd}
              extendEndTime={extendEndTime}
              isSubmitting={isSubmitting}
              selectedOption={selectedOption}
              onQuickAdjust={handleQuickAdjust}
            />
          )}
          {context === "in_progress" && (
            <InProgressOptions
              plannedMinutes={plannedMinutes}
              now={now}
              plannedStart={plannedStart}
              extendEndTimeLate={extendEndTimeLate}
              remainingEndTime={remainingEndTime}
              minutesRemaining={minutesRemaining}
              minutesWorked={minutesWorked}
              isSubmitting={isSubmitting}
              selectedOption={selectedOption}
              onQuickAdjust={handleQuickAdjust}
              onFinishEarly={handleFinishEarly}
            />
          )}
          {context === "after_end" && (
            <AfterEndOptions
              minutesWorked={minutesWorked}
              plannedMinutes={plannedMinutes}
              isSubmitting={isSubmitting}
              selectedOption={selectedOption}
              onFinishEarly={handleFinishEarly}
            />
          )}
          {context === "future" && <FutureOptions />}

          {/* Full Reschedule Option (available for all contexts) */}
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowFullReschedule(true)}
              disabled={isSubmitting}
            >
              <CalendarClock className="h-4 w-4 mr-2" />
              Custom adjustment (full reschedule)
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

