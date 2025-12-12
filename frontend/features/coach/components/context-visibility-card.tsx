"use client";

import { useMemo } from "react";
import { Eye, BookOpen, ListTodo, Calendar, Target, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTasks } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useSessions } from "@/features/schedule/hooks";
import { useAnalyticsOverview } from "@/features/dashboard/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { parseBackendDateTime, formatDate } from "@/lib/utils";

export function ContextVisibilityCard() {
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsOverview();

  const isLoading = tasksLoading || subjectsLoading || sessionsLoading || analyticsLoading;

  const activeTasks = useMemo(() => {
    return tasks?.filter(t => !t.is_completed) || [];
  }, [tasks]);

  const upcomingSessions = useMemo(() => {
    if (!sessions) return [];
    const now = new Date();
    return sessions
      .filter(s => new Date(s.start_time) >= now)
      .slice(0, 3);
  }, [sessions]);

  const tasksDueSoon = useMemo(() => {
    if (!activeTasks) return [];
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return activeTasks
      .filter(t => t.deadline && new Date(t.deadline) <= threeDaysFromNow)
      .slice(0, 3);
  }, [activeTasks]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-primary" />
            What I Know About You
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = (subjects && subjects.length > 0) || activeTasks.length > 0 || (sessions && sessions.length > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-primary" />
            What I Know About You
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  This shows the context I use to provide personalized advice. I can see your subjects, tasks, schedule, and progress.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Start by creating subjects and tasks, then I'll have context to help you better!
            </p>
          </div>
        ) : (
          <>
            {/* Subjects */}
            {subjects && subjects.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    {subjects.length} Subject{subjects.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.slice(0, 5).map((subject) => (
                    <Badge
                      key={subject.id}
                      variant="outline"
                      className="text-xs h-5"
                      style={{ borderColor: subject.color, color: subject.color }}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full mr-1"
                        style={{ backgroundColor: subject.color }}
                      />
                      {subject.name}
                    </Badge>
                  ))}
                  {subjects.length > 5 && (
                    <Badge variant="outline" className="text-xs h-5">
                      +{subjects.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            ) : null}

            {/* Active Tasks */}
            {activeTasks.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    {activeTasks.length} Active Task{activeTasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {tasksDueSoon.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Due soon:</p>
                    <div className="space-y-1">
                      {tasksDueSoon.map((task) => (
                        <div key={task.id} className="text-xs text-foreground truncate">
                          • {task.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Upcoming Sessions */}
            {upcomingSessions.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Next Sessions
                  </span>
                </div>
                <div className="space-y-1">
                  {upcomingSessions.map((session) => (
                    <div key={session.id} className="text-xs text-foreground truncate">
                      • {formatDate(session.start_time, { weekday: "short", month: "short", day: "numeric" })} - {session.focus || "Study session"}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Progress Metrics */}
            {analytics ? (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Your Progress</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Adherence:</span>
                    <span className="ml-1 font-medium text-foreground">
                      {Math.round(analytics.adherence_rate * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Streak:</span>
                    <span className="ml-1 font-medium text-foreground">
                      {analytics.streak} day{analytics.streak !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

