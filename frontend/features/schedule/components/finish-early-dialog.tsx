"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Clock, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { StudySession } from "@/lib/types";
import { parseBackendDateTime } from "@/lib/utils";

interface FinishEarlyDialogProps {
  session: StudySession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinishEarly: (sessionId: number, endTime: string, markAs: "partial" | "completed") => Promise<void>;
  onOpenFullReschedule?: () => void;
}

export function FinishEarlyDialog({
  session,
  open,
  onOpenChange,
  onFinishEarly,
  onOpenFullReschedule,
}: Readonly<FinishEarlyDialogProps>) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<"partial" | "completed" | null>(null);

  // Calculate times
  const plannedStart = parseBackendDateTime(session.start_time);
  const plannedEnd = parseBackendDateTime(session.end_time);
  const now = new Date();
  const plannedDuration = plannedEnd.getTime() - plannedStart.getTime();
  const timeWorked = now.getTime() - plannedStart.getTime();
  const minutesWorked = Math.round(timeWorked / (1000 * 60));
  const minutesRemaining = Math.max(0, Math.round((plannedEnd.getTime() - now.getTime()) / (1000 * 60)));
  const plannedMinutes = Math.round(plannedDuration / (1000 * 60));

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
    setSelectedOption(markAs);
    
    try {
      await onFinishEarly(
        session.id,
        now.toISOString(),
        markAs
      );
      
      toast({
        title: "Session ended early",
        description: markAs === "completed" 
          ? `Marked as completed after ${minutesWorked} minutes (${minutesRemaining} min remaining)`
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

  const taskName = session.focus || "this session";
  const isBeforeStart = now < plannedStart;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Finish Session Early
          </DialogTitle>
          <DialogDescription>
            You've worked {minutesWorked} minutes of {plannedMinutes} minutes for <span className="font-medium">{taskName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Current Status */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Time Summary</p>
                <p className="text-xs text-muted-foreground">
                  Worked: {minutesWorked} min • Remaining: {minutesRemaining} min
                </p>
                <p className="text-xs text-muted-foreground">
                  Original: {format(plannedStart, "h:mm a")} – {format(plannedEnd, "h:mm a")} ({plannedMinutes} min)
                </p>
              </div>
            </div>
          </div>

          {isBeforeStart ? (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm text-red-800 mb-2">
                The session hasn't started yet.
              </p>
              <p className="text-xs text-red-700">
                Use the full reschedule option to change the session time.
              </p>
            </div>
          ) : (
            <>
              {/* Option 1: Mark as Completed */}
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Mark as Completed
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Finished the work in less time than planned ({minutesWorked} min)
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span>{format(plannedStart, "h:mm a")}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{format(now, "h:mm a")}</span>
                      <span className="text-muted-foreground">({minutesWorked} min)</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="default"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => handleFinishEarly("completed")}
                  disabled={isSubmitting}
                >
                  {isSubmitting && selectedOption === "completed" ? "Updating..." : "Mark Completed"}
                </Button>
                <p className="text-xs text-green-700 font-medium">
                  ✓ Task progress will be updated
                </p>
              </div>

              {/* Option 2: Mark as Partial */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Mark as Partial
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Did some work ({minutesWorked} min) but need to finish later ({minutesRemaining} min remaining)
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span>{format(plannedStart, "h:mm a")}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{format(now, "h:mm a")}</span>
                      <span className="text-muted-foreground">({minutesWorked} min worked)</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={() => handleFinishEarly("partial")}
                  disabled={isSubmitting}
                >
                  {isSubmitting && selectedOption === "partial" ? "Updating..." : "Mark Partial"}
                </Button>
                <p className="text-xs text-amber-700 font-medium">
                  ✓ Task progress will be updated • Remaining work will be rescheduled
                </p>
              </div>
            </>
          )}

          {/* Custom Option */}
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                onOpenFullReschedule?.();
              }}
              disabled={isSubmitting}
            >
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

