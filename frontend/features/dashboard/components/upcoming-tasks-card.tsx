"use client";

import { useMemo } from "react";
import { ArrowRight, Calendar, Clock, Info, Play, CheckCircle2, XCircle, AlertCircle, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudySession } from "@/lib/types";
import { formatTime, parseBackendDateTime } from "@/lib/utils";
import { StartTrackingButton } from "@/components/tracking/start-tracking-button";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useQuickTrack } from "@/contexts/quick-track-context";
import { useTasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";

interface TodayPlanCardProps {
  readonly todaySessions: StudySession[];
  readonly urgentTasksCount?: number;
}

type SessionGroup = "in_progress" | "upcoming" | "completed" | "missed";

function getSessionGroup(session: StudySession): SessionGroup {
  const now = new Date();
  const endTime = parseBackendDateTime(session.end_time);
  
  if (session.status === "in_progress") return "in_progress";
  if (session.status === "completed" || session.status === "partial") return "completed";
  if (session.status === "skipped") return "missed";
  
  // For planned sessions, check if they're in the past
  if (session.status === "planned" && endTime < now) return "missed";
  
  return "upcoming";
}

function getGroupOrder(group: SessionGroup): number {
  const order: Record<SessionGroup, number> = {
    in_progress: 0,
    upcoming: 1,
    completed: 2,
    missed: 3,
  };
  return order[group];
}

export function TodayPlanCard({ todaySessions, urgentTasksCount = 0 }: TodayPlanCardProps) {
  const router = useRouter();
  const { startSession } = useFocusSession();
  const { stopQuickTrack, isActive: isQuickTrackActive, getElapsedTime, getStartTime } = useQuickTrack();
  const updateTask = useUpdateTask();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  
  // Group and sort sessions
  const { groupedSessions, counts, progress } = useMemo(() => {
    const groups: Record<SessionGroup, StudySession[]> = {
      in_progress: [],
      upcoming: [],
      completed: [],
      missed: [],
    };
    
    for (const session of todaySessions) {
      const group = getSessionGroup(session);
      groups[group].push(session);
    }
    
    // Sort each group by start time
    for (const group of Object.values(groups)) {
      group.sort((a, b) => 
        parseBackendDateTime(a.start_time).getTime() - parseBackendDateTime(b.start_time).getTime()
      );
    }
    
    const completedCount = groups.completed.length;
    const totalCount = todaySessions.length;
    const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    
    return {
      groupedSessions: groups,
      counts: {
        in_progress: groups.in_progress.length,
        upcoming: groups.upcoming.length,
        completed: completedCount,
        missed: groups.missed.length,
        total: totalCount,
      },
      progress: progressPercent,
    };
  }, [todaySessions]);

  const getTaskForSession = (session: StudySession) => {
    if (!session.task_id || !tasks) return null;
    return tasks.find((t) => t.id === session.task_id) || null;
  };

  const getSubjectForSession = (session: StudySession) => {
    if (!session.subject_id || !subjects) return null;
    return subjects.find((s) => s.id === session.subject_id) || null;
  };

  // Calculate overdue tasks (ALL overdue tasks, not completed, not already in today's sessions)
  const overdueTasks = useMemo(() => {
    if (!tasks) return [];
    
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    // Get task IDs that are already in today's sessions
    const tasksInTodaySessions = new Set(
      todaySessions
        .map(s => s.task_id)
        .filter((id): id is number => id !== null && id !== undefined)
    );
    
    return tasks
      .filter(task => {
        // Must have deadline, not completed, and not already in today's sessions
        if (!task.deadline || task.is_completed || tasksInTodaySessions.has(task.id)) {
          return false;
        }
        
        // Parse deadline and compare using UTC date components
        const deadlineDate = parseBackendDateTime(task.deadline);
        const deadlineDateOnlyUTC = new Date(
          Date.UTC(
            deadlineDate.getUTCFullYear(),
            deadlineDate.getUTCMonth(),
            deadlineDate.getUTCDate()
          )
        );
        
        // Include if deadline is before today (overdue)
        return deadlineDateOnlyUTC < todayUTC;
      })
      .sort((a, b) => {
        // Sort by deadline (most overdue first)
        const deadlineA = parseBackendDateTime(a.deadline!);
        const deadlineB = parseBackendDateTime(b.deadline!);
        const deadlineAUTC = new Date(
          Date.UTC(
            deadlineA.getUTCFullYear(),
            deadlineA.getUTCMonth(),
            deadlineA.getUTCDate()
          )
        );
        const deadlineBUTC = new Date(
          Date.UTC(
            deadlineB.getUTCFullYear(),
            deadlineB.getUTCMonth(),
            deadlineB.getUTCDate()
          )
        );
        
        return deadlineAUTC.getTime() - deadlineBUTC.getTime();
      });
  }, [tasks, todaySessions]);

  // Calculate due soon tasks (due today or tomorrow, not completed, not already in today's sessions)
  const dueSoonTasks = useMemo(() => {
    if (!tasks) return [];
    
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
    const dayAfterTomorrowUTC = new Date(tomorrowUTC);
    dayAfterTomorrowUTC.setUTCDate(dayAfterTomorrowUTC.getUTCDate() + 1);
    
    // Get task IDs that are already in today's sessions
    const tasksInTodaySessions = new Set(
      todaySessions
        .map(s => s.task_id)
        .filter((id): id is number => id !== null && id !== undefined)
    );
    
    return tasks
      .filter(task => {
        // Must have deadline, not completed, and not already in today's sessions
        if (!task.deadline || task.is_completed || tasksInTodaySessions.has(task.id)) {
          return false;
        }
        
        // Parse deadline and compare using UTC date components
        const deadlineDate = parseBackendDateTime(task.deadline);
        const deadlineDateOnlyUTC = new Date(
          Date.UTC(
            deadlineDate.getUTCFullYear(),
            deadlineDate.getUTCMonth(),
            deadlineDate.getUTCDate()
          )
        );
        
        // Include if deadline is today or tomorrow (but not overdue)
        return deadlineDateOnlyUTC >= todayUTC && deadlineDateOnlyUTC < dayAfterTomorrowUTC;
      })
      .sort((a, b) => {
        // Sort by deadline (due today first, then tomorrow)
        const deadlineA = parseBackendDateTime(a.deadline!);
        const deadlineB = parseBackendDateTime(b.deadline!);
        const deadlineAUTC = new Date(
          Date.UTC(
            deadlineA.getUTCFullYear(),
            deadlineA.getUTCMonth(),
            deadlineA.getUTCDate()
          )
        );
        const deadlineBUTC = new Date(
          Date.UTC(
            deadlineB.getUTCFullYear(),
            deadlineB.getUTCMonth(),
            deadlineB.getUTCDate()
          )
        );
        
        return deadlineAUTC.getTime() - deadlineBUTC.getTime();
      });
  }, [tasks, todaySessions]);

  // Helper to get deadline urgency and styling
  const getDeadlineUrgency = (deadline: string) => {
    const deadlineDate = parseBackendDateTime(deadline);
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const deadlineDateOnlyUTC = new Date(
      Date.UTC(
        deadlineDate.getUTCFullYear(),
        deadlineDate.getUTCMonth(),
        deadlineDate.getUTCDate()
      )
    );
    
    if (deadlineDateOnlyUTC < todayUTC) {
      // Calculate days overdue
      const daysOverdue = Math.floor((todayUTC.getTime() - deadlineDateOnlyUTC.getTime()) / (1000 * 60 * 60 * 24));
      const label = daysOverdue === 1 ? "Overdue by 1 day" : `Overdue by ${daysOverdue} days`;
      return { type: "overdue", label, className: "text-red-600 font-medium" };
    } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
      return { type: "today", label: "Due today", className: "text-amber-600 font-medium" };
    } else {
      const daysUntil = Math.floor((deadlineDateOnlyUTC.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24));
      return { type: "soon", label: `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, className: "text-muted-foreground" };
    }
  };

  // Helper to get session deadline indicator (only for deadlines within 5 days)
  const getSessionDeadlineInfo = (session: StudySession) => {
    const sessionTask = getTaskForSession(session);
    if (!sessionTask?.deadline) return null;
    
    const deadlineDate = parseBackendDateTime(sessionTask.deadline);
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const deadlineDateOnlyUTC = new Date(
      Date.UTC(
        deadlineDate.getUTCFullYear(),
        deadlineDate.getUTCMonth(),
        deadlineDate.getUTCDate()
      )
    );
    
    const daysUntil = Math.floor((deadlineDateOnlyUTC.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24));
    
    // Only show if deadline is within 5 days (including overdue and today)
    if (daysUntil <= 5) {
      // Continue processing
    } else {
      return null;
    }
    
    if (deadlineDateOnlyUTC < todayUTC) {
      return { type: "overdue", label: "Overdue", className: "text-red-600 font-medium" };
    } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
      return { type: "today", label: "Due today", className: "text-amber-600 font-medium" };
    } else {
      return { type: "soon", label: `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, className: "text-muted-foreground" };
    }
  };

  // Track which tasks have already shown their deadline (to avoid duplication)
  // Map of task_id -> session_id for the first session that should show the deadline
  const firstSessionForTaskDeadline = useMemo(() => {
    const firstSessionMap = new Map<number, number>();
    const seenTasks = new Set<number>();
    
    // Sort sessions by start time to process in chronological order
    const sortedSessions = [...todaySessions].sort((a, b) => 
      parseBackendDateTime(a.start_time).getTime() - parseBackendDateTime(b.start_time).getTime()
    );
    
    // Process sessions in order and mark first occurrence of each task
    for (const session of sortedSessions) {
      if (session.task_id && !seenTasks.has(session.task_id)) {
        // Check if this task has a deadline within 5 days
        const sessionTask = tasks?.find((t) => t.id === session.task_id);
        if (sessionTask?.deadline) {
          const deadlineDate = parseBackendDateTime(sessionTask.deadline);
          const now = new Date();
          const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          const deadlineDateOnlyUTC = new Date(
            Date.UTC(
              deadlineDate.getUTCFullYear(),
              deadlineDate.getUTCMonth(),
              deadlineDate.getUTCDate()
            )
          );
          const daysUntil = Math.floor((deadlineDateOnlyUTC.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24));
          
          // Only show if deadline is within 5 days (including overdue and today)
          if (daysUntil <= 5) {
            firstSessionMap.set(session.task_id, session.id);
          }
        }
        seenTasks.add(session.task_id);
      }
    }
    
    return firstSessionMap;
  }, [todaySessions, tasks]);

  // Get styling for session based on its group
  const getSessionStyles = (group: SessionGroup) => {
    switch (group) {
      case "in_progress":
        return "border-blue-300 bg-blue-50/80 ring-1 ring-blue-200";
      case "upcoming":
        return "border-border/50 bg-white/60 hover:bg-white/80";
      case "completed":
        return "border-green-200 bg-green-50/50 opacity-75";
      case "missed":
        return "border-orange-200 bg-orange-50/30 opacity-60";
    }
  };

  const getStatusBadge = (session: StudySession, group: SessionGroup) => {
    switch (group) {
      case "in_progress":
        return (
          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">
            <Play className="h-2.5 w-2.5 mr-1" />
            in progress
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
            {session.status === "partial" ? "partial" : "completed"}
          </Badge>
        );
      case "missed":
        return (
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
            <XCircle className="h-2.5 w-2.5 mr-1" />
            {session.status === "skipped" ? "skipped" : "missed"}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            planned
          </Badge>
        );
    }
  };

  const renderSession = (session: StudySession) => {
    const sessionTask = getTaskForSession(session);
    const sessionSubject = getSubjectForSession(session);
    const group = getSessionGroup(session);
    const canStart = group === "upcoming";
    
    // Get deadline info only if this is the first session for this task today
    const shouldShowDeadline = sessionTask?.id && firstSessionForTaskDeadline.get(sessionTask.id) === session.id;
    const deadlineInfo = shouldShowDeadline ? getSessionDeadlineInfo(session) : null;

    return (
      <div
        key={session.id}
        className={`rounded-xl border px-4 py-3 text-sm transition-colors ${getSessionStyles(group)}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className={`font-medium truncate ${group === "missed" ? "text-muted-foreground" : "text-foreground"}`}>
              {formatTime(session.start_time)} – {formatTime(session.end_time)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canStart && (
              <StartTrackingButton
                task={sessionTask}
                session={session}
                subject={sessionSubject}
                variant="default"
                size="sm"
                className="h-6 text-xs px-2"
                showQuickTrack={false}
                onFocusSessionStart={() => {
                  const quickTrackStartTime = sessionTask && isQuickTrackActive(sessionTask.id)
                    ? getStartTime(sessionTask.id)
                    : null;
                  const quickTrackTimeMs = sessionTask && isQuickTrackActive(sessionTask.id)
                    ? getElapsedTime(sessionTask.id) * 60 * 1000
                    : 0;
                  const startFocusMode = () => {
                    startSession(session, sessionTask, sessionSubject, quickTrackTimeMs, quickTrackStartTime);
                    toast({
                      title: "Focus session started",
                      description: "Entering focus mode...",
                    });
                  };
                  if (sessionTask && isQuickTrackActive(sessionTask.id)) {
                    const elapsed = stopQuickTrack(sessionTask.id, true);
                    const currentTimer = sessionTask.timer_minutes_spent ?? 0;
                    updateTask.mutate(
                      { id: sessionTask.id, payload: { timer_minutes_spent: currentTimer + elapsed } },
                      {
                        onSuccess: () => startFocusMode(),
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
                    startFocusMode();
                  }
                }}
              />
            )}
            {getStatusBadge(session, group)}
          </div>
        </div>
        <div className="ml-6">
          <p className={`text-xs break-words leading-relaxed ${group === "missed" ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
          {session.focus || session.generated_by || "Study session"}
            {deadlineInfo && (
              <>
                <span className="text-muted-foreground/40 mx-1.5">•</span>
                <span className={`flex items-center gap-1 ${deadlineInfo.className}`}>
                  {deadlineInfo.type === "overdue" && <AlertCircle className="h-3 w-3" />}
                  {deadlineInfo.type === "today" && <Clock className="h-3 w-3" />}
                  {deadlineInfo.label}
                </span>
              </>
            )}
        </p>
        </div>
      </div>
    );
  };

  // Combine all sessions in display order
  const orderedSessions = [
    ...groupedSessions.in_progress,
    ...groupedSessions.upcoming,
    ...groupedSessions.completed,
    ...groupedSessions.missed,
  ];

  // Calculate next upcoming session (first chronologically, not currently happening)
  const nextUpcomingSession = useMemo(() => {
    // Only show if no session is in progress (status-wise)
    if (counts.in_progress > 0) return null;
    
    // Get the first upcoming session (already sorted by start time)
    if (groupedSessions.upcoming.length === 0) return null;
    
    const nextSession = groupedSessions.upcoming[0];
    const now = new Date();
    const sessionStart = parseBackendDateTime(nextSession.start_time);
    const sessionEnd = parseBackendDateTime(nextSession.end_time);
    
    // Don't show if current time is within the session's time range
    // (even if it hasn't been started yet, it's currently happening)
    if (now >= sessionStart && now <= sessionEnd) {
      return null;
    }
    
    // Only show if the session hasn't started yet (current time is before session start)
    if (now < sessionStart) {
      return nextSession;
    }
    
    return null;
  }, [groupedSessions.upcoming, counts.in_progress]);

  // Get task and subject for next session
  const nextSessionTask = nextUpcomingSession ? getTaskForSession(nextUpcomingSession) : null;
  const nextSessionSubject = nextUpcomingSession ? getSubjectForSession(nextUpcomingSession) : null;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Today&apos;s Plan
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Your scheduled study sessions for today. Complete them to build your streak and improve adherence.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {counts.total > 0 && (
            <Badge variant="outline" className="text-xs">
              {counts.completed}/{counts.total} completed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {todaySessions.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No sessions scheduled today</p>
            <p className="text-xs text-muted-foreground mb-4">
              Generate a schedule to see your study plan here.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/schedule")}
              className="gap-2"
            >
              <ArrowRight className="h-3 w-3" />
              Go to Schedule
            </Button>
          </div>
        ) : (
          <>
            {/* Progress bar with breakdown */}
            {counts.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <div className="flex items-center gap-2">
                    {counts.in_progress > 0 && (
                      <span className="text-blue-600">{counts.in_progress} active</span>
                    )}
                    {counts.upcoming > 0 && (
                      <span className="text-muted-foreground">{counts.upcoming} remaining</span>
                    )}
                    {counts.missed > 0 && (
                      <span className="text-orange-500">{counts.missed} missed</span>
                    )}
                    <span className="font-medium text-foreground">{Math.round(progress)}%</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  {/* Completed portion */}
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${(counts.completed / counts.total) * 100}%` }}
                  />
                  {/* In progress portion */}
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(counts.in_progress / counts.total) * 100}%` }}
                  />
                  {/* Missed portion (shown in orange) */}
                  <div
                    className="h-full bg-orange-300 transition-all duration-300"
                    style={{ width: `${(counts.missed / counts.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            
            {/* Start Next Session button - only show when there's an upcoming session and no session in progress */}
            {nextUpcomingSession && (
              <Button
                onClick={() => {
                  const quickTrackStartTime = nextSessionTask && isQuickTrackActive(nextSessionTask.id)
                    ? getStartTime(nextSessionTask.id)
                    : null;
                  const quickTrackTimeMs = nextSessionTask && isQuickTrackActive(nextSessionTask.id)
                    ? getElapsedTime(nextSessionTask.id) * 60 * 1000
                    : 0;
                  const startFocusMode = () => {
                    startSession(nextUpcomingSession, nextSessionTask, nextSessionSubject, quickTrackTimeMs, quickTrackStartTime);
                    toast({
                      title: "Focus session started",
                      description: "Entering focus mode...",
                    });
                  };
                  if (nextSessionTask && isQuickTrackActive(nextSessionTask.id)) {
                    const elapsed = stopQuickTrack(nextSessionTask.id, true);
                    const currentTimer = nextSessionTask.timer_minutes_spent ?? 0;
                    updateTask.mutate(
                      { id: nextSessionTask.id, payload: { timer_minutes_spent: currentTimer + elapsed } },
                      {
                        onSuccess: () => startFocusMode(),
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
                    startFocusMode();
                  }
                }}
                className="w-full gap-2 h-10 text-sm font-medium"
                size="lg"
              >
                <PlayCircle className="h-4 w-4" />
                <span>Start Next Session</span>
                <span className="text-xs opacity-80 ml-1">
                  ({formatTime(nextUpcomingSession.start_time)})
                </span>
              </Button>
            )}
            
            {/* Overdue section - only show if there are overdue tasks */}
            {overdueTasks.length > 0 && (
              <div className="rounded-lg border border-red-200/50 bg-red-50/30 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-xs font-semibold text-foreground">
                      Overdue {overdueTasks.length > 2 && `(${overdueTasks.length})`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs text-primary hover:text-primary/80"
                    onClick={() => router.push("/tasks")}
                  >
                    View all
                  </Button>
                </div>
                <div className="space-y-1">
                  {overdueTasks.slice(0, 2).map((task) => {
                    const urgency = getDeadlineUrgency(task.deadline!);
                    const taskSubject = subjects?.find(s => s.id === task.subject_id);
                    return (
                      <button
                        type="button"
                        key={task.id}
                        className="flex items-start gap-2 text-xs cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
                        onClick={() => router.push("/tasks")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push("/tasks");
                          }
                        }}
                      >
                        <span className="text-muted-foreground/60 mt-0.5">•</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground truncate block">
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={urgency.className}>
                              {urgency.label}
                            </span>
                            {taskSubject && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <span
                                  className="inline-flex items-center gap-1"
                                  style={{ color: taskSubject.color }}
                                >
                                  <span
                                    className="inline-block h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: taskSubject.color }}
                                  />
                                  <span className="text-muted-foreground">{taskSubject.name}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Due Soon section - tasks due today or tomorrow */}
            {dueSoonTasks.length > 0 && (
              <div className="rounded-lg border border-amber-200/50 bg-amber-50/30 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs font-semibold text-foreground">
                      Due Soon {dueSoonTasks.length > 2 && `(${dueSoonTasks.length})`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs text-primary hover:text-primary/80"
                    onClick={() => router.push("/tasks")}
                  >
                    View all
                  </Button>
                </div>
                <div className="space-y-1">
                  {dueSoonTasks.slice(0, 2).map((task) => {
                    const urgency = getDeadlineUrgency(task.deadline!);
                    const taskSubject = subjects?.find(s => s.id === task.subject_id);
                    return (
                      <button
                        type="button"
                        key={task.id}
                        className="flex items-start gap-2 text-xs cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
                        onClick={() => router.push("/tasks")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push("/tasks");
                          }
                        }}
                      >
                        <span className="text-muted-foreground/60 mt-0.5">•</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground truncate block">
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={urgency.className}>
                              {urgency.label}
                            </span>
                            {taskSubject && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <span
                                  className="inline-flex items-center gap-1"
                                  style={{ color: taskSubject.color }}
                                >
                                  <span
                                    className="inline-block h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: taskSubject.color }}
                                  />
                                  <span className="text-muted-foreground">{taskSubject.name}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Sessions list */}
            <div className="space-y-2">
              {orderedSessions.map(renderSession)}
            </div>
          </>
        )}
      </CardContent>
      {todaySessions.length > 0 && (
        <CardFooter>
          <Link href="/schedule" className="flex items-center gap-2 text-sm text-primary hover:underline">
            View full weekly schedule
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

