"use client";

import { ArrowRight, Calendar, Clock, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudySession } from "@/lib/types";
import { formatTime } from "@/lib/utils";

interface TodayPlanCardProps {
  readonly todaySessions: StudySession[];
}

export function TodayPlanCard({ todaySessions }: TodayPlanCardProps) {
  const router = useRouter();
  const completedCount = todaySessions.filter(s => s.status === "completed").length;
  const totalCount = todaySessions.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Today&apos;s Plan
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Your scheduled study sessions for today. Complete them to build your streak and improve adherence.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {totalCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {completedCount}/{totalCount} completed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {todaySessions.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No sessions scheduled today</p>
            <p className="text-xs text-muted-foreground mb-4">
              Generate a schedule to see your study plan here.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/schedule")}
              className="gap-2"
            >
              <ArrowRight className="h-3 w-3" />
              Go to Schedule
            </Button>
          </div>
        ) : (
          <>
            {totalCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-foreground">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              {todaySessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-border/50 bg-white/60 px-4 py-3 text-sm hover:bg-white/80 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="font-medium text-foreground">
                        {formatTime(session.start_time)} – {formatTime(session.end_time)}
                      </p>
                    </div>
                    <Badge 
                      variant={session.status === "completed" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {session.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    {session.focus || session.generated_by || "Study session"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
      {todaySessions.length > 0 && (
        <CardFooter>
          <Link href="/schedule" className="flex items-center gap-2 text-sm text-primary hover:underline">
            View full weekly schedule
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

