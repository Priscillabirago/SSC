"use client";

import { CheckCircle2, AlertTriangle, Lightbulb, TrendingUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardInsights } from "../hooks";
import type { DashboardInsight } from "../api";

function InsightIcon({ type }: Readonly<{ type: DashboardInsight["type"] }>) {
  switch (type) {
    case "celebration":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "recommendation":
      return <Lightbulb className="h-4 w-4 text-blue-600" />;
    case "observation":
      return <TrendingUp className="h-4 w-4 text-purple-600" />;
    default:
      return <Lightbulb className="h-4 w-4 text-muted-foreground" />;
  }
}

function InsightBadge({ type }: Readonly<{ type: DashboardInsight["type"] }>) {
  const variants: Record<DashboardInsight["type"], "default" | "destructive" | "outline"> = {
    celebration: "default",
    warning: "destructive",
    recommendation: "outline",
    observation: "outline",
  };
  
  const labels: Record<DashboardInsight["type"], string> = {
    celebration: "Win",
    warning: "Attention",
    recommendation: "Tip",
    observation: "Pattern",
  };
  
  return (
    <Badge variant={variants[type]} className="text-xs">
      {labels[type]}
    </Badge>
  );
}

export function AIInsightsCard() {
  const { data: insights, isLoading, error } = useDashboardInsights();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !insights) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load insights. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const toneColors = {
    positive: "border-green-200 bg-green-50/50",
    neutral: "border-blue-200 bg-blue-50/50",
    needs_attention: "border-amber-200 bg-amber-50/50",
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Motivational Message */}
        {insights.motivational_message && (
          <div className={`rounded-lg border p-3 ${toneColors[insights.overall_tone]}`}>
            <p className="text-sm font-medium text-foreground">
              {insights.motivational_message}
            </p>
          </div>
        )}

        {/* Insights List */}
        <div className="space-y-3">
          {insights.insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keep tracking your progress to get personalized insights!
            </p>
          ) : (
            insights.insights.map((insight, index) => (
              <div
                key={`${insight.type}-${insight.title}-${index}`}
                className="rounded-xl border border-border/60 bg-white/70 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <InsightIcon type={insight.type} />
                    <h4 className="text-sm font-semibold text-foreground">
                      {insight.title}
                    </h4>
                  </div>
                  <InsightBadge type={insight.type} />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {insight.message}
                </p>
                {insight.action && (
                  <div className="pt-1">
                    <p className="text-sm font-medium text-primary">
                      💡 {insight.action}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

