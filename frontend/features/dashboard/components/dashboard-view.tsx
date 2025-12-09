"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, BarChart3, Sparkles, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OverviewCards } from "@/features/dashboard/components/overview-cards";
import { ProductivityTrendChart } from "@/features/dashboard/components/productivity-trend-chart";
import { TimeDistributionChart } from "@/features/dashboard/components/time-distribution-chart";
import { TodayPlanCard } from "@/features/dashboard/components/upcoming-tasks-card";
import { AIInsightsCard } from "@/features/dashboard/components/ai-insights-card";
import { GettingStartedGuide } from "@/features/dashboard/components/getting-started-guide";
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
    generateSchedule.mutate(undefined, {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your personalized study companion. Follow the steps below to get started.
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
              onClick={() => router.push("/analytics")}
              className="gap-2"
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
          <p className="text-base font-medium text-foreground mb-1">Welcome to your dashboard!</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Complete the steps above to set up your study companion. Your progress and insights will appear here once you start.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Getting Started Guide - Show at top if not completed */}
      <GettingStartedGuide />
      
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quick overview of your study progress and today's focus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSchedule}
            disabled={generateSchedule.isPending}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            {generateSchedule.isPending ? "Generating..." : "Generate Schedule"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/analytics")}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            View Analytics
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
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <ProductivityTrendChart data={analytics.productivity_trend} />
        <TimeDistributionChart data={analytics.time_distribution} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <TodayPlanCard
          todaySessions={analytics.today_plan.length > 0 ? analytics.today_plan : todaySessions}
        />
        <AIInsightsCard />
      </div>

      {/* Link to Full Analytics */}
      <div className="flex items-center justify-center pt-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/analytics")}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="h-4 w-4" />
          View Full Analytics
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

