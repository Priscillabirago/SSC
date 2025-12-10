"use client";

import { AlertTriangle, AlertCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const { data: preGenAnalysis } = useWorkloadAnalysis();
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [expandedMainWarnings, setExpandedMainWarnings] = useState<Set<string>>(new Set());
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());
  
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

  const toggleMainExpanded = (warningType: string) => {
    setExpandedMainWarnings((prev) => {
      const next = new Set(prev);
      if (next.has(warningType)) {
        next.delete(warningType);
      } else {
        next.add(warningType);
      }
      return next;
    });
  };

  const toggleSuggestionsExpanded = (warningType: string) => {
    setExpandedSuggestions((prev) => {
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

  // Sort warnings: critical first
  const sortedWarnings = [...activeWarnings].sort((a, b) => {
    if (a.severity === "hard" && b.severity !== "hard") return -1;
    if (a.severity !== "hard" && b.severity === "hard") return 1;
    return 0;
  });

  return (
    <Card className="border-amber-200/60 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-base font-semibold text-foreground">
            Workload Warnings
          </CardTitle>
          <Badge variant="outline" className="text-xs h-5 px-2">
            {activeWarnings.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {sortedWarnings.map((warning, index) => {
          const isMainExpanded = expandedMainWarnings.has(warning.type);
          const isSuggestionsExpanded = expandedSuggestions.has(warning.type);
          const warningKey = `${warning.type}-${warning.severity}`;
          const isCritical = warning.severity === "hard";
          
          // Get a brief preview for collapsed state
          const getPreview = () => {
            if (warning.tasks && warning.tasks.length > 0) {
              const firstTask = warning.tasks[0];
              if (firstTask.hours_short) {
                return `needs ${firstTask.hours_short.toFixed(1)}h more`;
              }
            }
            return warning.message.substring(0, 60) + (warning.message.length > 60 ? "..." : "");
          };

          return (
            <div
              key={warningKey}
              className={`rounded-lg border transition-all duration-200 ${
                isCritical
                  ? "border-red-300/60 bg-red-50/40 hover:bg-red-50/60"
                  : "border-amber-200/60 bg-amber-50/30 hover:bg-amber-50/50"
              }`}
            >
              {/* Collapsed Header - Always Visible */}
              <button
                type="button"
                className="flex items-center justify-between gap-3 p-3 w-full text-left cursor-pointer hover:bg-white/20 transition-colors rounded-lg"
                onClick={() => toggleMainExpanded(warning.type)}
                aria-expanded={isMainExpanded}
                aria-label={`${isMainExpanded ? "Collapse" : "Expand"} ${warning.title} warning`}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <WarningIcon severity={warning.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`text-sm font-semibold leading-tight ${isCritical ? "text-red-900" : "text-foreground"}`}>
                        {warning.title}
                      </h4>
                      <WarningBadge severity={warning.severity} />
                    </div>
                    {!isMainExpanded && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-1">
                        {getPreview()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissWarning(warning.type, warning.severity);
                    }}
                    aria-label="Dismiss warning"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <ChevronDown 
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${
                      isMainExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Expanded Content */}
              {isMainExpanded && (
                <div className="px-3 pb-3.5 space-y-3.5 border-t border-border/30 pt-3.5">
                  {/* 1. Main Message - Context */}
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {warning.message}
                  </p>

                  {/* 2. Affected Tasks - What's broken (most important detail) */}
                  {warning.tasks && warning.tasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Affected tasks
                      </p>
                      <ul className="space-y-2">
                        {warning.tasks.map((task) => (
                          <li key={task.title} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground leading-relaxed break-words">
                                {task.title}
                              </p>
                              {(task.hours_short || task.buffer_hours !== undefined) && (
                                <p className={`text-sm font-semibold mt-0.5 ${isCritical ? "text-red-700" : "text-amber-700"}`}>
                                  {task.hours_short && `needs ${task.hours_short.toFixed(1)}h more`}
                                  {task.buffer_hours !== undefined && `only ${task.buffer_hours.toFixed(1)}h buffer`}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 3. Suggestions - Solutions (actionable, should be prominent!) */}
                  {warning.suggestions && warning.suggestions.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          Suggestions
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/5"
                          onClick={() => toggleSuggestionsExpanded(warning.type)}
                        >
                          {isSuggestionsExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5 mr-1.5" />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                              Show
                            </>
                          )}
                        </Button>
                      </div>
                      {isSuggestionsExpanded && (
                        <ul className="space-y-2.5">
                          {warning.suggestions.map((suggestion) => (
                            <li key={suggestion} className="flex items-start gap-2.5">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                              <span className="text-sm text-foreground/90 leading-relaxed flex-1">{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* 4. Supporting Details - Context (less critical, can come after) */}
                  {warning.subjects && warning.subjects.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Subjects
                      </p>
                      <ul className="space-y-1.5">
                        {warning.subjects.map((subject) => (
                          <li key={subject.subject_name} className="text-sm text-foreground/80 leading-relaxed">
                            <span className="font-medium">{subject.subject_name}</span> — exam in {subject.days_until_exam} days
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {warning.clusters && warning.clusters.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Deadline clusters
                      </p>
                      <ul className="space-y-1.5">
                        {warning.clusters.map((cluster) => (
                          <li key={cluster.deadline_date} className="text-sm text-foreground/80 leading-relaxed">
                            <span className="font-medium">{cluster.deadline_day}</span>: {cluster.task_count} tasks ({cluster.total_hours.toFixed(1)}h total)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {warning.overloads && warning.overloads.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Overloaded days
                      </p>
                      <ul className="space-y-1.5">
                        {warning.overloads.map((overload: any) => (
                          <li key={overload.day} className="text-sm text-foreground/80 leading-relaxed">
                            <span className="font-medium">{overload.day}</span>: {overload.scheduled_hours.toFixed(1)}h scheduled, {overload.available_hours.toFixed(1)}h available (
                            <span className="text-red-700 font-semibold">+{overload.overflow.toFixed(1)}h overflow</span>)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {warning.days && warning.days.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Heavy days
                      </p>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {warning.days.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Metrics summary */}
        {metrics && (
          <div className="mt-4 pt-3.5 border-t border-amber-200/60">
            <p className="text-sm text-foreground/80 leading-relaxed">
              {postGenAnalysis ? (
                <>
                  <span className="font-semibold text-foreground">Schedule Summary:</span>{" "}
                  {metrics.total_scheduled_hours?.toFixed(1) || "0"}h scheduled
                  {metrics.unscheduled_hours ? `, ${metrics.unscheduled_hours.toFixed(1)}h unscheduled` : ""}
                  {metrics.unscheduled_task_count ? ` (${metrics.unscheduled_task_count} tasks)` : ""}
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">Summary:</span> {metrics.total_task_hours?.toFixed(1) || "0"}h tasks, {metrics.available_hours_per_week?.toFixed(1) || "0"}h available, {metrics.realistic_capacity?.toFixed(1) || "0"}h capacity ({metrics.completion_rate ? (metrics.completion_rate * 100).toFixed(0) : "65"}% completion)
                </>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

