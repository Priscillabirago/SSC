"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, X, Clock, Info, ExternalLink, Calendar as CalendarIcon, Sparkles, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudySession, Task, Subject } from "@/lib/types";
import { formatTime, formatDate, parseBackendDateTime } from "@/lib/utils";
import { usePrepareSession, useUpdateSession } from "@/features/schedule/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";
import { AdjustSessionDialog } from "./adjust-session-dialog";
import { updateSession as updateSessionApi } from "@/features/schedule/api";
import { useQueryClient } from "@tanstack/react-query";

interface WeeklyTimelineProps {
  readonly sessions: StudySession[];
}

function getStatusVariant(status: string): "success" | "outline" | "warning" {
  if (status === "completed") {
    return "success";
  }
  if (status === "planned") {
    return "outline";
  }
  return "warning";
}

export function WeeklyTimeline({ sessions }: WeeklyTimelineProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  const updateSession = useUpdateSession();
  const prepareSession = usePrepareSession();
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
  const [preparationData, setPreparationData] = useState<Map<number, { tips: string[]; strategy: string; rationale: string }>>(new Map());
  const [loadingPreparation, setLoadingPreparation] = useState<Set<number>>(new Set());
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [sessionToAdjust, setSessionToAdjust] = useState<StudySession | null>(null);

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
    updateSession.mutate(
      {
        sessionId: session.id,
        payload: { status: newStatus },
      },
      {
        onSuccess: () => {
          toast({
            title: "Session updated",
            description: `Marked as ${newStatus}`,
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

  const getPriorityClass = (priority: string): string => {
    if (priority === "critical") return "border-red-300 text-red-700";
    if (priority === "high") return "border-amber-300 text-amber-700";
    if (priority === "medium") return "border-blue-300 text-blue-700";
    return "border-slate-300 text-slate-700";
  };

  // Check if session is late (current time > start time but < end time)
  // Check if session can be adjusted (any session that's not completed/skipped)
  const canAdjustSession = (session: StudySession): boolean => {
    return session.status === "planned" || session.status === "partial";
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
      <div className="space-y-2">
        <div className="rounded-lg bg-purple-50/50 border border-purple-200/50 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] h-4 border-purple-300 text-purple-700 bg-purple-100">
              {prep.strategy}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            {prep.rationale}
          </p>
        </div>
        <div className="space-y-1 pl-1">
          {prep.tips.map((tip) => (
            <div key={`${sessionId}-${tip.substring(0, 20)}`} className="flex items-start gap-2 text-xs">
              <span className="text-purple-500 mt-0.5">•</span>
              <span className="text-foreground flex-1">{tip}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
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
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px] pr-4">
          {orderedDays.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">No sessions scheduled</p>
              <p className="text-xs text-muted-foreground mb-4">
                Generate a schedule from your tasks to see your study plan here.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/tasks")}
                className="gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                Go to Tasks
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {orderedDays.map(([day, daySessions]) => (
              <div key={day} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {format(parseISO(day), "EEEE, MMM d")}
                  </p>
                  <Badge variant="outline">
                    {daySessions.filter((session) => session.status === "completed").length} /{" "}
                    {daySessions.length} completed
                  </Badge>
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

                      return (
                        <div
                          key={session.id}
                          className="rounded-xl border-l-4 border-l-purple-400 border border-border/70 bg-gradient-to-r from-purple-50/30 to-white/70 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3 flex-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Checkbox
                                      checked={session.status === "completed"}
                                      onCheckedChange={(checked) => {
                                        handleStatusChange(session, checked ? "completed" : "planned");
                                      }}
                                      className="h-4 w-4"
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Mark this session as completed</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-3.5 w-3.5 text-purple-500" />
                                  <p className="text-sm font-semibold text-foreground">
                                    {task?.title || subject?.name || session.focus || "Study session"}
                                  </p>
                                  {subject && (
                                    <Badge variant="outline" className="text-xs h-5">
                                      <span
                                        className="inline-block h-2 w-2 rounded-full mr-1"
                                        style={{ backgroundColor: subject.color }}
                                      />
                                      {subject.name}
                                    </Badge>
                                  )}
                                  {task && (
                                    <Badge variant="outline" className={`text-xs h-5 ${getPriorityClass(task.priority)}`}>
                                      {task.priority}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    {formatTime(session.start_time)} – {formatTime(session.end_time)} ({duration} min)
                                  </span>
                                  {task?.deadline && (
                                    <>
                                      <span>•</span>
                                      <span className={new Date(task.deadline) < new Date() ? "text-red-600 font-medium" : ""}>
                                        Due {formatDate(task.deadline)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={getStatusVariant(session.status)}>
                                {session.status}
                              </Badge>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => toggleSession(session.id)}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{isExpanded ? "Hide" : "Show"} session details</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          
                          {/* Expanded Session Details */}
                          {isExpanded && (
                            <div className="border-t border-border/50 px-4 py-3 bg-slate-50/50 space-y-3">
                              {/* Session Actions */}
                              <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                                {canAdjustSession(session) && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => {
                                            setSessionToAdjust(session);
                                            setAdjustDialogOpen(true);
                                          }}
                                        >
                                          <Clock className="h-3 w-3 mr-1" />
                                          Adjust Session
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Adjust this session's time or mark as completed/partial</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {task && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => router.push("/tasks")}
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Edit Task
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Go to Subjects & Tasks page to edit this task</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              
                              {task && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-foreground">Task Details</p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        {task.estimated_minutes} min estimated
                                      </Badge>
                                    </div>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground">{task.description}</p>
                                  )}
                                  {task.subtasks && task.subtasks.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-xs font-medium text-foreground">Subtasks:</p>
                                      <div className="space-y-1 pl-2">
                                        {task.subtasks.map((subtask) => (
                                          <div
                                            key={subtask.id}
                                            className={`text-xs flex items-center gap-2 ${
                                              subtask.completed
                                                ? "line-through text-muted-foreground"
                                                : "text-foreground"
                                            }`}
                                          >
                                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                            {subtask.title}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* AI Preparation Suggestions - Context-aware for all tasks */}
                              <div className="space-y-2 pt-2 border-t border-border/30">
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
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs"
                                      onClick={() => handleGetPreparation(session.id)}
                                    >
                                      Get Tips
                                    </Button>
                                  )}
                                </div>
                                
                                {loadingPreparation.has(session.id) && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Generating personalized tips...</span>
                                  </div>
                                )}
                                
                                {renderPreparationData(session.id)}
                              </div>
                              
                              {/* Status Actions */}
                              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                <p className="text-xs font-medium text-foreground">Mark as:</p>
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
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Complete
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Mark as fully completed</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => handleStatusChange(session, "partial")}
                                        disabled={session.status === "partial" || updateSession.isPending}
                                      >
                                        Partial
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Mark as partially completed (did some work but not all)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-red-600 hover:text-red-700"
                                        onClick={() => handleStatusChange(session, "skipped")}
                                        disabled={session.status === "skipped" || updateSession.isPending}
                                      >
                                        <X className="h-3 w-3 mr-1" />
                                        Skip
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Mark as skipped (didn't do this session)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
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
            ))}
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

