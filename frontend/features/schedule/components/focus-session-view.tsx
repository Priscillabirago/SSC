"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Pause, Play, Square, Plus, SkipForward, ChevronDown, ChevronUp, Clock, Timer, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useUpdateSession } from "@/features/schedule/hooks";
import { useTasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";
import { parseBackendDateTime, cn } from "@/lib/utils";
import { getSessionEncouragement } from "@/features/coach/api";
import { useMutation } from "@tanstack/react-query";

export function FocusSessionView() {
  const router = useRouter();
  const { state, pauseSession, resumeSession, stopSession, extendSession, skipSession, togglePomodoro, pauseOnNavigate, resumeOnReturn } = useFocusSession();
  const updateSession = useUpdateSession();
  const updateTask = useUpdateTask();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  const [showDetails, setShowDetails] = useState(true);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [encouragementMessage, setEncouragementMessage] = useState<string | null>(null);
  const stopConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const encouragementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get task and subject details
  const task = state.task || (state.session?.task_id ? tasks?.find((t) => t.id === state.session?.task_id) : null) || null;
  const subject = state.subject || (state.session?.subject_id ? subjects?.find((s) => s.id === state.session?.subject_id) : null) || null;

  // Fetch encouragement messages
  const fetchEncouragement = useMutation({
    mutationFn: getSessionEncouragement,
  });

  // Format time display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const getProgress = (): number => {
    if (!state.session) return 0;
    const totalSeconds = Math.round(
      (parseBackendDateTime(state.session.end_time).getTime() - parseBackendDateTime(state.session.start_time).getTime()) / 1000
    );
    if (totalSeconds === 0) return 0;
    return Math.max(0, Math.min(100, ((totalSeconds - state.remainingSeconds) / totalSeconds) * 100));
  };

  // Get timer color based on remaining time
  const getTimerColor = (): string => {
    const progress = getProgress();
    if (progress < 50) return "text-green-600";
    if (progress < 80) return "text-yellow-600";
    return "text-red-600";
  };

  // Calculate elapsed and remaining minutes
  const elapsedMinutes = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000 / 60) : 0;
  const remainingMinutes = Math.floor(state.remainingSeconds / 60);
  const progressPercent = getProgress();

  // Helper: Update task timer and show success toast
  const updateTaskTimer = useCallback((taskId: number, elapsedMinutes: number, message: string, onComplete?: () => void) => {
    // Prefer state.task if it matches (snapshot from session start), otherwise use tasks array
    const currentTask = (state.task?.id === taskId ? state.task : null) || tasks?.find((t) => t.id === taskId);
    if (!currentTask) {
      onComplete?.();
      return;
    }
    const currentTimer = currentTask.timer_minutes_spent ?? 0;
    updateTask.mutate(
      {
        id: taskId,
        payload: {
          timer_minutes_spent: currentTimer + elapsedMinutes,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: message,
            description: `${elapsedMinutes} minutes tracked.`,
          });
          onComplete?.();
        },
      }
    );
  }, [state.task, tasks, updateTask]);

  // Helper: Stop ad-hoc session (session.id < 0)
  const stopAdHocSession = useCallback((elapsedMinutes: number) => {
    if (!state.task) {
      stopSession();
      setShowStopConfirm(false);
      return;
    }
    updateTaskTimer(state.task.id, elapsedMinutes, "Session stopped", () => {
      stopSession();
      setShowStopConfirm(false);
    });
  }, [state.task, updateTaskTimer, stopSession]);

  // Helper: Stop scheduled session (session.id > 0)
  const stopScheduledSession = useCallback((elapsedMinutes: number) => {
    if (!state.session || state.session.id <= 0) {
      stopSession();
      setShowStopConfirm(false);
      return;
    }
    updateSession.mutate(
      {
        sessionId: state.session.id,
        payload: { status: "partial" },
      },
      {
        onSuccess: () => {
          if (state.task && state.session?.task_id) {
            updateTaskTimer(state.task.id, elapsedMinutes, "Session stopped", () => {
              stopSession();
              setShowStopConfirm(false);
            });
          } else {
            toast({
              title: "Session stopped",
              description: "Your progress has been saved.",
            });
            stopSession();
            setShowStopConfirm(false);
          }
        },
      }
    );
  }, [state.session, state.task, updateSession, updateTaskTimer, stopSession]);

  // Helper: Complete ad-hoc session
  const completeAdHocSession = useCallback((elapsedMinutes: number) => {
    if (!state.task) {
      stopSession();
      return;
    }
    const currentTask = tasks?.find((t) => t.id === state.task!.id);
    if (!currentTask) {
      stopSession();
      return;
    }
    const currentTimer = currentTask.timer_minutes_spent ?? 0;
    updateTask.mutate(
      {
        id: state.task.id,
        payload: {
          timer_minutes_spent: currentTimer + elapsedMinutes,
          status: "in_progress",
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Session completed! 🎉",
            description: `Great work! ${elapsedMinutes} minutes tracked.`,
          });
          stopSession();
        },
      }
    );
  }, [state.task, tasks, updateTask, stopSession]);

  // Helper: Complete scheduled session
  const completeScheduledSession = useCallback((elapsedMinutes: number) => {
    if (!state.session || state.session.id <= 0) {
      stopSession();
      return;
    }
    updateSession.mutate(
      {
        sessionId: state.session.id,
        payload: { status: "completed" },
      },
      {
        onSuccess: () => {
          if (state.task && state.session?.task_id) {
            updateTaskTimer(state.task.id, elapsedMinutes, "Session completed! 🎉", () => {
              stopSession();
            });
          } else {
            toast({
              title: "Session completed! 🎉",
              description: "Great work! Your session has been marked as complete.",
            });
            stopSession();
          }
        },
      }
    );
  }, [state.session, state.task, updateSession, updateTaskTimer, stopSession]);

  // Fetch encouragement messages periodically
  useEffect(() => {
    if (state.isActive && !state.isPaused && task) {
      // Fetch encouragement at milestones (25%, 50%, 75%)
      const milestones = [25, 50, 75];
      const currentMilestone = milestones.find(m => progressPercent >= m && progressPercent < m + 5);
      
      if (currentMilestone && encouragementMessage === null) {
        fetchEncouragement.mutate({
          elapsed_minutes: elapsedMinutes,
          remaining_minutes: remainingMinutes,
          progress_percent: progressPercent,
          task_title: task.title,
          is_paused: false,
          pomodoro_count: state.pomodoroCount,
        }, {
          onSuccess: (data) => {
            setEncouragementMessage(data.message);
            setTimeout(() => setEncouragementMessage(null), 5000);
          },
        });
      }
    }
  }, [state.isActive, state.isPaused, progressPercent, task, elapsedMinutes, remainingMinutes, state.pomodoroCount, encouragementMessage, fetchEncouragement]);

  // Soft lock: Handle navigation attempts
  useEffect(() => {
    if (!state.isActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      pauseOnNavigate();
      // Modern browsers ignore custom messages, but we still need to set returnValue
      // to trigger the beforeunload dialog. This is the standard approach despite deprecation.
      // NOSONAR: returnValue is deprecated but still the standard way to trigger beforeunload dialog
      e.returnValue = "";
    };

    const handlePopState = () => {
      pauseOnNavigate();
      setShowNavigationWarning(true);
    };

    globalThis.addEventListener("beforeunload", handleBeforeUnload);
    globalThis.addEventListener("popstate", handlePopState);

    return () => {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
      globalThis.removeEventListener("popstate", handlePopState);
    };
  }, [state.isActive, pauseOnNavigate]);

  // Note: Navigation is handled via beforeunload and popstate events
  // Direct navigation attempts will trigger the warning dialog

  const confirmNavigation = () => {
    if (pendingNavigation) {
      router.push(pendingNavigation);
      stopSession();
    }
    setShowNavigationWarning(false);
    setPendingNavigation(null);
  };

  const cancelNavigation = () => {
    setShowNavigationWarning(false);
    setPendingNavigation(null);
    resumeOnReturn();
  };

  // Handle stop with confirmation
  const handleStop = useCallback(() => {
    if (!showStopConfirm) {
      setShowStopConfirm(true);
      // Clear any existing timeout
      if (stopConfirmTimeoutRef.current) {
        clearTimeout(stopConfirmTimeoutRef.current);
      }
      stopConfirmTimeoutRef.current = setTimeout(() => {
        setShowStopConfirm(false);
        stopConfirmTimeoutRef.current = null;
      }, 3000);
      return;
    }

    if (!state.session) {
      stopSession();
      setShowStopConfirm(false);
      return;
    }

    const elapsedMinutes = state.startTime 
      ? Math.floor((Date.now() - state.startTime) / 1000 / 60)
      : 0;

    if (state.session.id < 0) {
      stopAdHocSession(elapsedMinutes);
    } else if (state.session.id > 0) {
      stopScheduledSession(elapsedMinutes);
    } else {
      stopSession();
      setShowStopConfirm(false);
    }
  }, [showStopConfirm, state.session, state.startTime, stopAdHocSession, stopScheduledSession, stopSession]);

  // Handle ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isActive) {
        handleStop();
      }
    };

    if (state.isActive) {
      globalThis.addEventListener("keydown", handleKeyDown);
      return () => globalThis.removeEventListener("keydown", handleKeyDown);
    }
  }, [state.isActive, handleStop]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (stopConfirmTimeoutRef.current) {
        clearTimeout(stopConfirmTimeoutRef.current);
      }
      if (encouragementTimeoutRef.current) {
        clearTimeout(encouragementTimeoutRef.current);
      }
    };
  }, []);

  // Handle session completion
  useEffect(() => {
    if (!state.isActive || state.remainingSeconds !== 0 || !state.session) {
      return;
    }

    const elapsedMinutes = state.startTime 
      ? Math.floor((Date.now() - state.startTime) / 1000 / 60)
      : 0;

    if (state.session.id < 0) {
      completeAdHocSession(elapsedMinutes);
    } else if (state.session.id > 0) {
      completeScheduledSession(elapsedMinutes);
    } else {
      stopSession();
    }
  }, [state.isActive, state.remainingSeconds, state.session, state.startTime, completeAdHocSession, completeScheduledSession, stopSession]);

  // Handle skip
  const handleSkip = useCallback(() => {
    if (!state.session) {
      skipSession();
      return;
    }
    updateSession.mutate(
      {
        sessionId: state.session.id,
        payload: { status: "skipped" },
      },
      {
        onSuccess: () => {
          toast({
            title: "Session skipped",
            description: "This session has been marked as skipped.",
          });
          skipSession();
        },
      }
    );
  }, [state.session, updateSession, skipSession]);

  // Handle extend
  const handleExtend = useCallback((minutes: number) => {
    extendSession(minutes);
    const showToast = () => {
      toast({
        title: `Added ${minutes} minutes`,
        description: "Session time has been extended.",
      });
    };
    
    if (state.session?.id && state.session.id > 0) {
      const currentEndTime = new Date(state.session.end_time);
      const newEndTime = new Date(currentEndTime.getTime() + minutes * 60 * 1000);
      updateSession.mutate(
        {
          sessionId: state.session.id,
          payload: { end_time: newEndTime.toISOString() },
        },
        {
          onSuccess: showToast,
        }
      );
    } else {
      showToast();
    }
  }, [state.session, extendSession, updateSession]);

  // Handle subtask toggle
  const handleSubtaskToggle = (subtaskId: string, completed: boolean) => {
    if (!task?.subtasks) return;
    
    const updatedSubtasks = task.subtasks.map(st => 
      st.id === subtaskId ? { ...st, completed } : st
    );
    
    updateTask.mutate({
      id: task.id,
      payload: { subtasks: updatedSubtasks },
    });
  };

  if (!state.isActive || !state.session) {
    return null;
  }

  const progress = getProgress();
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="relative w-full max-w-5xl mx-auto px-6 py-8">
          {/* Enhanced Session Details Panel */}
          <Card className={cn(
            "mb-6 transition-all duration-300 overflow-hidden",
            showDetails ? "opacity-100 max-h-[500px]" : "opacity-0 max-h-0"
          )}>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {subject && (
                    <Badge variant="outline" className="text-sm flex-shrink-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full mr-2"
                        style={{ backgroundColor: subject.color }}
                      />
                      {subject.name}
                    </Badge>
                  )}
                  {task && (
                    <>
                      <Badge variant="outline" className="text-sm flex-shrink-0">
                        {task.priority}
                      </Badge>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {task.title}
                      </p>
                    </>
                  )}
                  {!task && state.session.focus && (
                    <p className="text-sm font-semibold text-foreground">
                      {state.session.focus}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  {showDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              {task && (
                <div className="space-y-3">
                  {/* Time Info */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {Math.round((parseBackendDateTime(state.session.end_time).getTime() - parseBackendDateTime(state.session.start_time).getTime()) / 60000)} min planned
                      </span>
                    </div>
                    {task.estimated_minutes ? (
                      <span>
                        {task.estimated_minutes} min estimated
                      </span>
                    ) : null}
                    {task.total_minutes_spent && (
                      <span className="text-foreground font-medium">
                        {task.total_minutes_spent} min total tracked
                      </span>
                    )}
                  </div>

                  {/* Task Description */}
                  {task.description && (
                    <div className="text-xs text-muted-foreground">
                      <p className="line-clamp-2">{task.description}</p>
                    </div>
                  )}

                  {/* Subtasks */}
                  {task.subtasks?.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">Subtasks:</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {task.subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Checkbox
                              checked={subtask.completed}
                              onCheckedChange={(checked) => 
                                handleSubtaskToggle(subtask.id, checked as boolean)
                              }
                              className="h-3.5 w-3.5"
                            />
                            <span className={cn(
                              "flex-1",
                              subtask.completed && "line-through text-muted-foreground"
                            )}>
                              {subtask.title}
                            </span>
                            {subtask.estimated_minutes ? (
                              <span className="text-muted-foreground">
                                {subtask.estimated_minutes}m
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Pomodoro Indicator */}
              {state.pomodoroEnabled && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Timer className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">
                    Pomodoro {state.pomodoroCount}/4 - {state.pomodoroMode === "work" ? "Work" : "Break"}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* AI Encouragement Message */}
          {encouragementMessage && (
            <Card className="mb-4 bg-primary/5 border-primary/20 animate-in slide-in-from-top-2">
              <div className="p-3 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">{encouragementMessage}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 flex-shrink-0"
                  onClick={() => setEncouragementMessage(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          )}

          {/* Main Timer Display */}
          <div className="flex flex-col items-center justify-center space-y-8">
            {/* Circular Progress Timer */}
            <div className="relative">
              <svg className="transform -rotate-90 w-64 h-64 sm:w-80 sm:h-80">
                <circle
                  cx="50%"
                  cy="50%"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted/20"
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={cn("transition-all duration-1000 ease-linear", getTimerColor())}
                />
              </svg>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={cn("text-6xl sm:text-7xl font-bold tabular-nums", getTimerColor())}>
                  {formatTime(state.remainingSeconds)}
                </div>
                {state.isPaused && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Paused
                  </Badge>
                )}
                {state.pomodoroEnabled ? (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {state.pomodoroMode === "work" ? "Work" : "Break"} {state.pomodoroCount}/4
                  </Badge>
                ) : null}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {state.isPaused ? (
                <Button
                  size="lg"
                  onClick={resumeSession}
                  className="h-12 px-6 text-base"
                >
                  <Play className="h-5 w-5 mr-2" />
                  Resume
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={pauseSession}
                  className="h-12 px-6 text-base"
                >
                  <Pause className="h-5 w-5 mr-2" />
                  Pause
                </Button>
              )}
              
              <Button
                size="lg"
                variant={showStopConfirm ? "destructive" : "outline"}
                onClick={handleStop}
                className="h-12 px-6 text-base"
              >
                <Square className="h-5 w-5 mr-2" />
                {showStopConfirm ? "Confirm Stop" : "Stop"}
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                onClick={() => handleExtend(5)}
                className="h-12 px-6 text-base"
              >
                <Plus className="h-5 w-5 mr-2" />
                +5 min
              </Button>
              
              <Button
                size="lg"
                variant={state.pomodoroEnabled ? "default" : "outline"}
                onClick={togglePomodoro}
                className="h-12 px-6 text-base"
              >
                <Timer className="h-5 w-5 mr-2" />
                Pomodoro
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                onClick={handleSkip}
                className="h-12 px-6 text-base"
              >
                <SkipForward className="h-5 w-5 mr-2" />
                Skip
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Press ESC to exit</span>
              <span>•</span>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="hover:text-foreground transition-colors"
                type="button"
              >
                {showDetails ? "Hide" : "Show"} details
              </button>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-10 w-10"
          onClick={handleStop}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation Warning Dialog */}
      <Dialog open={showNavigationWarning} onOpenChange={setShowNavigationWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Active Focus Session
            </DialogTitle>
            <DialogDescription>
              You have an active focus session. Your session has been paused. Leave anyway?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button variant="outline" onClick={cancelNavigation}>
              Stay & Resume
            </Button>
            <Button variant="destructive" onClick={confirmNavigation}>
              Leave Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
