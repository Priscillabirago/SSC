"use client";

import { useMemo } from "react";
import { Calendar, CheckCircle2, Clock, MinusCircle, SkipForward, Timer, XCircle } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskSessions } from "@/features/tasks/hooks";
import type { TaskSession } from "@/features/tasks/api";

const statusConfig: Record<TaskSession["status"], { label: string; icon: typeof CheckCircle2; colorClass: string }> = {
  completed: { label: "Completed", icon: CheckCircle2, colorClass: "text-green-600" },
  partial: { label: "Partial", icon: MinusCircle, colorClass: "text-amber-600" },
  in_progress: { label: "In Progress", icon: Timer, colorClass: "text-blue-600" },
  planned: { label: "Planned", icon: Clock, colorClass: "text-muted-foreground" },
  skipped: { label: "Skipped", icon: XCircle, colorClass: "text-red-500/70" },
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface Props {
  readonly taskId: number;
  readonly estimatedMinutes: number;
  readonly totalMinutesSpent: number;
}

export function TaskSessionHistory({ taskId, estimatedMinutes, totalMinutesSpent }: Props) {
  const { data: sessions, isLoading } = useTaskSessions(taskId);

  const stats = useMemo(() => {
    if (!sessions) return null;
    const completed = sessions.filter((s) => s.status === "completed" || s.status === "partial");
    const totalCompleted = completed.reduce((sum, s) => sum + s.duration_minutes, 0);
    const byStatus = {
      completed: sessions.filter((s) => s.status === "completed").length,
      partial: sessions.filter((s) => s.status === "partial").length,
      skipped: sessions.filter((s) => s.status === "skipped").length,
      planned: sessions.filter((s) => s.status === "planned").length,
      in_progress: sessions.filter((s) => s.status === "in_progress").length,
    };
    return { totalCompleted, byStatus, total: sessions.length };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>No sessions yet. Generate a schedule or start a focus session to begin tracking.</span>
      </div>
    );
  }

  const progressPercent = estimatedMinutes > 0
    ? Math.min(100, Math.round((totalMinutesSpent / estimatedMinutes) * 100))
    : 0;

  const completedSessions = sessions.filter((s) => s.status !== "planned");
  const upcomingSessions = sessions.filter((s) => s.status === "planned");

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      {estimatedMinutes > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{formatDuration(totalMinutesSpent)}</span>
              {" "}of {formatDuration(estimatedMinutes)} estimated
            </span>
            <span className={`font-medium ${progressPercent >= 100 ? "text-green-600" : "text-foreground"}`}>
              {progressPercent}%
            </span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      )}

      {/* Stats summary */}
      {stats && (
        <div className="flex flex-wrap gap-3 text-xs">
          {stats.byStatus.completed > 0 && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {stats.byStatus.completed} completed
            </span>
          )}
          {stats.byStatus.partial > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <MinusCircle className="h-3 w-3" />
              {stats.byStatus.partial} partial
            </span>
          )}
          {stats.byStatus.skipped > 0 && (
            <span className="flex items-center gap-1 text-red-500/70">
              <SkipForward className="h-3 w-3" />
              {stats.byStatus.skipped} skipped
            </span>
          )}
          {stats.byStatus.planned > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {stats.byStatus.planned} upcoming
            </span>
          )}
        </div>
      )}

      {/* Session list */}
      <div className="space-y-1">
        {completedSessions.slice(0, 5).map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
        {completedSessions.length > 5 && (
          <p className="text-xs text-muted-foreground pl-6 py-1">
            + {completedSessions.length - 5} more past session{completedSessions.length - 5 > 1 ? "s" : ""}
          </p>
        )}
        {upcomingSessions.length > 0 && completedSessions.length > 0 && (
          <div className="border-t border-dashed border-border/50 my-1.5" />
        )}
        {upcomingSessions.slice(0, 3).map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
        {upcomingSessions.length > 3 && (
          <p className="text-xs text-muted-foreground pl-6 py-1">
            + {upcomingSessions.length - 3} more upcoming
          </p>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session }: { readonly session: TaskSession }) {
  const config = statusConfig[session.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 py-1 group/row">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${config.colorClass}`} />
      <div className="flex-1 min-w-0 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground shrink-0">{formatSessionDate(session.start_time)}</span>
        <span className="text-foreground/80">
          {formatSessionTime(session.start_time)} – {formatSessionTime(session.end_time)}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0">{formatDuration(session.duration_minutes)}</span>
      </div>
    </div>
  );
}
