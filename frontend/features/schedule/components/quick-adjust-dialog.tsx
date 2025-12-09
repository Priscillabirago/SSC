"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Clock, AlertCircle, ArrowRight } from "lucide-react";
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

interface QuickAdjustDialogProps {
  session: StudySession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjust: (sessionId: number, startTime: string, endTime: string) => Promise<void>;
  onOpenFullReschedule?: () => void;
}

export function QuickAdjustDialog({
  session,
  open,
  onOpenChange,
  onAdjust,
  onOpenFullReschedule,
}: Readonly<QuickAdjustDialogProps>) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<"extend" | "remaining" | null>(null);

  // Calculate times
  const plannedStart = parseBackendDateTime(session.start_time);
  const plannedEnd = parseBackendDateTime(session.end_time);
  const now = new Date();
  const plannedDuration = plannedEnd.getTime() - plannedStart.getTime();
  const minutesLate = Math.round((now.getTime() - plannedStart.getTime()) / (1000 * 60));
  
  // Option 1: Extend to maintain duration
  const extendEndTime = new Date(now.getTime() + plannedDuration);
  const extendDuration = Math.round(plannedDuration / (1000 * 60));
  
  // Option 2: Use remaining time (until original end time)
  const remainingEndTime = plannedEnd;
  const remainingDuration = Math.max(0, Math.round((remainingEndTime.getTime() - now.getTime()) / (1000 * 60)));

  const handleAdjust = async (option: "extend" | "remaining") => {
    if (now >= remainingEndTime) {
      toast({
        variant: "destructive",
        title: "Session time passed",
        description: "The original session time has already ended. Please use the full reschedule option.",
      });
      return;
    }

    setIsSubmitting(true);
    setSelectedOption(option);
    
    try {
      const newStart = now;
      const newEnd = option === "extend" ? extendEndTime : remainingEndTime;
      
      await onAdjust(
        session.id,
        newStart.toISOString(),
        newEnd.toISOString()
      );
      
      toast({
        title: "Session adjusted",
        description: option === "extend" 
          ? `Extended to ${format(newEnd, "h:mm a")} to maintain ${extendDuration} minutes`
          : `Using remaining ${remainingDuration} minutes until ${format(newEnd, "h:mm a")}`,
      });
      onOpenChange(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to adjust session";
      
      // If conflict with extend option, suggest using remaining time
      if (option === "extend" && errorMessage.includes("conflict")) {
        toast({
          variant: "destructive",
          title: "Time conflict",
          description: "Extending would conflict with another session. Try 'Use remaining time' instead.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Adjustment failed",
          description: errorMessage,
        });
      }
    } finally {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  };

  const taskName = session.focus || "this session";
  const isPastOriginalEnd = now >= remainingEndTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Quick Adjust Session
          </DialogTitle>
          <DialogDescription>
            You're {minutesLate} minutes late for <span className="font-medium">{taskName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Current Status */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Original Schedule</p>
                <p className="text-xs text-muted-foreground">
                  {format(plannedStart, "h:mm a")} – {format(plannedEnd, "h:mm a")} ({Math.round(plannedDuration / (1000 * 60))} min)
                </p>
              </div>
            </div>
          </div>

          {/* Adjustment Options */}
          {isPastOriginalEnd ? (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm text-red-800 mb-2">
                The original session time has already passed.
              </p>
              <p className="text-xs text-red-700">
                Use the full reschedule option to set a new time.
              </p>
            </div>
          ) : (
            <>
              {/* Option 1: Extend to maintain duration */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Extend to maintain duration
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Start now and extend end time to keep the full {extendDuration} minutes
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span>{format(now, "h:mm a")}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{format(extendEndTime, "h:mm a")}</span>
                      <span className="text-muted-foreground">({extendDuration} min)</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleAdjust("extend")}
                  disabled={isSubmitting}
                >
                  {isSubmitting && selectedOption === "extend" ? "Adjusting..." : "Extend Duration"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  ⚠️ May conflict with next session
                </p>
              </div>

              {/* Option 2: Use remaining time */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Use remaining time
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Start now and use the remaining {remainingDuration} minutes until original end time
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span>{format(now, "h:mm a")}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{format(remainingEndTime, "h:mm a")}</span>
                      <span className="text-muted-foreground">({remainingDuration} min)</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => handleAdjust("remaining")}
                  disabled={isSubmitting}
                >
                  {isSubmitting && selectedOption === "remaining" ? "Adjusting..." : "Use Remaining Time"}
                </Button>
                <p className="text-xs text-green-600 font-medium">
                  ✓ No conflicts - safe option
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

