"use client";

import { useState, useEffect, useMemo } from "react";
import { format, addMinutes } from "date-fns";
import { Plus, Clock, Pin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useCreateSession, useSessions } from "@/features/schedule/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useConstraints } from "@/features/constraints/hooks";
import { formatForDateTimeLocal } from "@/lib/utils";
import type { StudySession, Constraint } from "@/lib/types";

interface CreateSessionDialogProps {
  readonly defaultDate?: Date;
  readonly trigger?: React.ReactNode;
}

// Helper to check if two time ranges overlap
function timeRangesOverlap(
  start1: Date, end1: Date, 
  start2: Date, end2: Date
): boolean {
  return !(end1 <= start2 || start1 >= end2);
}

// Helper to check if a time range overlaps with a constraint
function overlapsWithConstraint(
  start: Date, end: Date, 
  constraint: Constraint
): boolean {
  if (constraint.is_recurring && constraint.start_time && constraint.end_time) {
    // Check if the day of week matches
    const dayOfWeek = start.getDay();
    // Convert JS day (0=Sun) to our format (0=Mon)
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    if (!constraint.days_of_week?.includes(adjustedDay)) {
      return false;
    }
    
    // Parse constraint times and check overlap
    const [startHour, startMin] = constraint.start_time.split(":").map(Number);
    const [endHour, endMin] = constraint.end_time.split(":").map(Number);
    
    const constraintStart = new Date(start);
    constraintStart.setHours(startHour, startMin, 0, 0);
    
    const constraintEnd = new Date(start);
    constraintEnd.setHours(endHour, endMin, 0, 0);
    
    return timeRangesOverlap(start, end, constraintStart, constraintEnd);
  } else if (!constraint.is_recurring && constraint.start_datetime && constraint.end_datetime) {
    const constraintStart = new Date(constraint.start_datetime);
    const constraintEnd = new Date(constraint.end_datetime);
    return timeRangesOverlap(start, end, constraintStart, constraintEnd);
  }
  return false;
}

// Helper to categorize a session by its status
function categorizeSession(
  session: StudySession, 
  result: { plannedSessions: StudySession[]; completedSessions: StudySession[]; inProgressSessions: StudySession[] }
): void {
  const status = session.status;
  if (status === "planned" || status === "skipped") {
    result.plannedSessions.push(session);
  } else if (status === "completed" || status === "partial") {
    result.completedSessions.push(session);
  } else if (status === "in_progress") {
    result.inProgressSessions.push(session);
  }
}

// Helper to find overlapping sessions
function findOverlappingSessions(
  start: Date,
  end: Date,
  sessions: StudySession[]
): { plannedSessions: StudySession[]; completedSessions: StudySession[]; inProgressSessions: StudySession[] } {
  const result = {
    plannedSessions: [] as StudySession[],
    completedSessions: [] as StudySession[],
    inProgressSessions: [] as StudySession[],
  };
  
  for (const session of sessions) {
    const sessionStart = new Date(session.start_time);
    const sessionEnd = new Date(session.end_time);
    
    if (timeRangesOverlap(start, end, sessionStart, sessionEnd)) {
      categorizeSession(session, result);
    }
  }
  
  return result;
}

// Helper to find overlapping constraints
function findOverlappingConstraints(start: Date, end: Date, constraints: Constraint[]): Constraint[] {
  return constraints.filter(constraint => overlapsWithConstraint(start, end, constraint));
}

