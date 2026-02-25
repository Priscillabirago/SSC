"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, X, Clock, Info, ExternalLink, Calendar as CalendarIcon, Sparkles, Loader2, Pin, Trash2, AlertCircle, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { StudySession, Task, Subject } from "@/lib/types";
import { formatTime, formatDate, parseBackendDateTime } from "@/lib/utils";
import { usePrepareSession, useUpdateSession, useDeleteSession } from "@/features/schedule/hooks";
import { useTasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast, ToastAction } from "@/components/ui/use-toast";
import { AdjustSessionDialog } from "./adjust-session-dialog";
import { CreateSessionDialog } from "./create-session-dialog";
import { updateSession as updateSessionApi } from "@/features/schedule/api";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useQuickTrack } from "@/contexts/quick-track-context";
import { StartTrackingButton } from "@/components/tracking/start-tracking-button";
import { isSessionMoved, isSessionNew, type ScheduleDiff } from "@/features/schedule/utils/schedule-diff";

interface WeeklyTimelineProps {
  readonly sessions: StudySession[];
  readonly scheduleDiff?: ScheduleDiff | null;
}

function getStatusVariant(status: string): "success" | "outline" | "warning" | "default" {
  if (status === "completed" || status === "partial") {
    return "success";
  }
  if (status === "in_progress") {
    return "default";  // Blue/primary color for active sessions
  }
  if (status === "planned") {
    return "outline";
  }
  return "warning";  // skipped or other
}

// Helper: Get deadline urgency info (overdue, due today, or normal)
function getDeadlineUrgency(deadline: string | null | undefined, isCompleted: boolean): { isOverdue: boolean; isDueToday: boolean; bgClass: string; borderClass: string } {
  if (!deadline || isCompleted) {
    return { isOverdue: false, isDueToday: false, bgClass: "", borderClass: "" };
  }
  
  const deadlineDate = parseBackendDateTime(deadline);
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const deadlineDateOnlyUTC = new Date(Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate()));
  
  if (deadlineDateOnlyUTC < todayUTC) {
    // Overdue - more visible red tint
    return { 
      isOverdue: true, 
      isDueToday: false, 
      bgClass: "bg-red-50/40", 
      borderClass: "border-l-red-400" 
    };
  } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
    // Due today - more visible amber tint
    return { 
      isOverdue: false, 
      isDueToday: true, 
      bgClass: "bg-amber-50/40", 
      borderClass: "border-l-amber-400" 
    };
  }
  
  return { isOverdue: false, isDueToday: false, bgClass: "", borderClass: "" };
}

function getDeadlineTextClass(urgency: { isOverdue: boolean; isDueToday: boolean }): string {
  if (urgency.isOverdue) return "text-red-600 font-medium";
  if (urgency.isDueToday) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}

function getCardClassName(
  isCompleted: boolean,
  deadlineUrgency: { isOverdue: boolean; isDueToday: boolean; bgClass: string; borderClass: string },
  sessionStatus: string,
  wasMoved: boolean,
  isNew: boolean,
): string {
  let cls = "rounded-xl border-l-4 border border-border/60 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer ";
  if (isCompleted) {
    cls += "border-l-green-400 bg-green-50/30";
  } else if (deadlineUrgency.isOverdue) {
    cls += `${deadlineUrgency.borderClass} ${deadlineUrgency.bgClass}`;
  } else if (deadlineUrgency.isDueToday) {
    cls += `${deadlineUrgency.borderClass} ${deadlineUrgency.bgClass}`;
  } else {
    cls += "border-l-purple-400 bg-purple-50/20";
  }
  if (wasMoved) cls += " ring-2 ring-blue-300/50 ring-offset-1";
  else if (isNew) cls += " ring-2 ring-green-300/50 ring-offset-1";
  return cls;
}

