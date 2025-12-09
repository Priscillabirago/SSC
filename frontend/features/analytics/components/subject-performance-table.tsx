"use client";

import { useState, useMemo } from "react";
import { Info, TrendingUp, TrendingDown, Minus, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SubjectPerformance } from "../api";

type SortField = "subject" | "time" | "completion" | "adherence";
type SortDirection = "asc" | "desc";

interface SubjectPerformanceTableProps {
  readonly data: SubjectPerformance[];
}

interface SortButtonProps {
  readonly field: SortField;
  readonly sortField: SortField;
  readonly sortDirection: SortDirection;
  readonly onSort: (field: SortField) => void;
  readonly children: React.ReactNode;
}

function SortButton({ field, sortField, sortDirection, onSort, children }: SortButtonProps) {
  const isActive = sortField === field;
  let icon;
  if (isActive) {
    icon = sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  } else {
    icon = <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  }
  
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs -ml-2"
      onClick={() => onSort(field)}
    >
      {children}
      {icon}
    </Button>
  );
}

export function SubjectPerformanceTable({ data }: SubjectPerformanceTableProps) {
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "subject":
          comparison = a.subject_name.localeCompare(b.subject_name);
          break;
        case "time":
          comparison = a.time_spent_minutes - b.time_spent_minutes;
          break;
        case "completion":
          comparison = a.completion_rate - b.completion_rate;
          break;
        case "adherence":
          comparison = a.adherence_rate - b.adherence_rate;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [data, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Subject Performance
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    See how much time you spend on each subject vs. how well you're completing tasks.
                    This helps identify subjects that need more attention.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available for the selected time range.</p>
        </CardContent>
      </Card>
    );
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Subject Performance
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>Time Spent:</strong> Total study time per subject<br />
                  <strong>Task Completion:</strong> % of tasks completed<br />
                  <strong>Session Adherence:</strong> % of scheduled sessions completed<br />
                  <br />
                  <strong>Why this matters:</strong> Research shows students who track time vs. outcomes perform better.
                  If you spend lots of time but have low completion, you may need different study strategies.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 px-2 font-semibold text-foreground">
                  <SortButton 
                    field="subject" 
                    sortField={sortField} 
                    sortDirection={sortDirection} 
                    onSort={handleSort}
                  >
                    Subject
                  </SortButton>
                </th>
                <th className="text-right py-3 px-2 font-semibold text-foreground">
                  <div className="flex items-center justify-end">
                    <SortButton 
                      field="time" 
                      sortField={sortField} 
                      sortDirection={sortDirection} 
                      onSort={handleSort}
                    >
                      Time Spent
                    </SortButton>
                  </div>
                </th>
                <th className="text-right py-3 px-2 font-semibold text-foreground">Tasks</th>
                <th className="text-right py-3 px-2 font-semibold text-foreground">
                  <div className="flex items-center justify-end">
                    <SortButton 
                      field="completion" 
                      sortField={sortField} 
                      sortDirection={sortDirection} 
                      onSort={handleSort}
                    >
                      Completion
                    </SortButton>
                  </div>
                </th>
                <th className="text-right py-3 px-2 font-semibold text-foreground">
                  <div className="flex items-center justify-end">
                    <SortButton 
                      field="adherence" 
                      sortField={sortField} 
                      sortDirection={sortDirection} 
                      onSort={handleSort}
                    >
                      Adherence
                    </SortButton>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((subject) => {
                let completionTrend: "up" | "neutral" | "down";
                if (subject.completion_rate >= 0.7) {
                  completionTrend = "up";
                } else if (subject.completion_rate >= 0.5) {
                  completionTrend = "neutral";
                } else {
                  completionTrend = "down";
                }
                
                let adherenceTrend: "up" | "neutral" | "down";
                if (subject.adherence_rate >= 0.7) {
                  adherenceTrend = "up";
                } else if (subject.adherence_rate >= 0.5) {
                  adherenceTrend = "neutral";
                } else {
                  adherenceTrend = "down";
                }
                
                return (
                  <tr key={subject.subject_name} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-3 px-2 font-medium text-foreground">{subject.subject_name}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground">{formatTime(subject.time_spent_minutes)}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground">
                      {subject.tasks_completed}/{subject.tasks_total}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress 
                          value={subject.completion_rate * 100} 
                          className="w-20" 
                        />
                        <span className="text-muted-foreground min-w-[3rem] text-right">
                          {subject.tasks_total > 0 ? Math.round(subject.completion_rate * 100) : 0}%
                        </span>
                        {completionTrend === "up" && <TrendingUp className="h-3 w-3 text-green-600" />}
                        {completionTrend === "down" && <TrendingDown className="h-3 w-3 text-red-600" />}
                        {completionTrend === "neutral" && <Minus className="h-3 w-3 text-amber-600" />}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress 
                          value={subject.adherence_rate * 100} 
                          className="w-20" 
                        />
                        <span className="text-muted-foreground min-w-[3rem] text-right">
                          {subject.sessions_total > 0 ? Math.round(subject.adherence_rate * 100) : 0}%
                        </span>
                        {adherenceTrend === "up" && <TrendingUp className="h-3 w-3 text-green-600" />}
                        {adherenceTrend === "down" && <TrendingDown className="h-3 w-3 text-red-600" />}
                        {adherenceTrend === "neutral" && <Minus className="h-3 w-3 text-amber-600" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

