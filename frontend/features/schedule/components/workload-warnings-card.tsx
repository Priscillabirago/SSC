"use client";

import { AlertTriangle, AlertCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkloadAnalysis } from "../hooks";
import { useState } from "react";
import type { WorkloadAnalysis } from "../api";

function WarningIcon({ severity }: { readonly severity: "soft" | "hard" }) {
  if (severity === "hard") {
    return <AlertTriangle className="h-5 w-5 text-red-600" />;
  }
  return <AlertCircle className="h-5 w-5 text-amber-600" />;
}

function WarningBadge({ severity }: { readonly severity: "soft" | "hard" }) {
  return (
    <Badge
      variant={severity === "hard" ? "destructive" : "outline"}
      className="text-xs"
    >
      {severity === "hard" ? "Critical" : "Warning"}
    </Badge>
  );
}

interface WorkloadWarningsCardProps {
  postGenAnalysis?: WorkloadAnalysis | null;
}

export function WorkloadWarningsCard({ postGenAnalysis }: WorkloadWarningsCardProps = {}) {
  const { data: preGenAnalysis, isLoading, error } = useWorkloadAnalysis();
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set());
  
  // Combine pre-gen and post-gen warnings
  const allWarnings = [
    ...(preGenAnalysis?.warnings || []),
    ...(postGenAnalysis?.warnings || []),
  ];
  
  // Use combined metrics or fallback to pre-gen
  const metrics = postGenAnalysis?.metrics || preGenAnalysis?.metrics;
  
  const activeWarnings = allWarnings.filter(
    (w) => !dismissedWarnings.has(`${w.type}-${w.severity}`)
  );

  if (isLoading && !postGenAnalysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Workload Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (activeWarnings.length === 0) {
    return null; // No warnings to show
  }
  
  if (error && !preGenAnalysis && !postGenAnalysis) {
    return null; // Fail silently - don't block schedule generation
  }

  const toggleExpanded = (warningType: string) => {
    setExpandedWarnings((prev) => {
      const next = new Set(prev);
      if (next.has(warningType)) {
        next.delete(warningType);
      } else {
        next.add(warningType);
      }
      return next;
    });
  };

  const dismissWarning = (warningType: string, severity: string) => {
    setDismissedWarnings((prev) => {
      const next = new Set(prev);
      next.add(`${warningType}-${severity}`);
      return next;
    });
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Workload Warnings
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {activeWarnings.length} {activeWarnings.length === 1 ? "issue" : "issues"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeWarnings.map((warning, index) => {
          const isExpanded = expandedWarnings.has(warning.type);
          const warningKey = `${warning.type}-${warning.severity}`;

          return (
            <div
              key={warningKey}
              className={`rounded-lg border p-4 ${
                warning.severity === "hard"
                  ? "border-red-200 bg-red-50/50"
                  : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <WarningIcon severity={warning.severity} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-foreground">
                        {warning.title}
                      </h4>
                      <WarningBadge severity={warning.severity} />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {warning.message}
                    </p>

                    {/* Task details */}
                    {warning.tasks && warning.tasks.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Affected tasks:
                        </p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {warning.tasks.map((task) => (
                            <li key={task.title}>
                              {task.title}
                              {task.hours_short && (
                                <span className="text-amber-700">
                                  {" "}
                                  (needs {task.hours_short.toFixed(1)}h more)
                                </span>
                              )}
                              {task.hours && !task.hours_short && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({task.hours.toFixed(1)}h)
                                </span>
                              )}
                              {task.buffer_hours !== undefined && (
                                <span className="text-amber-700">
                                  {" "}
                                  (only {task.buffer_hours.toFixed(1)}h buffer before deadline)
                                </span>
                              )}
                              {task.priority && (
                                <span className="text-xs ml-1">
                                  [{task.priority}]
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Subject details */}
                    {warning.subjects && warning.subjects.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Subjects:
                        </p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {warning.subjects.map((subject) => (
                            <li key={subject.subject_name}>
                              {subject.subject_name} (exam in {subject.days_until_exam} days)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Clusters */}
                    {warning.clusters && warning.clusters.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Deadline clusters:
                        </p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {warning.clusters.map((cluster) => (
                            <li key={cluster.deadline_date}>
                              {cluster.deadline_day}: {cluster.task_count} tasks (
                              {cluster.total_hours.toFixed(1)}h total)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Day overloads */}
                    {warning.overloads && warning.overloads.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Overloaded days:
                        </p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {warning.overloads.map((overload: any) => (
                            <li key={overload.day}>
                              {overload.day}: {overload.scheduled_hours.toFixed(1)}h scheduled,{" "}
                              {overload.available_hours.toFixed(1)}h available (
                              <span className="text-red-700">+{overload.overflow.toFixed(1)}h overflow</span>)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Days (for consecutive heavy days) */}
                    {warning.days && warning.days.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Heavy days:
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {warning.days.join(", ")}
                        </p>
                      </div>
                    )}

                    {/* Suggestions */}
                    {warning.suggestions && warning.suggestions.length > 0 && (
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs p-0 text-primary hover:text-primary"
                          onClick={() => toggleExpanded(warning.type)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Hide suggestions
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Show suggestions
                            </>
                          )}
                        </Button>
                        {isExpanded && (
                          <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                            {warning.suggestions.map((suggestion) => (
                              <li key={suggestion}>{suggestion}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => dismissWarning(warning.type, warning.severity)}
                  aria-label="Dismiss warning"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        {/* Metrics summary */}
        {metrics && (
          <div className="mt-4 pt-4 border-t border-amber-200">
            <p className="text-xs text-muted-foreground">
              {postGenAnalysis ? (
                <>
                  <strong>Schedule Summary:</strong>{" "}
                  {metrics.total_scheduled_hours?.toFixed(1) || "0"}h scheduled,{" "}
                  {metrics.unscheduled_hours ? `${metrics.unscheduled_hours.toFixed(1)}h unscheduled` : ""}
                  {metrics.unscheduled_task_count ? ` (${metrics.unscheduled_task_count} tasks)` : ""}
                </>
              ) : (
                <>
                  <strong>Summary:</strong> {metrics.total_task_hours?.toFixed(1) || "0"}h
                  tasks, {metrics.available_hours_per_week?.toFixed(1) || "0"}h available,{" "}
                  {metrics.realistic_capacity?.toFixed(1) || "0"}h realistic capacity (
                  {metrics.completion_rate ? (metrics.completion_rate * 100).toFixed(0) : "65"}% completion rate)
                </>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

