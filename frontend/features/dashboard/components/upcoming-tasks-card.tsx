"use client";

import { ArrowRight, Calendar, Clock, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudySession } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { StartTrackingButton } from "@/components/tracking/start-tracking-button";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useQuickTrack } from "@/contexts/quick-track-context";
import { useTasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";

interface TodayPlanCardProps {
  readonly todaySessions: StudySession[];
}

export function TodayPlanCard({ todaySessions }: TodayPlanCardProps) {
  const router = useRouter();
  const { startSession } = useFocusSession();
  const { stopQuickTrack, isActive: isQuickTrackActive, getElapsedTime, getStartTime } = useQuickTrack();
  const updateTask = useUpdateTask();
  const { data: tasks } = useTasks();
  const { data: subjects } = useSubjects();
  const completedCount = todaySessions.filter(s => s.status === "completed").length;
  const totalCount = todaySessions.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const getTaskForSession = (session: StudySession) => {
    if (!session.task_id || !tasks) return null;
    return tasks.find((t) => t.id === session.task_id) || null;
  };

  const getSubjectForSession = (session: StudySession) => {
    if (!session.subject_id || !subjects) return null;
    return subjects.find((s) => s.id === session.subject_id) || null;
  };

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
          {totalCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {completedCount}/{totalCount} completed
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
            {totalCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-foreground">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              {todaySessions.map((session) => {
                const sessionTask = getTaskForSession(session);
                const sessionSubject = getSubjectForSession(session);
                return (
                  <div
                    key={session.id}
                    className="rounded-xl border border-border/50 bg-white/60 px-4 py-3 text-sm hover:bg-white/80 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <p className="font-medium text-foreground truncate">
                          {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {session.status === "planned" && (
                          <StartTrackingButton
                            task={sessionTask}
                            session={session}
                            subject={sessionSubject}
                            variant="default"
                            size="sm"
                            className="h-6 text-xs px-2"
                            showQuickTrack={false}
                            onFocusSessionStart={() => {
                              // Get Quick Track start time BEFORE stopping (since stopQuickTrack removes it)
                              const quickTrackStartTime = sessionTask && isQuickTrackActive(sessionTask.id)
                                ? getStartTime(sessionTask.id)
                                : null;
                              
                              // Calculate Quick Track time if active
                              const quickTrackTimeMs = sessionTask && isQuickTrackActive(sessionTask.id)
                                ? getElapsedTime(sessionTask.id) * 60 * 1000
                                : 0;
                              
                              // Helper to start Focus Mode (called after Quick Track time is saved)
                              const startFocusMode = () => {
                                startSession(session, sessionTask, sessionSubject, quickTrackTimeMs, quickTrackStartTime);
                                toast({
                                  title: "Focus session started",
                                  description: "Entering focus mode...",
                                });
                              };
                              
                              // Stop Quick Track if active and save time - wait for mutation to complete
                              if (sessionTask && isQuickTrackActive(sessionTask.id)) {
                                const elapsed = stopQuickTrack(sessionTask.id, true);
                                const currentTimer = sessionTask.timer_minutes_spent ?? 0;
                                updateTask.mutate(
                                  {
                                    id: sessionTask.id,
                                    payload: {
                                      timer_minutes_spent: currentTimer + elapsed,
                                    },
                                  },
                                  {
                                    onSuccess: () => {
                                      // Only start Focus Mode after Quick Track time is successfully saved
                                      startFocusMode();
                                    },
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
                                // No Quick Track active, start Focus Mode immediately
                                startFocusMode();
                              }
                            }}
                          />
                        )}
                        <Badge 
                          variant={session.status === "completed" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {session.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {session.focus || session.generated_by || "Study session"}
                    </p>
                  </div>
                );
              })}
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

