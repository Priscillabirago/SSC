"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import { Calendar, ListTodo, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductivityTrendChart } from "@/features/dashboard/components/productivity-trend-chart";
import { TimeDistributionChart } from "@/features/dashboard/components/time-distribution-chart";
import { TimeRangeSelector } from "./time-range-selector";
import { SubjectPerformanceTable } from "./subject-performance-table";
import { EnergyProductivityChart } from "./energy-productivity-chart";
import { DayAdherenceChart } from "./day-adherence-chart";
import { useDetailedAnalytics } from "../hooks";

export function AnalyticsView() {
  const router = useRouter();
  const today = new Date();
  const weekAgo = subDays(today, 7);
  const [startDate, setStartDate] = useState<string>(format(weekAgo, "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(today, "yyyy-MM-dd"));

  const { data: analytics, isLoading } = useDetailedAnalytics(startDate, endDate);

  const handleRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const hasNoData = analytics?.total_sessions === 0;

  if (isLoading || !analytics) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Empty state
  if (hasNoData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Performance Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into your study patterns. Research shows students who track and analyze their performance improve faster.
          </p>
        </div>

        <TimeRangeSelector onRangeChange={handleRangeChange} />

        <div className="text-center py-16">
          <BarChart3 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">No analytics data yet</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Start by creating tasks and generating a schedule. Once you complete some study sessions, 
            you'll see detailed analytics here.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="default"
              onClick={() => router.push("/tasks")}
              className="gap-2"
            >
              <ListTodo className="h-4 w-4" />
              Go to Tasks
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/schedule")}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              View Schedule
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Performance Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into your study patterns. Research shows students who track and analyze their performance improve faster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/schedule")}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            Schedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/tasks")}
            className="gap-2"
          >
            <ListTodo className="h-4 w-4" />
            Tasks
          </Button>
        </div>
      </div>

      <TimeRangeSelector onRangeChange={handleRangeChange} />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-white/80 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total Sessions</p>
          <p className="text-2xl font-semibold text-foreground">{analytics.total_sessions}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {analytics.completed_sessions} completed ({Math.round(analytics.overall_adherence * 100)}% adherence)
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white/80 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total Study Time</p>
          <p className="text-2xl font-semibold text-foreground">
            {Math.floor(analytics.total_time_minutes / 60)}h {analytics.total_time_minutes % 60}m
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Average: {Math.round(analytics.total_time_minutes / Math.max(analytics.total_sessions, 1))} min/session
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white/80 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Overall Adherence</p>
          <p className="text-2xl font-semibold text-foreground">
            {Math.round(analytics.overall_adherence * 100)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {analytics.completed_sessions} of {analytics.total_sessions} sessions completed
          </p>
        </div>
      </div>

      {/* Productivity Overview Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border/50" />
          <h2 className="text-lg font-semibold text-foreground">Productivity Overview</h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <ProductivityTrendChart data={analytics.productivity_trend} />
          <TimeDistributionChart data={analytics.time_distribution} />
        </div>
      </div>

      {/* Performance Analysis Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border/50" />
          <h2 className="text-lg font-semibold text-foreground">Performance Analysis</h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <SubjectPerformanceTable data={analytics.subject_performance} />
          <EnergyProductivityChart data={analytics.energy_productivity} />
        </div>
      </div>

      {/* Weekly Patterns Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border/50" />
          <h2 className="text-lg font-semibold text-foreground">Weekly Patterns</h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>
        <DayAdherenceChart data={analytics.day_adherence} />
      </div>
    </div>
  );
}

