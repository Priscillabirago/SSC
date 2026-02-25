"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, BarChart3, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OverviewCards } from "@/features/dashboard/components/overview-cards";
import { ProductivityTrendChart } from "@/features/dashboard/components/productivity-trend-chart";
import { TimeDistributionChart } from "@/features/dashboard/components/time-distribution-chart";
import { TodayPlanCard } from "@/features/dashboard/components/upcoming-tasks-card";
import { AIInsightsCard } from "@/features/dashboard/components/ai-insights-card";
import { GettingStartedGuide } from "@/features/dashboard/components/getting-started-guide";
import { DailySummaryCard } from "@/features/dashboard/components/daily-summary-card";
import { WeeklyRecapCard } from "@/features/dashboard/components/weekly-recap-card";
import { useAnalyticsOverview } from "@/features/dashboard/hooks";
import { useSessions, useGenerateSchedule } from "@/features/schedule/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

export function DashboardView() {
  const router = useRouter();
  const { data: analytics, isLoading: loadingAnalytics } = useAnalyticsOverview();
  const { data: sessions } = useSessions();
  const generateSchedule = useGenerateSchedule();

  const todaySessions = useMemo(() => {
    if (!sessions) return [];
    const today = new Date().toISOString().slice(0, 10);
    return sessions.filter((session) => session.start_time.startsWith(today));
  }, [sessions]);

  const hasNoData = analytics?.upcoming_tasks.length === 0 && 
    analytics.productivity_trend.length > 0 &&
    analytics.productivity_trend.every(t => t.completed_minutes === 0 && t.scheduled_minutes === 0);

  const handleGenerateSchedule = () => {
    generateSchedule.mutate(false, {
      onSuccess: () => {
        toast({
          title: "Schedule generated",
          description: "Your weekly study plan has been created. Check the Schedule page.",
        });
        router.push("/schedule");
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to generate schedule",
          description: error?.message || "Please try again.",
        });
      },
    });
  };

  if (loadingAnalytics || !analytics) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Empty state
  if (hasNoData) {
    return (
      <div className="space-y-6">
        {/* First-run welcome banner */}
        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Welcome! New here? Follow the steps below — your first study plan is just a few minutes away.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add subjects → Create tasks → Generate your schedule
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your study hub. Follow the steps below to set things up — it only takes a few minutes.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/schedule")}
              className="gap-2 flex-1 sm:flex-initial"
            >
              <Calendar className="h-4 w-4" />
              Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/analytics")}
              className="gap-2 flex-1 sm:flex-initial"
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
          </div>
        </div>

        {/* Getting Started Guide */}
        <GettingStartedGuide />

        {/* Welcome Message */}
        <div className="text-center py-8">
          <Sparkles className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-base font-medium text-foreground mb-1">Your progress will show up here</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Once you add tasks and generate a schedule, this page will show your daily plan, study streaks, and AI-powered insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Getting Started Guide - Show at top if not completed */}
      <GettingStartedGuide />
      
      {/* Daily Summary - Show in the morning */}
      <DailySummaryCard />

      {/* Weekly Recap - AI-generated summary of last week */}
      <WeeklyRecapCard />
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quick overview of your study progress and today's focus.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSchedule}
            disabled={generateSchedule.isPending}
            className="gap-2 flex-1 sm:flex-initial"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">{generateSchedule.isPending ? "Generating..." : "Generate Schedule"}</span>
            <span className="sm:hidden">{generateSchedule.isPending ? "Generating..." : "Generate"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/analytics")}
            className="gap-2 flex-1 sm:flex-initial"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">View Analytics</span>
            <span className="sm:hidden">Analytics</span>
          </Button>
        </div>
      </div>

      <OverviewCards
        adherenceRate={analytics.adherence_rate}
        completionRate={analytics.completion_rate}
        streak={analytics.streak}
        weeklyHoursCompleted={analytics.weekly_hours_completed}
        weeklyHoursTarget={analytics.weekly_hours_target}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr]">
        <ProductivityTrendChart data={analytics.productivity_trend} />
        <TimeDistributionChart data={analytics.time_distribution} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1fr]">
        <TodayPlanCard
          todaySessions={analytics.today_plan.length > 0 ? analytics.today_plan : todaySessions}
        />
        <AIInsightsCard />
      </div>
    </div>
  );
}

