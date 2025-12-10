"use client";

import { useState } from "react";
import { PlayCircle, Zap, Target, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useQuickTrack } from "@/contexts/quick-track-context";
import { useUpdateTask } from "@/features/tasks/hooks";
import { toast } from "@/components/ui/use-toast";
import type { Task, StudySession, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StartTrackingButtonProps {
  readonly task?: Task | null;
  readonly session?: StudySession | null;
  readonly subject?: Subject | null;
  readonly variant?: "default" | "outline" | "ghost";
  readonly size?: "sm" | "default" | "lg";
  readonly className?: string;
  readonly showQuickTrack?: boolean; // Control whether to show Quick Track option
  readonly onFocusSessionStart?: () => void;
}

export function StartTrackingButton({
  task,
  session,
  subject,
  variant = "default",
  size = "sm",
  className,
  showQuickTrack = true, // Default to showing Quick Track (for Tasks page)
  onFocusSessionStart,
}: Readonly<StartTrackingButtonProps>) {
  const { state: focusState, startSession } = useFocusSession();
  const { isActive: isQuickTrackActive, getElapsedTime, startQuickTrack, stopQuickTrack } = useQuickTrack();
  const updateTask = useUpdateTask();
  const [open, setOpen] = useState(false);
  
  const activeQuickTrack = task ? isQuickTrackActive(task.id) : false;
  const quickTrackTime = task ? getElapsedTime(task.id) : 0;

  // Check if this task/session is currently in focus mode
  const isInFocusMode = focusState.isActive && (
    (task && focusState.task?.id === task.id) ||
    (session && focusState.session?.id === session.id)
  );

  // Check if we can show Quick Track option (only for tasks, and only if showQuickTrack is true)
  const canQuickTrack = !!task && !isInFocusMode && showQuickTrack;
  
  // Check if we can show Focus Session option
  const canFocusSession = !isInFocusMode && !focusState.isActive;

  // Format time display
  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const minsPart = mins > 0 ? `${mins}m` : "";
    return `${hours}h${minsPart}`;
  };

  // Handle Quick Track start
  const handleQuickTrackStart = () => {
    if (task) {
      startQuickTrack(task.id);
      updateTask.mutate(
        { id: task.id, payload: { status: "in_progress" } },
        { onSuccess: () => toast({ title: "Quick Track started", description: "Time tracking in background..." }) }
      );
    }
    setOpen(false);
  };

  // Handle Quick Track stop
  const handleQuickTrackStop = () => {
    if (task) {
      const elapsed = stopQuickTrack(task.id, true);
      const currentTimer = task.timer_minutes_spent ?? 0;
      updateTask.mutate(
        {
          id: task.id,
          payload: {
            timer_minutes_spent: currentTimer + elapsed,
            status: "on_hold",
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Quick Track stopped",
              description: `${elapsed} minute${elapsed === 1 ? "" : "s"} tracked and saved.`,
            });
          },
        }
      );
    }
    setOpen(false);
  };

  // Handle Focus Session start
  const handleFocusSessionStart = () => {
    // Calculate Quick Track time to preserve
    const quickTrackTimeMs = activeQuickTrack && quickTrackTime > 0 
      ? quickTrackTime * 60 * 1000 
      : 0;

    // If Quick Track is active, stop it first (conversion) - save time to task
    if (activeQuickTrack && task) {
      const elapsed = stopQuickTrack(task.id, true);
      const currentTimer = task.timer_minutes_spent ?? 0;
      updateTask.mutate({
        id: task.id,
        payload: {
          timer_minutes_spent: currentTimer + elapsed,
        },
      });
    }

    if (onFocusSessionStart) {
      onFocusSessionStart();
    } else if (session) {
      // Use the provided session, preserving Quick Track time
      startSession(session, task || null, subject || null, quickTrackTimeMs);
    } else if (task) {
      // Create temporary session from task
      const now = new Date();
      const duration = task.estimated_minutes || 60;
      const endTime = new Date(now.getTime() + duration * 60 * 1000);
      
      const tempSession: StudySession = {
        id: -1,
        user_id: 0,
        task_id: task.id,
        subject_id: task.subject_id || null,
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        status: "planned",
        focus: task.title,
      };
      
      startSession(tempSession, task, subject || null, quickTrackTimeMs);
    }
    setOpen(false);
  };

  // If in focus mode, show active indicator
  if (isInFocusMode) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size={size}
              className={cn("gap-2", className)}
              disabled
            >
              <Target className="h-3 w-3" />
              <span className="hidden sm:inline">In Focus</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Focus session is active</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // If Quick Track is active, show timer with stop option
  if (activeQuickTrack && canQuickTrack) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size={size}
                  className={cn("gap-2", className)}
                >
                  <Clock className="h-3 w-3 animate-pulse" />
                  <span className="hidden sm:inline">{formatTime(quickTrackTime)}</span>
                  <span className="sm:hidden">{quickTrackTime}m</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Quick Track active - {formatTime(quickTrackTime)} tracked</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Tracking Active</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleQuickTrackStop}>
            <Clock className="h-4 w-4 mr-2" />
            Stop Quick Track
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFocusSessionStart}>
            <Target className="h-4 w-4 mr-2" />
            Convert to Focus Session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default: Show start tracking button with dropdown
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("gap-2", className)}
        >
          <PlayCircle className="h-3 w-3" />
          <span className="hidden sm:inline">Start Tracking</span>
          <span className="sm:hidden">Start</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Track Time</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {canQuickTrack && (
          <>
            <DropdownMenuItem onClick={handleQuickTrackStart}>
              <Zap className="h-4 w-4 mr-2 text-yellow-500" />
              <div className="flex flex-col">
                <span className="font-medium">Quick Track</span>
                <span className="text-xs text-muted-foreground">
                  Track while multitasking
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        {canFocusSession && (
          <DropdownMenuItem onClick={handleFocusSessionStart}>
            <Target className="h-4 w-4 mr-2 text-primary" />
            <div className="flex flex-col">
              <span className="font-medium">Focus Session</span>
              <span className="text-xs text-muted-foreground">
                Dedicated study time
              </span>
            </div>
          </DropdownMenuItem>
        )}

        {!canQuickTrack && !canFocusSession && (
          <DropdownMenuItem disabled>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            <span className="text-sm text-muted-foreground">
              Another session is active
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
