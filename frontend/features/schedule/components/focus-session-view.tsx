"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Pause, Play, Square, Plus, SkipForward, ChevronDown, ChevronUp, Clock, Timer, Sparkles, AlertTriangle, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useUpdateSession } from "@/features/schedule/hooks";
import { useTasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";
import { parseBackendDateTime, cn } from "@/lib/utils";
import { getSessionEncouragement } from "@/features/coach/api";
import { useMutation } from "@tanstack/react-query";

// eslint-disable-next-line sonarjs/cognitive-complexity
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [editingTaskTitle, setEditingTaskTitle] = useState(false);
  const [editingTaskDescription, setEditingTaskDescription] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("");
  const stopConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const encouragementTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPomodoroPhaseRef = useRef<"work" | "break" | null>(null);

  // Get task and subject details - prioritize fresh data from query over snapshot
  const task = (state.session?.task_id ? tasks?.find((t) => t.id === state.session?.task_id) : null) || state.task || null;
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

  // Calculate progress percentage for main session
  const getMainProgress = (): number => {
    if (!state.session) return 0;
    const totalSeconds = Math.round(
      (parseBackendDateTime(state.session.end_time).getTime() - parseBackendDateTime(state.session.start_time).getTime()) / 1000
    );
    if (totalSeconds === 0) return 0;
    return Math.max(0, Math.min(100, ((totalSeconds - state.remainingSeconds) / totalSeconds) * 100));
  };

  // Calculate progress percentage for Pomodoro
  const getPomodoroProgress = (): number => {
    if (!state.pomodoroEnabled || state.pomodoroDurationMs === 0) return 0;
    const totalSeconds = Math.floor(state.pomodoroDurationMs / 1000);
    if (totalSeconds === 0) return 0;
    return Math.max(0, Math.min(100, ((totalSeconds - state.pomodoroRemainingSeconds) / totalSeconds) * 100));
  };

  // Get color based on time remaining (green → yellow → red)
  const getTimeBasedColor = (remainingSeconds: number, totalSeconds: number): string => {
    if (totalSeconds === 0) return isDarkMode ? "text-slate-400" : "text-slate-600";
    const progress = (remainingSeconds / totalSeconds) * 100;
    if (progress > 50) return isDarkMode ? "text-emerald-400" : "text-emerald-600";
    if (progress > 20) return isDarkMode ? "text-amber-400" : "text-amber-600";
    return isDarkMode ? "text-red-400" : "text-red-600";
  };

  // Get Pomodoro phase color
  const getPomodoroPhaseColor = (): string => {
    if (state.pomodoroMode === "work") {
      return isDarkMode ? "text-orange-400" : "text-orange-600";
    } else if (state.pomodoroMode === "break") {
      return isDarkMode ? "text-blue-400" : "text-blue-600";
    }
    return isDarkMode ? "text-slate-400" : "text-slate-600";
  };

  // Get Pomodoro background color
  const getPomodoroBackground = (): string => {
    if (state.pomodoroMode === "work") {
      return isDarkMode 
        ? "from-orange-950/20 via-slate-900 to-orange-950/20" 
        : "from-orange-50/50 via-white to-orange-50/50";
    }
    return isDarkMode 
      ? "from-blue-950/20 via-slate-900 to-blue-950/20" 
      : "from-blue-50/50 via-white to-blue-50/50";
  };

  // Get main session background color based on progress
  const getMainSessionBackground = (): string => {
    const mainProgress = getMainProgress();
    if (mainProgress < 50) {
      return isDarkMode 
        ? "from-emerald-950/20 via-slate-900 to-emerald-950/20" 
        : "from-emerald-50/50 via-white to-emerald-50/50";
    }
    if (mainProgress < 80) {
      return isDarkMode 
        ? "from-amber-950/20 via-slate-900 to-amber-950/20" 
        : "from-amber-50/50 via-white to-amber-50/50";
    }
    return isDarkMode 
      ? "from-red-950/20 via-slate-900 to-red-950/20" 
      : "from-red-50/50 via-white to-red-50/50";
  };

  // Get ambient background color based on time/phase
  const getAmbientBackground = (): string => {
    if (state.pomodoroEnabled && state.pomodoroMode) {
      return getPomodoroBackground();
    }
    return getMainSessionBackground();
  };

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      audioContextRef.current ??= new (globalThis.AudioContext || (globalThis as any).webkitAudioContext)();
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Gentle chime sound
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Silently fail if audio is not available
    }
  }, [soundEnabled]);

  // Calculate elapsed minutes - properly accounts for pauses
  const elapsedMinutes = useMemo(() => {
    if (!state.startTime) return 0;
    if (state.isPaused && state.pausedTime) {
      // If paused, calculate elapsed time up to when it was paused
      return Math.floor((state.pausedTime - state.startTime) / 1000 / 60);
    }
    // If active, calculate elapsed time up to now
    return Math.floor((Date.now() - state.startTime) / 1000 / 60);
  }, [state.startTime, state.isPaused, state.pausedTime]);
  const remainingMinutes = Math.floor(state.remainingSeconds / 60);
  const progressPercent = getMainProgress();

  // Play sound when Pomodoro phase changes (work <-> break transitions)
  useEffect(() => {
    if (state.pomodoroEnabled && state.pomodoroMode && lastPomodoroPhaseRef.current !== null && state.pomodoroMode !== lastPomodoroPhaseRef.current) {
      playNotificationSound();
    }
    if (state.pomodoroEnabled && state.pomodoroMode) {
      lastPomodoroPhaseRef.current = state.pomodoroMode;
    } else {
      lastPomodoroPhaseRef.current = null;
    }
  }, [state.pomodoroEnabled, state.pomodoroMode, playNotificationSound]);

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
  // NOTE: Scheduled sessions should NOT add to timer_minutes_spent
  // The backend automatically calculates actual_minutes_spent from session duration
  // IMPORTANT: We must update end_time to current time so partial sessions count actual time worked, not full scheduled duration
  // Also update start_time if user started late, so we don't count time they didn't work
  const stopScheduledSession = useCallback((elapsedMinutes: number) => {
    if (!state.session || state.session.id <= 0) {
      stopSession();
      setShowStopConfirm(false);
      return;
    }
    // Update end_time to current time so backend calculates actual time worked, not full scheduled duration
    const currentEndTime = new Date().toISOString();
    
    // Check if user started late - if actual start time is after scheduled start time, update start_time too
    const scheduledStartTime = new Date(state.session.start_time).getTime();
    const actualStartTime = state.startTime;
    const payload: { status: "partial"; end_time: string; start_time?: string } = {
      status: "partial",
      end_time: currentEndTime,
    };
    
    // If user started late (actual start > scheduled start), update start_time to actual start time
    // This ensures backend calculates only the time they actually worked
    if (actualStartTime && actualStartTime > scheduledStartTime) {
      payload.start_time = new Date(actualStartTime).toISOString();
    }
    
    updateSession.mutate(
      {
        sessionId: state.session.id,
        payload,
      },
      {
        onSuccess: () => {
          // Backend will automatically update actual_minutes_spent from session duration (end_time - start_time)
          // We should NOT add to timer_minutes_spent for scheduled sessions
          toast({
            title: "Session stopped",
            description: `Marked as partial - ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} worked.`,
          });
          stopSession();
          setShowStopConfirm(false);
        },
      }
    );
  }, [state.session, state.startTime, updateSession, stopSession]);

  // Helper: Complete scheduled session
  // NOTE: Scheduled sessions should NOT add to timer_minutes_spent
  // The backend automatically calculates actual_minutes_spent from session duration
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
          // Backend will automatically update actual_minutes_spent from session duration
          // We should NOT add to timer_minutes_spent for scheduled sessions
          toast({
            title: "Session completed! 🎉",
            description: "Great work! Your session has been marked as complete.",
          });
          stopSession();
        },
      }
    );
  }, [state.session, updateSession, stopSession]);

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
      // eslint-disable-next-line deprecation/deprecation
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

    // Calculate elapsed time properly accounting for pauses
    let calculatedElapsed = 0;
    if (state.startTime) {
      if (state.isPaused && state.pausedTime) {
        calculatedElapsed = Math.floor((state.pausedTime - state.startTime) / 1000 / 60);
      } else {
        calculatedElapsed = Math.floor((Date.now() - state.startTime) / 1000 / 60);
      }
    }

    if (state.session.id < 0) {
      stopAdHocSession(calculatedElapsed);
    } else if (state.session.id > 0) {
      stopScheduledSession(calculatedElapsed);
    } else {
      stopSession();
      setShowStopConfirm(false);
    }
  }, [showStopConfirm, state.session, state.startTime, state.isPaused, state.pausedTime, stopAdHocSession, stopScheduledSession, stopSession]);

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

  // Handle session auto-completion when timer reaches 0
  // Only auto-complete scheduled sessions (id > 0), not ad-hoc sessions
  useEffect(() => {
    // Only trigger for active scheduled sessions when timer reaches or goes below 0
    if (!state.isActive || !state.session || state.session.id <= 0 || state.remainingSeconds > 0) {
      return;
    }

    // Calculate elapsed time properly accounting for pauses
    let calculatedElapsed = 0;
    if (state.startTime) {
      if (state.isPaused && state.pausedTime) {
        calculatedElapsed = Math.floor((state.pausedTime - state.startTime) / 1000 / 60);
      } else {
        calculatedElapsed = Math.floor((Date.now() - state.startTime) / 1000 / 60);
      }
    }

    // Auto-complete scheduled session when timer reaches 0
    completeScheduledSession(calculatedElapsed);
  }, [state.isActive, state.remainingSeconds, state.session, state.startTime, state.isPaused, state.pausedTime, completeScheduledSession]);

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
  const handleSubtaskToggle = useCallback((subtaskId: string, completed: boolean) => {
    if (!task?.subtasks) return;
    
    const updatedSubtasks = task.subtasks.map(st => 
      st.id === subtaskId ? { ...st, completed } : st
    );
    
    // Optimistically update the UI
    updateTask.mutate({
      id: task.id,
      payload: { subtasks: updatedSubtasks },
    });
  }, [task, updateTask]);

  // Handle subtask title edit
  const handleSubtaskTitleSave = useCallback((subtaskId: string) => {
    if (!task?.subtasks || !subtaskDraft.trim()) {
      setEditingSubtaskId(null);
      return;
    }
    const updatedSubtasks = task.subtasks.map(st => 
      st.id === subtaskId ? { ...st, title: subtaskDraft.trim() } : st
    );
    
    updateTask.mutate({
      id: task.id,
      payload: { subtasks: updatedSubtasks },
    }, {
      onSuccess: (updatedTask) => {
        setEditingSubtaskId(null);
        // The query cache will be updated automatically, and the task will refresh
        toast({
          title: "Subtask updated",
          description: "Subtask title has been saved.",
        });
      },
    });
  }, [task, subtaskDraft, updateTask]);

  // Handle task title edit
  const handleTaskTitleSave = useCallback(() => {
    if (!task || !taskTitleDraft.trim()) {
      setEditingTaskTitle(false);
      return;
    }
    updateTask.mutate({
      id: task.id,
      payload: { title: taskTitleDraft.trim() },
    }, {
      onSuccess: () => {
        setEditingTaskTitle(false);
        toast({
          title: "Task updated",
          description: "Task title has been saved.",
        });
      },
    });
  }, [task, taskTitleDraft, updateTask]);

  // Handle task description edit
  const handleTaskDescriptionSave = useCallback(() => {
    if (!task) {
      setEditingTaskDescription(false);
      return;
    }
    updateTask.mutate({
      id: task.id,
      payload: { description: taskDescriptionDraft },
    }, {
      onSuccess: () => {
        setEditingTaskDescription(false);
        toast({
          title: "Task updated",
          description: "Task description has been saved.",
        });
      },
    });
  }, [task, taskDescriptionDraft, updateTask]);

  // Initialize drafts when task changes
  useEffect(() => {
    if (task) {
      setTaskTitleDraft(task.title);
      setTaskDescriptionDraft(task.description || "");
    }
  }, [task?.id]);

  if (!state.isActive || !state.session) {
    return null;
  }

  const mainProgress = getMainProgress();
  const pomodoroProgress = getPomodoroProgress();
  const mainCircumference = 2 * Math.PI * 140;
  const mainStrokeDashoffset = mainCircumference - (mainProgress / 100) * mainCircumference;
  const pomodoroCircumference = 2 * Math.PI * 120;
  const pomodoroStrokeDashoffset = pomodoroCircumference - (pomodoroProgress / 100) * pomodoroCircumference;

  // Determine which timer to show as primary
  const primaryTimer = state.pomodoroEnabled ? "pomodoro" : "main";
  const mainTotalSeconds = Math.round(
    (parseBackendDateTime(state.session.end_time).getTime() - parseBackendDateTime(state.session.start_time).getTime()) / 1000
  );

  return (
    <>
      <div className={cn(
        "fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-300 transition-colors overflow-y-auto",
        isDarkMode 
          ? "bg-gradient-to-br " + getAmbientBackground() + " text-slate-100"
          : "bg-gradient-to-br " + getAmbientBackground() + " text-slate-900"
      )}>
        <div className={cn(
          "relative w-full max-w-5xl mx-auto px-6",
          (() => {
            if (showDetails && state.pomodoroEnabled) return "pt-6 pb-2 sm:pt-8 sm:pb-4";
            if (showDetails) return "pt-8 pb-4 sm:pt-10 sm:pb-6";
            if (state.pomodoroEnabled) return "py-4 sm:py-6";
            return "py-8";
          })()
        )}>
          {/* Enhanced Session Details Panel */}
          <Card className={cn(
            "mb-6 transition-all duration-300 overflow-hidden",
            showDetails ? "opacity-100 max-h-[600px] overflow-y-auto" : "opacity-0 max-h-0 mb-0",
            isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-white/90 border-slate-200"
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
                      {editingTaskTitle ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Input
                            value={taskTitleDraft}
                            onChange={(e) => setTaskTitleDraft(e.target.value)}
                            onBlur={handleTaskTitleSave}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleTaskTitleSave();
                              } else if (e.key === "Escape") {
                                setTaskTitleDraft(task.title);
                                setEditingTaskTitle(false);
                              }
                            }}
                            className="h-7 text-sm flex-1"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors text-left"
                          onClick={() => setEditingTaskTitle(true)}
                          title="Click to edit"
                        >
                          {task.title}
                        </button>
                      )}
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
                  <div className="space-y-1">
                    {editingTaskDescription ? (
                      <div className="space-y-2">
                        <Textarea
                          value={taskDescriptionDraft}
                          onChange={(e) => setTaskDescriptionDraft(e.target.value)}
                          onBlur={handleTaskDescriptionSave}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setTaskDescriptionDraft(task.description || "");
                              setEditingTaskDescription(false);
                            }
                          }}
                          className="text-xs min-h-[60px] resize-none"
                          placeholder="Add a description..."
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleTaskDescriptionSave}
                            className="h-6 text-xs px-2"
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTaskDescriptionDraft(task.description || "");
                              setEditingTaskDescription(false);
                            }}
                            className="h-6 text-xs px-2"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors text-left w-full",
                          !task.description && "text-muted-foreground/60 italic"
                        )}
                        onClick={() => setEditingTaskDescription(true)}
                        title="Click to edit"
                      >
                        {task.description ? (
                          <p className="whitespace-pre-wrap">{task.description}</p>
                        ) : (
                          <p>Click to add description...</p>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Subtasks */}
                  {task.subtasks?.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">Subtasks:</p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {task.subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Checkbox
                              checked={subtask.completed}
                              onCheckedChange={(checked) => {
                                handleSubtaskToggle(subtask.id, checked as boolean);
                              }}
                              className="h-3.5 w-3.5 flex-shrink-0"
                            />
                            {editingSubtaskId === subtask.id ? (
                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                <Input
                                  value={subtaskDraft}
                                  onChange={(e) => setSubtaskDraft(e.target.value)}
                                  onBlur={() => handleSubtaskTitleSave(subtask.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleSubtaskTitleSave(subtask.id);
                                    } else if (e.key === "Escape") {
                                      setSubtaskDraft(subtask.title);
                                      setEditingSubtaskId(null);
                                    }
                                  }}
                                  className="h-6 text-xs flex-1"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubtaskId(subtask.id);
                                  setSubtaskDraft(subtask.title);
                                }}
                                className={cn(
                                  "flex-1 text-left hover:text-primary transition-colors",
                                  subtask.completed && "line-through text-muted-foreground"
                                )}
                                title="Click to edit"
                              >
                                {subtask.title}
                              </button>
                            )}
                            {subtask.estimated_minutes ? (
                              <span className="text-muted-foreground flex-shrink-0">
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

              {/* Pomodoro Progress Indicator */}
              {state.pomodoroEnabled && (
                <div className="flex items-center gap-3 pt-2 border-t">
                  <Timer className={cn("h-4 w-4", getPomodoroPhaseColor())} />
                  <span className={cn("text-xs font-medium", getPomodoroPhaseColor())}>
                    {state.pomodoroMode === "work" ? "Work" : "Break"} Session
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    {[1, 2, 3, 4].map((num) => {
                      const isCompleted = num < state.pomodoroCount || (num === state.pomodoroCount && state.pomodoroMode === "break");
                      const isActive = num === state.pomodoroCount && state.pomodoroMode === "work";
                      
                      let dotClassName = "h-2.5 w-2.5 rounded-full transition-all duration-300";
                      if (isCompleted) {
                        dotClassName += " bg-primary scale-110";
                      } else if (isActive) {
                        dotClassName += " bg-primary scale-125 ring-2 ring-primary/50 animate-pulse";
                      } else {
                        dotClassName += " bg-muted scale-100";
                      }
                      
                      return (
                        <div
                          key={num}
                          className={dotClassName}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* AI Encouragement Message */}
          {encouragementMessage && (
            <Card className={cn(
              "mb-4 animate-in slide-in-from-top-2",
              isDarkMode ? "bg-primary/10 border-primary/30" : "bg-primary/5 border-primary/20"
            )}>
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

          {/* Dual Timer Display */}
          <div className={cn(
            "flex flex-col items-center justify-center",
            state.pomodoroEnabled ? "space-y-2 sm:space-y-3" : "space-y-8"
          )}>
            {/* Primary Timer (Pomodoro when enabled, Main session otherwise) */}
            <div className="relative">
              {primaryTimer === "pomodoro" ? (
                // Pomodoro Timer (Large - Primary) - Slightly smaller when secondary timer is shown
                <>
                  <svg className="transform -rotate-90 w-80 h-80 sm:w-96 sm:h-96">
                <circle
                  cx="50%"
                  cy="50%"
                  r="120"
                  stroke="currentColor"
                      strokeWidth="12"
                  fill="none"
                      className={cn("opacity-20", isDarkMode ? "text-slate-600" : "text-slate-300")}
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r="120"
                  stroke="currentColor"
                      strokeWidth="12"
                  fill="none"
                      strokeDasharray={pomodoroCircumference}
                      strokeDashoffset={pomodoroStrokeDashoffset}
                  strokeLinecap="round"
                      className={cn("transition-all duration-1000 ease-linear", getPomodoroPhaseColor())}
                />
              </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
                    <div className={cn("text-6xl sm:text-7xl font-bold tabular-nums leading-none", getPomodoroPhaseColor())}>
                      {formatTime(state.pomodoroRemainingSeconds)}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={cn("mt-3 text-sm px-3 py-1", getPomodoroPhaseColor(), "border-current")}
                    >
                      {state.pomodoroMode === "work" ? "Focus Time" : "Break Time"}
                    </Badge>
                {state.isPaused && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Paused
                  </Badge>
                )}
                  </div>
                </>
              ) : (
                // Main Session Timer (Large - Primary when Pomodoro disabled)
                <>
                  <svg className="transform -rotate-90 w-96 h-96 sm:w-[28rem] sm:h-[28rem]">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="140"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className={cn("opacity-20", isDarkMode ? "text-slate-600" : "text-slate-300")}
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="140"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={mainCircumference}
                      strokeDashoffset={mainStrokeDashoffset}
                      strokeLinecap="round"
                      className={cn("transition-all duration-1000 ease-linear", getTimeBasedColor(state.remainingSeconds, mainTotalSeconds))}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
                    <div className={cn("text-7xl sm:text-8xl font-bold tabular-nums leading-none", getTimeBasedColor(state.remainingSeconds, mainTotalSeconds))}>
                      {formatTime(state.remainingSeconds)}
                    </div>
                    {state.isPaused && (
                      <Badge variant="outline" className="mt-3 text-sm">
                        Paused
                  </Badge>
                    )}
              </div>
                </>
              )}
            </div>

            {/* Secondary Timer (Main session when Pomodoro enabled) */}
            {state.pomodoroEnabled && (
              <div className="relative">
                <svg className="transform -rotate-90 w-32 h-32 sm:w-40 sm:h-40">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className={cn("opacity-20", isDarkMode ? "text-slate-600" : "text-slate-300")}
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={(2 * Math.PI * 40) - (mainProgress / 100) * (2 * Math.PI * 40)}
                    strokeLinecap="round"
                    className={cn("transition-all duration-1000 ease-linear", getTimeBasedColor(state.remainingSeconds, mainTotalSeconds))}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={cn("text-lg sm:text-xl font-semibold tabular-nums", getTimeBasedColor(state.remainingSeconds, mainTotalSeconds))}>
                    {formatTime(state.remainingSeconds)}
                  </div>
                  <span className={cn("text-[10px] sm:text-xs mt-0.5", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                    Session Time
                  </span>
                </div>
              </div>
            )}

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

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
            className="h-10 w-10"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Disable sounds" : "Enable sounds"}
          >
            {soundEnabled ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
          onClick={handleStop}
        >
          <X className="h-5 w-5" />
        </Button>
        </div>
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