export function WeeklyTimeline({ sessions, scheduleDiff }: WeeklyTimelineProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  const updateSession = useUpdateSession();
  const prepareSession = usePrepareSession();
  const deleteSession = useDeleteSession();
  const updateTask = useUpdateTask();
  const { startSession } = useFocusSession();
  const { stopQuickTrack, isActive: isQuickTrackActive, getElapsedTime, getStartTime } = useQuickTrack();
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
  const [preparationData, setPreparationData] = useState<Map<number, { tips: string[]; strategy: string; rationale: string }>>(new Map());
  const [loadingPreparation, setLoadingPreparation] = useState<Set<number>>(new Set());
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [sessionToAdjust, setSessionToAdjust] = useState<StudySession | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);

  const grouped = sessions.reduce<Record<string, StudySession[]>>((acc, session) => {
    // Parse backend datetime (UTC) and format in local time for grouping
    // This ensures sessions are grouped by the user's local day
    const sessionDate = parseBackendDateTime(session.start_time);
    const day = format(sessionDate, "yyyy-MM-dd");
    acc[day] = acc[day] ?? [];
    acc[day].push(session);
    return acc;
  }, {});

  const orderedDays = Object.entries(grouped).sort(([a], [b]) => (a > b ? 1 : -1));

  const toggleSession = (sessionId: number) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleStatusChange = (session: StudySession, newStatus: StudySession["status"]) => {
    const previousStatus = session.status;
    if (previousStatus === newStatus) return;

    updateSession.mutate(
      {
        sessionId: session.id,
        payload: { status: newStatus },
      },
      {
        onSuccess: () => {
          const statusLabels: Record<string, string> = {
            completed: "completed",
            partial: "partial",
            skipped: "skipped",
            planned: "planned",
            in_progress: "in progress",
          };

          toast({
            title: "Session updated",
            description: `Marked as ${statusLabels[newStatus] ?? newStatus}`,
            duration: 6000,
            action: (
              <ToastAction
                altText="Undo status change"
                onClick={() => {
                  updateSession.mutate(
                    {
                      sessionId: session.id,
                      payload: { status: previousStatus },
                    },
                    {
                      onSuccess: () => {
                        toast({
                          title: "Undone",
                          description: `Reverted to ${statusLabels[previousStatus] ?? previousStatus}`,
                        });
                      },
                      onError: () => {
                        toast({
                          variant: "destructive",
                          title: "Undo failed",
                          description: "Could not revert the status. Please try manually.",
                        });
                      },
                    }
                  );
                }}
              >
                Undo
              </ToastAction>
            ),
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Failed to update session",
            description: error.message || "Please try again.",
          });
        },
      }
    );
  };

  const getTaskForSession = (session: StudySession): Task | undefined => {
    if (!session.task_id || !tasks) return undefined;
    return tasks.find((t) => t.id === session.task_id);
  };

  const getSubjectForSession = (session: StudySession): Subject | undefined => {
    if (!session.subject_id || !subjects) return undefined;
    return subjects.find((s) => s.id === session.subject_id);
  };

  const handleDeleteSession = (sessionId: number, sessionFocus: string | null | undefined) => {
    setDeletingSessionId(sessionId);
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        toast({
          title: "Session deleted",
          description: sessionFocus ? `"${sessionFocus}" has been removed.` : "Session has been removed.",
        });
        setDeletingSessionId(null);
        // Collapse the deleted session
        setExpandedSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      },
      onError: (error: Error) => {
        toast({
          variant: "destructive",
          title: "Failed to delete",
          description: error.message || "Please try again.",
        });
        setDeletingSessionId(null);
      },
    });
  };

  const handleFocusSessionStart = (session: StudySession) => {
    const sessionTask = getTaskForSession(session);
    const sessionSubject = getSubjectForSession(session);

    const quickTrackStartTime = sessionTask && isQuickTrackActive(sessionTask.id)
      ? getStartTime(sessionTask.id)
      : null;

    const quickTrackTimeMs = sessionTask && isQuickTrackActive(sessionTask.id)
      ? getElapsedTime(sessionTask.id) * 60 * 1000
      : 0;

    const beginFocus = () => {
      startSession(session, sessionTask || null, sessionSubject || null, quickTrackTimeMs, quickTrackStartTime);
      toast({ title: "Focus session started", description: "Entering focus mode..." });
    };

    if (sessionTask && isQuickTrackActive(sessionTask.id)) {
      const elapsed = stopQuickTrack(sessionTask.id, true);
      const currentTimer = sessionTask.timer_minutes_spent ?? 0;
      updateTask.mutate(
        { id: sessionTask.id, payload: { timer_minutes_spent: currentTimer + elapsed } },
        {
          onSuccess: beginFocus,
          onError: () => {
            toast({
              variant: "destructive",
              title: "Failed to save Quick Track time",
              description: "Could not convert to Focus Mode. Please try again.",
            });
          },
        }
      );
    } else {
      beginFocus();
    }
  };

  const canDeleteSession = (session: StudySession): boolean => {
    // Can only delete planned or skipped sessions that are pinned or manual
    const isPlannedOrSkipped = session.status === "planned" || session.status === "skipped";
    const isPinnedOrManual = session.is_pinned || session.generated_by === "manual";
    return isPlannedOrSkipped && isPinnedOrManual;
  };

  const getPriorityClass = (priority: string): string => {
    if (priority === "critical") return "border-red-300 text-red-700";
    if (priority === "high") return "border-amber-300 text-amber-700";
    if (priority === "medium") return "border-blue-300 text-blue-700";
    return "border-slate-300 text-slate-700";
  };

  // Check if session can be adjusted (any session that's not completed/skipped)
  // In progress sessions can be adjusted (e.g., extend time)
  const canAdjustSession = (session: StudySession): boolean => {
    return session.status === "planned" || session.status === "partial" || session.status === "in_progress";
  };

  const handleGetPreparation = (sessionId: number) => {
    if (preparationData.has(sessionId) || loadingPreparation.has(sessionId)) {
      return; // Already loaded or loading
    }
    
    setLoadingPreparation((prev) => new Set(prev).add(sessionId));
    prepareSession.mutate(sessionId, {
      onSuccess: (data) => {
        setPreparationData((prev) => {
          const next = new Map(prev);
          next.set(sessionId, data);
          return next;
        });
        setLoadingPreparation((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load suggestions",
          description: "Please try again later.",
        });
        setLoadingPreparation((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    });
  };

  const renderPreparationData = (sessionId: number) => {
    if (!preparationData.has(sessionId)) return null;
    const prep = preparationData.get(sessionId)!;
    // Only hide if explicitly a simple task with no tips
    if (prep.tips.length === 0 && (prep.strategy === "Quick Task" || prep.strategy === "General Task")) {
      return (
        <p className="text-xs text-muted-foreground italic">
          {prep.rationale || "This task doesn't require special preparation tips."}
        </p>
      );
    }
    if (prep.tips.length === 0) {
      return null;
    }
    return (
      <div className="space-y-2.5">
        <div className="rounded-lg bg-purple-50/40 border border-purple-200/40 p-3 space-y-1.5">
          <Badge variant="outline" className="text-[10px] h-4 px-2 border-purple-300/60 text-purple-700 bg-purple-100/50">
            {prep.strategy}
          </Badge>
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            {prep.rationale}
          </p>
        </div>
        <div className="space-y-1.5 pl-1">
          {prep.tips.map((tip) => (
            <div key={`${sessionId}-${tip.substring(0, 20)}`} className="flex items-start gap-2 text-xs">
              <span className="text-purple-500 mt-1 h-1 w-1 rounded-full flex-shrink-0" />
              <span className="text-foreground flex-1 leading-relaxed">{tip}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Weekly plan</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Study Sessions</p>
                  <p className="text-xs">
                    These are time blocks automatically created from your tasks. Click the arrow to see details, or check the box to mark as complete.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CreateSessionDialog />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px] pr-4">
          {orderedDays.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">No sessions scheduled</p>
              <p className="text-xs text-muted-foreground mb-4">
                {(tasks?.filter(t => !t.is_completed && !t.is_recurring_template).length ?? 0) > 0
                  ? "Hit \"Generate week\" above to create your study plan."
                  : "Add some tasks first, then generate your schedule."}
              </p>
              {(tasks?.filter(t => !t.is_completed && !t.is_recurring_template).length ?? 0) === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/tasks")}
                  className="gap-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Go to Tasks
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {orderedDays.map(([day, daySessions]) => {
                const completedCount = daySessions.filter((session) => session.status === "completed").length;
                const totalCount = daySessions.length;
                const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
                const isToday = format(parseISO(day), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                
                return (
                <div key={day} className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                          {format(parseISO(day), "EEEE, MMM d")}
                        </p>
                        {isToday && (
                          <Badge variant="outline" className="text-xs h-5 px-2 bg-primary/10 border-primary/20 text-primary">
                            Today
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-xs h-5 px-2 ${progressPercent === 100 ? "bg-green-50 border-green-200 text-green-700" : ""}`}>
                        {completedCount} / {totalCount} completed
                      </Badge>
                    </div>
                    {totalCount > 0 && (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${progressPercent === 100 ? "bg-green-500" : "bg-primary"}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                <div className="grid gap-3">
                  {daySessions
                    .toSorted(
                      (a, b) =>
                        Number(new Date(a.start_time)) - Number(new Date(b.start_time))
                    )
                    .map((session) => {
                      const task = getTaskForSession(session);
                      const subject = getSubjectForSession(session);
                      const isExpanded = expandedSessions.has(session.id);
                      const duration = Math.round(
                        (parseBackendDateTime(session.end_time).getTime() - parseBackendDateTime(session.start_time).getTime()) / 60000
                      );

                      const isCompleted = session.status === "completed";
                      const deadlineUrgency = getDeadlineUrgency(task?.deadline || null, isCompleted);
                      const wasMoved = isSessionMoved(session, scheduleDiff || null) && !isCompleted;
                      const isNew = isSessionNew(session, scheduleDiff || null) && !isCompleted;
                      const cardClassName = getCardClassName(isCompleted, deadlineUrgency, session.status, wasMoved, isNew);
                      
                      return (
                        <div
                          key={session.id}
                          className={cardClassName}
                        >
                          <button
                            type="button"
                            className="flex items-start justify-between px-4 py-3 gap-3 w-full text-left bg-transparent border-0 p-0 cursor-pointer"
                            onClick={(e) => {
                              // Don't toggle if clicking checkbox or nested button
                              if ((e.target as HTMLElement).closest('button:not([type="button"]), input[type="checkbox"]')) {
                                return;
                              }
                              toggleSession(session.id);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} session details for ${task?.title || subject?.name || session.focus || "study session"}`}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="mt-0.5 flex-shrink-0">
                                      <Checkbox
                                        checked={isCompleted}
                                        onCheckedChange={(checked) => {
                                          handleStatusChange(session, checked ? "completed" : "planned");
                                        }}
                                        className="h-4 w-4"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Mark this session as completed</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <div className="flex-1 min-w-0">
                                <div className="space-y-1.5 mb-1.5">
                                  <p className="text-sm font-semibold text-foreground break-words leading-relaxed">
                                    {task?.title || subject?.name || session.focus || "Study session"}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {subject && (
                                      <Badge variant="outline" className="text-xs h-5 px-2 shrink-0">
                                        <span
                                          className="inline-block h-2 w-2 rounded-full mr-1.5"
                                          style={{ backgroundColor: subject.color }}
                                        />
                                        {subject.name}
                                      </Badge>
                                    )}
                                    {task && (task.priority === "high" || task.priority === "critical") && (
                                      <Badge variant="outline" className={`text-xs h-5 px-2 shrink-0 ${getPriorityClass(task.priority)}`}>
                                        {task.priority}
                                      </Badge>
                                    )}
                                    {wasMoved && !isCompleted && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-xs h-5 px-2 shrink-0 border-blue-300 text-blue-700 bg-blue-50/50">
                                              <Clock className="h-3 w-3 mr-1" />
                                              Moved
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>This session was rescheduled</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {isNew && !isCompleted && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-xs h-5 px-2 shrink-0 border-green-300 text-green-700 bg-green-50/50">
                                              <Plus className="h-3 w-3 mr-1" />
                                              New
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>This is a new session</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 text-foreground font-medium">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>
                                      {formatTime(session.start_time)} – {formatTime(session.end_time)}
                                    </span>
                                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal ml-1">
                                      {duration}m
                                    </Badge>
                                  </div>
                                  {task?.deadline && (
                                    <>
                                      <span className="text-muted-foreground/40">•</span>
                                      <span className={`flex items-center gap-1 ${getDeadlineTextClass(deadlineUrgency)}`}>
                                        {deadlineUrgency.isOverdue && <AlertCircle className="h-3 w-3" />}
                                        {deadlineUrgency.isDueToday && <Clock className="h-3 w-3" />}
                                        Due {formatDate(task.deadline)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {session.is_pinned && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Pin className="h-3.5 w-3.5 text-purple-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Pinned - won't be deleted on regeneration</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <Badge 
                                variant={getStatusVariant(session.status)}
                                className={`text-xs h-5 px-2 ${
                                  isCompleted ? "bg-green-100 text-green-700 border-green-200" : ""
                                }`}
                              >
                                {session.status}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSession(session.id);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </button>
                          
                          {/* Expanded Session Details */}
                          {isExpanded && (
                            <div className="border-t border-border/40 px-4 py-3.5 bg-slate-50/30 space-y-3.5">
                              {/* Session Actions */}
                              <div className="flex items-center gap-2 pb-3 border-b border-border/30">
                                {session.status === "planned" && (
                                  <StartTrackingButton
                                    task={getTaskForSession(session)}
                                    session={session}
                                    subject={getSubjectForSession(session)}
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs"
                                    showQuickTrack={false}
                                    onFocusSessionStart={() => handleFocusSessionStart(session)}
                                  />
                                )}
                                {canAdjustSession(session) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => {
                                      setSessionToAdjust(session);
                                      setAdjustDialogOpen(true);
                                    }}
                                  >
                                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                                    Adjust
                                  </Button>
                                )}
                                {task && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => router.push("/tasks")}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    Edit Task
                                  </Button>
                                )}
                                {canDeleteSession(session) && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                        disabled={deletingSessionId === session.id}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                        {deletingSessionId === session.id ? "Deleting..." : "Delete"}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will permanently remove "{session.focus || "this session"}" from your schedule. This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeleteSession(session.id, session.focus)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                              
                              {task && (
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-foreground">Task Details</p>
                                    <Badge variant="outline" className="text-xs h-5 px-2">
                                      {task.estimated_minutes} min estimated
                                    </Badge>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
                                  )}
                                  {task.subtasks && task.subtasks.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-medium text-foreground">Subtasks:</p>
                                      <div className="space-y-1 pl-1">
                                        {task.subtasks.map((subtask) => (
                                          <div
                                            key={subtask.id}
                                            className={`text-xs flex items-center gap-2 ${
                                              subtask.completed
                                                ? "line-through text-muted-foreground"
                                                : "text-foreground"
                                            }`}
                                          >
                                            <span className="h-1 w-1 rounded-full bg-current mt-0.5 flex-shrink-0" />
                                            <span className="flex-1">{subtask.title}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* AI Preparation Suggestions - Context-aware for all tasks */}
                              <div className="space-y-2.5 pt-2.5 border-t border-border/30">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                                    <p className="text-xs font-semibold text-foreground">
                                      {subject || task?.subject_id ? "AI Study Tips" : "AI Tips"}
                                    </p>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="text-xs">
                                            {subject || task?.subject_id
                                              ? "Get personalized, research-backed study strategies tailored to this academic session. Based on cognitive science methods like active recall, spaced repetition, and Pomodoro technique."
                                              : "Get personalized productivity tips tailored to this task. Tips are context-aware and only provided when helpful."}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  {!preparationData.has(session.id) && !loadingPreparation.has(session.id) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => handleGetPreparation(session.id)}
                                    >
                                      Get Tips
                                    </Button>
                                  )}
                                </div>
                                
                                {loadingPreparation.has(session.id) && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Generating personalized tips...</span>
                                  </div>
                                )}
                                
                                {renderPreparationData(session.id)}
                              </div>
                              
                              {/* Status Actions */}
                              <div className="flex items-center gap-2 pt-2.5 border-t border-border/30">
                                <p className="text-xs font-medium text-muted-foreground">Mark as:</p>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => handleStatusChange(session, "completed")}
                                        disabled={session.status === "completed" || updateSession.isPending}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                        Complete
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Mark as fully completed</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleStatusChange(session, "partial")}
                                  disabled={session.status === "partial" || updateSession.isPending}
                                >
                                  Partial
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => handleStatusChange(session, "skipped")}
                                  disabled={session.status === "skipped" || updateSession.isPending}
                                >
                                  <X className="h-3.5 w-3.5 mr-1.5" />
                                  Skip
                                </Button>
                                {session.status !== "planned" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs ml-auto"
                                          onClick={() => handleStatusChange(session, "planned")}
                                          disabled={updateSession.isPending}
                                        >
                                          Reset
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Reset back to planned status</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
              );
              })}
          </div>
          )}
        </ScrollArea>
      </CardContent>
      
      {/* Unified Adjust Session Dialog */}
      {sessionToAdjust && (
        <AdjustSessionDialog
          session={sessionToAdjust}
          open={adjustDialogOpen}
          onOpenChange={(open) => {
            setAdjustDialogOpen(open);
            if (!open) {
              setSessionToAdjust(null);
            }
          }}
          onAdjust={async (sessionId, startTime, endTime) => {
            await updateSessionApi(sessionId, {
              start_time: startTime,
              end_time: endTime,
            });
            queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
          }}
          onFinishEarly={async (sessionId, endTime, markAs) => {
            await updateSessionApi(sessionId, {
              end_time: endTime,
              status: markAs,
            });
            queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }}
          onFullReschedule={async (sessionId, startTime, endTime) => {
            await updateSessionApi(sessionId, {
              start_time: startTime,
              end_time: endTime,
            });
            queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
          }}
        />
      )}
    </Card>
  );
}