export function CreateSessionDialog({ defaultDate, trigger }: CreateSessionDialogProps) {
  const { toast } = useToast();
  const createSession = useCreateSession();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  const { data: sessions } = useSessions();
  const { data: constraints } = useConstraints();
  
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isPinned, setIsPinned] = useState(true);

  // Filter to only show incomplete tasks
  const availableTasks = tasks?.filter((t) => !t.is_completed) || [];
  const availableSubjects = subjects || [];
  
  // Check for overlaps with existing sessions and constraints
  const overlapInfo = useMemo(() => {
    if (!startTime || !endTime) return null;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start >= end) return null;
    
    const sessionOverlaps = sessions 
      ? findOverlappingSessions(start, end, sessions)
      : { plannedSessions: [], completedSessions: [], inProgressSessions: [] };
    
    const blockedTimes = constraints 
      ? findOverlappingConstraints(start, end, constraints)
      : [];
    
    const result = { ...sessionOverlaps, blockedTimes };
    
    const hasOverlaps = 
      result.plannedSessions.length > 0 ||
      result.completedSessions.length > 0 ||
      result.inProgressSessions.length > 0 ||
      result.blockedTimes.length > 0;
    
    return hasOverlaps ? result : null;
  }, [startTime, endTime, sessions, constraints]);

  // Initialize times when dialog opens
  useEffect(() => {
    if (open) {
      const baseDate = defaultDate || new Date();
      // Round to nearest 15 minutes
      const minutes = baseDate.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 15) * 15;
      const startDate = new Date(baseDate);
      startDate.setMinutes(roundedMinutes, 0, 0);
      
      // Default to 60 minute session
      const endDate = addMinutes(startDate, 60);
      
      setStartTime(formatForDateTimeLocal(startDate));
      setEndTime(formatForDateTimeLocal(endDate));
      setTaskId("");
      setSubjectId("");
      setIsPinned(true);
    }
  }, [open, defaultDate]);

  // Auto-set subject when task is selected
  useEffect(() => {
    if (taskId && taskId !== "none") {
      const selectedTask = availableTasks.find((t) => t.id === Number(taskId));
      if (selectedTask?.subject_id) {
        setSubjectId(String(selectedTask.subject_id));
      }
    }
  }, [taskId, availableTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startTime || !endTime) {
      toast({
        variant: "destructive",
        title: "Missing times",
        description: "Please provide both start and end times.",
      });
      return;
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (startDate >= endDate) {
      toast({
        variant: "destructive",
        title: "Invalid times",
        description: "Start time must be before end time.",
      });
      return;
    }

    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
    if (durationMinutes < 5) {
      toast({
        variant: "destructive",
        title: "Too short",
        description: "Session must be at least 5 minutes long.",
      });
      return;
    }

    if (durationMinutes > 480) {
      toast({
        variant: "destructive",
        title: "Too long",
        description: "Session cannot be longer than 8 hours.",
      });
      return;
    }

    // Show overlap warnings before creating
    const hasPlannedOverlaps = (overlapInfo?.plannedSessions.length ?? 0) > 0;
    const hasCompletedOverlaps = (overlapInfo?.completedSessions.length ?? 0) + (overlapInfo?.inProgressSessions.length ?? 0) > 0;
    const hasBlockedOverlaps = (overlapInfo?.blockedTimes.length ?? 0) > 0;

    createSession.mutate(
      {
        task_id: taskId && taskId !== "none" ? Number(taskId) : null,
        subject_id: subjectId && subjectId !== "none" ? Number(subjectId) : null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        is_pinned: isPinned,
      },
      {
        onSuccess: () => {
          // Success toast
          toast({
            title: "Session created",
            description: `Scheduled for ${format(startDate, "MMM d, h:mm a")} - ${format(endDate, "h:mm a")}`,
          });
          
          // Show overlap warnings after creation
          if (hasCompletedOverlaps) {
            const sessions = [
              ...(overlapInfo?.completedSessions ?? []),
              ...(overlapInfo?.inProgressSessions ?? []),
            ];
            const sessionNames = sessions
              .map(s => s.focus || "Unnamed session")
              .slice(0, 2)
              .join(", ");
            toast({
              variant: "destructive",
              title: "Overlaps with completed session",
              description: `This time slot has an existing ${sessions[0]?.status === "in_progress" ? "in-progress" : "completed"} session (${sessionNames}). This may cause tracking issues.`,
              duration: 8000,
            });
          }
          
          if (hasBlockedOverlaps) {
            const constraintNames = overlapInfo?.blockedTimes
              .map(c => c.name)
              .slice(0, 2)
              .join(", ");
            toast({
              title: "Overlaps with blocked time",
              description: `This session overlaps with "${constraintNames}". You marked this time as unavailable.`,
              duration: 6000,
            });
          }
          
          if (hasPlannedOverlaps) {
            toast({
              title: "Overlaps with scheduled session",
              description: "Regenerate your schedule to let the scheduler work around this session.",
              duration: 6000,
            });
          }
          
          setOpen(false);
        },
        onError: (error: Error) => {
          toast({
            variant: "destructive",
            title: "Failed to create session",
            description: error.message || "Please try again.",
          });
        },
      }
    );
  };

  const selectedTask = taskId && taskId !== "none" ? availableTasks.find((t) => t.id === Number(taskId)) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Session
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Manual Session
          </DialogTitle>
          <DialogDescription>
            Schedule a study session at a specific time. Pinned sessions won't be deleted when regenerating the schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Selection */}
          <div className="space-y-2">
            <Label htmlFor="task">Task (optional)</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger id="task">
                <SelectValue placeholder="Select a task..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No task (free study)</SelectItem>
                {availableTasks.map((task) => (
                  <SelectItem key={task.id} value={String(task.id)}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTask && (
              <p className="text-xs text-muted-foreground">
                Estimated: {selectedTask.estimated_minutes} min
              </p>
            )}
          </div>

          {/* Subject Selection (auto-set from task, but can be changed) */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject (optional)</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger id="subject">
                <SelectValue placeholder="Select a subject..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No subject</SelectItem>
                {availableSubjects.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      {subject.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Start
              </Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                End
              </Label>
              <Input
                id="end-time"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Duration Preview */}
          {startTime && endTime && (
            <div className="text-sm text-muted-foreground">
              Duration: {Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60))} minutes
            </div>
          )}

          {/* Overlap Warnings */}
          {overlapInfo && (
            <div className="space-y-2">
              {(overlapInfo.completedSessions.length > 0 || overlapInfo.inProgressSessions.length > 0) && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Overlaps with {overlapInfo.inProgressSessions.length > 0 ? "in-progress" : "completed"} session</p>
                    <p className="text-xs opacity-80">
                      {[...overlapInfo.completedSessions, ...overlapInfo.inProgressSessions]
                        .map(s => s.focus || "Unnamed")
                        .slice(0, 2)
                        .join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {overlapInfo.blockedTimes.length > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-orange-50 dark:bg-orange-950/30 p-3 text-sm text-orange-800 dark:text-orange-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Overlaps with blocked time</p>
                    <p className="text-xs opacity-80">
                      {overlapInfo.blockedTimes.map(c => c.name).slice(0, 2).join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {overlapInfo.plannedSessions.length > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Overlaps with {overlapInfo.plannedSessions.length} scheduled session{overlapInfo.plannedSessions.length > 1 ? "s" : ""}</p>
                    <p className="text-xs opacity-80">
                      Regenerate schedule after to resolve this
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pin Option */}
          <div className="flex items-center space-x-2 rounded-lg border p-3 bg-muted/30">
            <Checkbox
              id="is-pinned"
              checked={isPinned}
              onCheckedChange={(checked) => setIsPinned(checked === true)}
            />
            <div className="flex-1">
              <Label htmlFor="is-pinned" className="flex items-center gap-2 cursor-pointer">
                <Pin className="h-4 w-4" />
                Pin this session
              </Label>
              <p className="text-xs text-muted-foreground">
                Pinned sessions survive schedule regeneration
              </p>
            </div>
          </div>

          {!isPinned && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                Unpinned sessions may be deleted when you regenerate the schedule.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createSession.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createSession.isPending}>
              {createSession.isPending ? "Creating..." : "Create Session"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
