"use client";

import { CheckCircle2, Flame, GaugeCircle, Timer, TrendingUp, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OverviewCardsProps {
  readonly adherenceRate: number;
  readonly completionRate: number;
  readonly streak: number;
  readonly weeklyHoursCompleted?: number | null;
  readonly weeklyHoursTarget?: number | null;
}

export function OverviewCards({ 
  adherenceRate, 
  completionRate, 
  streak,
  weeklyHoursCompleted,
  weeklyHoursTarget 
}: OverviewCardsProps) {
  // Calculate weekly progress
  let weeklyProgress: number | null = null;
  const hasWeeklyData = weeklyHoursTarget !== null && weeklyHoursTarget !== undefined && 
    weeklyHoursCompleted !== null && weeklyHoursCompleted !== undefined;
  
  if (hasWeeklyData && weeklyHoursTarget && weeklyHoursCompleted !== undefined) {
    weeklyProgress = Math.min((weeklyHoursCompleted / weeklyHoursTarget) * 100, 100);
  }
  const isOnTrack = weeklyProgress !== null && weeklyProgress >= 80;
  const isBehind = weeklyProgress !== null && weeklyProgress < 50;

  // Determine weekly commitment card values
  let weeklyValue: string;
  let weeklyDescription: string;
  let weeklyTrend: "up" | "down" | null = null;
  
  if (hasWeeklyData) {
    weeklyValue = `${weeklyHoursCompleted.toFixed(1)}h / ${weeklyHoursTarget}h`;
    if (weeklyProgress !== null) {
      if (weeklyProgress >= 100) {
        weeklyDescription = "Goal achieved! 🎉";
        weeklyTrend = "up";
      } else if (isOnTrack) {
        weeklyDescription = `On track (${Math.round(weeklyProgress)}% of goal)`;
        weeklyTrend = "up";
      } else if (isBehind) {
        weeklyDescription = `Behind schedule (${Math.round(weeklyProgress)}% of goal)`;
        weeklyTrend = "down";
      } else {
        weeklyDescription = `${Math.round(weeklyProgress)}% of weekly goal`;
      }
    } else {
      weeklyDescription = "Complete sessions to track progress";
    }
  } else {
    weeklyValue = "No data";
    weeklyDescription = "Complete sessions to track progress";
  }

  const cards = [
    {
      label: "Plan adherence",
      value: `${Math.round(adherenceRate * 100)}%`,
      icon: GaugeCircle,
      description: "Sessions completed vs scheduled in the last 7 days."
    },
    {
      label: "Task completion",
      value: `${Math.round(completionRate * 100)}%`,
      icon: CheckCircle2,
      description: "Completed tasks across all subjects."
    },
    {
      label: "Focus streak",
      value: `${streak} day${streak === 1 ? "" : "s"}`,
      icon: Flame,
      description: "Days with 30+ focused minutes."
    },
    {
      label: "Weekly commitment",
      value: weeklyValue,
      icon: Timer,
      description: weeklyDescription,
      trend: weeklyTrend
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            <div className="flex items-center gap-1">
              {card.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
              {card.trend === "down" && <TrendingDown className="h-4 w-4 text-amber-600" />}
              <card.icon className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

