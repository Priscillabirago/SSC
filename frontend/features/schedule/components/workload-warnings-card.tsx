"use client";

import { AlertTriangle, AlertCircle, X, ChevronDown, ChevronUp, Minimize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkloadAnalysis } from "../hooks";
import { useState, useEffect } from "react";
import type { WorkloadAnalysis } from "../api";

const COLLAPSED_STORAGE_KEY = "ssc.workloadWarningsCollapsed";
const SEEN_WARNINGS_STORAGE_KEY = "ssc.seenWorkloadWarnings";

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
  const [isCardCollapsed, setIsCardCollapsed] = useState(true);
  const [seenWarnings, setSeenWarnings] = useState<Set<string>>(() => {
    if (globalThis.window === undefined) return new Set();
    const stored = localStorage.getItem(SEEN_WARNINGS_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
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
  
  // Count critical warnings for badge color
  const criticalCount = activeWarnings.filter(w => w.severity === "hard").length;
  
  // Generate keys for current warnings
  const currentWarningKeys = activeWarnings.map(w => `${w.type}-${w.severity}`);
  
  // Check if there are any unseen warnings
  const hasUnseenWarnings = currentWarningKeys.some(key => !seenWarnings.has(key));
  
  // Auto-expand if there are unseen warnings
  useEffect(() => {
    if (hasUnseenWarnings && activeWarnings.length > 0) {
      setIsCardCollapsed(false);
    }
  }, [hasUnseenWarnings, activeWarnings.length]);
  
  // When user manually collapses, mark all current warnings as seen
  const handleCollapse = () => {
    const newSeen = new Set(seenWarnings);
    currentWarningKeys.forEach(key => newSeen.add(key));
    setSeenWarnings(newSeen);
    localStorage.setItem(SEEN_WARNINGS_STORAGE_KEY, JSON.stringify([...newSeen]));
    setIsCardCollapsed(true);
  };

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

  // Hide completely when no warnings
  if (allWarnings.length === 0) {
    return null;
  }

  // Collapsed state: show small clickable indicator
  if (isCardCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-2 ${
                criticalCount > 0 
                  ? "border-red-300 bg-red-50 hover:bg-red-100 text-red-700" 
                  : "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
              }`}
              onClick={() => setIsCardCollapsed(false)}
            >
              <AlertTriangle className="h-4 w-4" />
              <Badge 
                variant={criticalCount > 0 ? "destructive" : "outline"} 
                className="h-5 px-1.5 text-xs"
              >
                {activeWarnings.length}
              </Badge>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{activeWarnings.length} workload warning{activeWarnings.length === 1 ? "" : "s"}</p>
            <p className="text-xs text-muted-foreground">Click to expand</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className="border-amber-200/60 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-base font-semibold text-foreground">
              Workload Warnings
            </CardTitle>
            <Badge variant="outline" className="text-xs h-5 px-2">
              {activeWarnings.length}
            </Badge>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleCollapse}
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Minimize warnings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            // Show message truncated - it's already user-friendly now
            const maxLen = 65;
            if (warning.message.length <= maxLen) {
              return warning.message;
            }
            return warning.message.substring(0, maxLen) + "...";
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
                  <div
                    role="button"
                    tabIndex={0}
                    className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/60 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissWarning(warning.type, warning.severity);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        dismissWarning(warning.type, warning.severity);
                      }
                    }}
                    aria-label="Dismiss warning"
                  >
                    <X className="h-3.5 w-3.5" />
                  </div>
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

                  {/* 2. Affected Tasks */}
                  {warning.tasks && warning.tasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Tasks
                      </p>
                      <ul className="space-y-1.5">
                        {warning.tasks.map((task) => (
                          <li key={task.title} className="flex items-center gap-2 text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
                            <span className="flex-1 min-w-0 truncate">{task.title}</span>
                            {task.hours_short !== undefined && (
                              <span className={`text-xs font-medium ${isCritical ? "text-red-600" : "text-amber-600"}`}>
                                +{task.hours_short.toFixed(1)}h needed
                              </span>
                            )}
                            {task.hours !== undefined && !task.hours_short && (
                              <span className="text-xs text-muted-foreground">
                                {task.hours.toFixed(1)}h
                              </span>
                            )}
                            {task.buffer_hours !== undefined && (
                              <span className="text-xs text-amber-600">
                                {task.buffer_hours.toFixed(1)}h buffer
                              </span>
                            )}
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
                        Deadline days
                      </p>
                      <ul className="space-y-1.5">
                        {warning.clusters.map((cluster) => (
                          <li key={cluster.deadline_date} className="text-sm text-foreground/80 leading-relaxed">
                            <span className="font-medium">{cluster.deadline_day}</span>: {cluster.task_count} tasks
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

        {/* Simple metrics summary */}
        {metrics && (
          <div className="mt-3 pt-3 border-t border-amber-200/60">
            <p className="text-xs text-muted-foreground">
              {metrics.total_task_hours !== undefined && (
                <span>{metrics.total_task_hours?.toFixed(0)}h of tasks</span>
              )}
              {metrics.weekly_goal !== undefined && (
                <span> · {metrics.weekly_goal}h goal</span>
              )}
              {metrics.window_hours !== undefined && metrics.window_hours > 0 && (
                <span> ({metrics.window_hours?.toFixed(0)}h in windows)</span>
              )}
              {metrics.total_scheduled_hours !== undefined && (
                <span> · {metrics.total_scheduled_hours?.toFixed(0)}h scheduled</span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

