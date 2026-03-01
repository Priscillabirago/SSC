"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Loader2 } from "lucide-react";

import { fetchSharedPlan } from "@/features/share/api";
import { parseBackendDateTime } from "@/lib/utils";

function formatTimeInTz(value: string, tz: string): string {
  const date = parseBackendDateTime(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(date);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: "Planned",
    in_progress: "In progress",
    completed: "Done",
    skipped: "Skipped",
    partial: "Partial",
  };
  return labels[status] ?? status;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-600 bg-green-50 border-green-200";
    case "in_progress":
      return "text-blue-600 bg-blue-50 border-blue-200";
    case "partial":
      return "text-amber-600 bg-amber-50 border-amber-200";
    case "skipped":
      return "text-slate-500 bg-slate-50 border-slate-200";
    default:
      return "text-slate-600 bg-slate-50 border-slate-200";
  }
}

export default function SharePlanPage() {
  const params = useParams();
  const token = params?.token as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["share", token],
    queryFn: () => fetchSharedPlan(token),
    enabled: !!token,
  });

  if (isLoading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md mx-auto p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">Link not found or expired</h1>
          <p className="text-sm text-muted-foreground">
            This link may have expired or been revoked. Ask the person who shared it to create a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-slate-50/80">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">{data.display_name}&apos;s study schedule</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.week_start} – {data.week_end}
            </p>
          </div>
          <div className="divide-y">
            {data.days.map((day) => (
              <div key={day.date} className="px-6 py-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {day.day_name}, {day.date}
                </h3>
                {day.sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sessions</p>
                ) : (
                  <div className="space-y-2">
                    {day.sessions.map((session, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border px-3 py-2.5 bg-white"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {formatTimeInTz(session.start_time, data.timezone)} –{" "}
                            {formatTimeInTz(session.end_time, data.timezone)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {session.focus || "Study session"}
                          </p>
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border ${statusColor(
                              session.status
                            )}`}
                          >
                            {statusLabel(session.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">SSC · Smart Study Companion</p>
      </div>
    </div>
  );
}
