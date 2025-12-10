"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { X, Sparkles, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDailySummary } from "@/features/coach/hooks";
import { Skeleton } from "@/components/ui/skeleton";

const STORAGE_KEY = "ssc.dailySummaryDismissed";

export function DailySummaryCard() {
  const { data: summary, isLoading } = useDailySummary();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user dismissed today's summary
    const dismissedDate = localStorage.getItem(STORAGE_KEY);
    const today = format(new Date(), "yyyy-MM-dd");
    if (dismissedDate === today) {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    localStorage.setItem(STORAGE_KEY, today);
    setIsDismissed(true);
  };

  // Determine if we should show the summary based on session timing
  const shouldShow = useMemo(() => {
    if (isDismissed || !summary) return false;

    const now = new Date();
    const nowTime = now.getTime();
    
    // Get current hour in user's timezone
    const userTimezone = summary.user_timezone || "UTC";
    const currentHourInUserTz = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: userTimezone,
        hour: "numeric",
        hour12: false,
      }).format(now),
      10
    );

    // Check if we should show before first session (morning)
    if (summary.first_session_start) {
      const firstSessionTime = new Date(summary.first_session_start).getTime();
      // Show if it's before the first session starts (with 30 min buffer)
      const buffer = 30 * 60 * 1000; // 30 minutes
      if (nowTime < firstSessionTime - buffer) {
        return true;
      }
    } else if (currentHourInUserTz < 12) {
      // If no first session scheduled but it's morning in user's timezone, show yesterday's summary
      return true;
    }

    // Check if we should show after last session (evening)
    if (summary.last_session_end) {
      const lastSessionTime = new Date(summary.last_session_end).getTime();
      // Show if it's been at least 5 minutes since last session ended
      // and it's been less than 12 hours (to avoid showing next day)
      const minDelay = 5 * 60 * 1000; // 5 minutes
      const maxDelay = 12 * 60 * 60 * 1000; // 12 hours
      const timeSinceLastSession = nowTime - lastSessionTime;
      
      if (timeSinceLastSession >= minDelay && timeSinceLastSession < maxDelay) {
        // Also check if there are no more sessions today
        // (If first_session_start is null or in the past, there are no more)
        if (!summary.first_session_start) {
          return true; // No more sessions today
        }
        const firstSessionTime = new Date(summary.first_session_start).getTime();
        if (firstSessionTime <= nowTime) {
          return true; // First session already passed, no more today
        }
      }
    }

    return false;
  }, [summary, isDismissed]);

  // Determine if it's morning context (before first session) or evening (after last session)
  const isMorningContext = useMemo(() => {
    if (!summary) return false;
    const now = new Date();
    const nowTime = now.getTime();
    const userTimezone = summary.user_timezone || "UTC";
    
    // If we have a first session and we're before it, it's morning context
    if (summary.first_session_start) {
      const firstSessionTime = new Date(summary.first_session_start).getTime();
      if (nowTime < firstSessionTime) {
        return true;
      }
    } else {
      // No first session - check if it's morning in user's timezone
      const currentHourInUserTz = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: userTimezone,
          hour: "numeric",
          hour12: false,
        }).format(now),
        10
      );
      if (currentHourInUserTz < 12) {
        return true; // Morning in user's timezone - show yesterday's summary
      }
    }
    
    // Otherwise, it's evening context (after last session)
    return false;
  }, [summary]);

  // Don't show if conditions aren't met
  if (!shouldShow || !summary) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  // TypeScript guard: summary is guaranteed to be defined here
  if (!summary) {
    return null;
  }

  const toneColors = {
    positive: "border-green-200 bg-green-50/50",
    neutral: "border-blue-200 bg-blue-50/50",
    encouraging: "border-amber-200 bg-amber-50/50",
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                  {isMorningContext ? "Yesterday's Summary" : "Today's Summary"}
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {summary.summary}
                </p>
              </div>
              {summary.tomorrow_tip && (
                <div className={`rounded-lg border p-3 ${toneColors[summary.tone] || toneColors.positive}`}>
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1">
                        {isMorningContext ? "Today's Focus" : "Tomorrow's Focus"}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {summary.tomorrow_tip}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss summary"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
