"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar, Clock, AlertCircle } from "lucide-react";
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

interface RescheduleDialogProps {
  session: StudySession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReschedule: (sessionId: number, startTime: string, endTime: string) => Promise<void>;
}

export function RescheduleDialog({
  session,
  open,
  onOpenChange,
  onReschedule,
}: Readonly<RescheduleDialogProps>) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Initialize form with current session times
  // Parse backend times properly (handles UTC conversion)
  const currentStart = parseBackendDateTime(session.start_time);
  const currentEnd = parseBackendDateTime(session.end_time);
  
  const [formData, setFormData] = useState({
    startTime: formatForDateTimeLocal(currentStart),
    endTime: formatForDateTimeLocal(currentEnd),
  });
  
  const duration = currentEnd.getTime() - currentStart.getTime();
  const durationMinutes = Math.round(duration / (1000 * 60));
  
  // Update end time when start time changes (maintain duration)
  // datetime-local gives local time, new Date() interprets as local (correct)
  const handleStartTimeChange = (value: string) => {
    setFormData((prev) => {
      const newStart = new Date(value); // Local time from datetime-local
      const newEnd = new Date(newStart.getTime() + duration);
      return {
        startTime: value,
        endTime: formatForDateTimeLocal(newEnd),
      };
    });
  };
  
  // Update start time when end time changes (maintain duration)
  const handleEndTimeChange = (value: string) => {
    setFormData((prev) => {
      const newEnd = new Date(value); // Local time from datetime-local
      const newStart = new Date(newEnd.getTime() - duration);
      return {
        startTime: formatForDateTimeLocal(newStart),
        endTime: value,
      };
    });
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const startDate = new Date(formData.startTime);
    const endDate = new Date(formData.endTime);
    
    // Validation
    if (startDate >= endDate) {
      toast({
        variant: "destructive",
        title: "Invalid time",
        description: "Start time must be before end time.",
      });
      return;
    }
    
    // Validate minimum duration (at least 5 minutes)
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
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
    
    setIsSubmitting(true);
    try {
      await onReschedule(
        session.id,
        startDate.toISOString(),
        endDate.toISOString()
      );
      toast({
        title: "Session rescheduled",
        description: `Moved to ${format(startDate, "MMM d, h:mm a")} - ${format(endDate, "h:mm a")}`,
      });
      onOpenChange(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to reschedule session";
      toast({
        variant: "destructive",
        title: "Reschedule failed",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const taskName = session.focus || "this session";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Reschedule Session
          </DialogTitle>
          <DialogDescription>
            Change the time for <span className="font-medium">{taskName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start-time" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Start Time
            </Label>
            <Input
              id="start-time"
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Current: {format(currentStart, "MMM d, h:mm a")}
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
              value={formData.endTime}
              onChange={(e) => handleEndTimeChange(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Current: {format(currentEnd, "MMM d, h:mm a")} ({durationMinutes} min)
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
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
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

