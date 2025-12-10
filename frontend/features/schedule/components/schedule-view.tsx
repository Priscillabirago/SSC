"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Info, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MicroPlanWidget } from "@/features/schedule/components/micro-plan-widget";
import { QuickAddTaskWidget } from "@/features/schedule/components/quick-add-task-widget";
import { WeeklyTimeline } from "@/features/schedule/components/weekly-timeline";
import { WorkloadWarningsCard } from "@/features/schedule/components/workload-warnings-card";
import { useAnalyzeSchedule, useGenerateSchedule, useSessions } from "@/features/schedule/hooks";
import { toast } from "@/components/ui/use-toast";
import type { WorkloadAnalysis } from "@/features/schedule/api";

export function ScheduleView() {
  const [mounted, setMounted] = useState(false);
  const [useAiOptimization, setUseAiOptimization] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [postGenAnalysis, setPostGenAnalysis] = useState<WorkloadAnalysis | null>(null);
  useEffect(() => setMounted(true), []);

  const { data: sessions, isLoading } = useSessions();
  const generate = useGenerateSchedule();
  const analyzeSchedule = useAnalyzeSchedule();

  const handleGenerate = () => {
    generate.mutate(useAiOptimization, {
      onSuccess: (response) => {
        // Capture AI explanation if present
        if (response?.optimization_explanation) {
          setAiExplanation(response.optimization_explanation);
          setShowExplanation(true);
        } else {
          setAiExplanation(null);
          setShowExplanation(false);
        }
        
        // Analyze the generated schedule (async, non-blocking)
        analyzeSchedule.mutate(response, {
          onSuccess: (analysis) => {
            setPostGenAnalysis(analysis);
          },
          onError: (error) => {
            // Fail silently - post-gen analysis is optional
            console.error("Failed to analyze schedule:", error);
            setPostGenAnalysis(null);
          }
        });
        
        toast({ 
          title: "Schedule ready", 
          description: useAiOptimization 
            ? "Your schedule has been optimized for better real-world efficiency!" 
            : "Your next 7 days were refreshed." 
        });
      },
      onError: () => {
        setAiExplanation(null);
        setShowExplanation(false);
        setPostGenAnalysis(null);
        toast({
          variant: "destructive",
          title: "Unable to generate schedule",
          description: "Check your tasks and constraints, then try again."
        });
      }
    });
  };

  // Only render on client to prevent SSR mismatch
  if (!mounted) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      {/* Workload Warnings - shown before and after schedule generation */}
      <WorkloadWarningsCard postGenAnalysis={postGenAnalysis} />
      
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Scheduling</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">What's the difference?</p>
                  <p className="text-xs mb-2">
                    <strong>Subjects & Tasks page:</strong> Create and manage your tasks and subjects (the source data).
                  </p>
                  <p className="text-xs">
                    <strong>Scheduling page:</strong> View your auto-generated study plan based on those tasks. The scheduler creates time blocks for you to work on your tasks.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your auto-generated study plan. Sessions are created from your tasks on the Subjects & Tasks page.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Checkbox
              id="ai-optimization"
              checked={useAiOptimization}
              onCheckedChange={(checked) => setUseAiOptimization(checked === true)}
              disabled={generate.isPending}
            />
            <Label htmlFor="ai-optimization" className="text-sm font-normal cursor-pointer flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="hidden sm:inline">AI optimization</span>
              <span className="sm:hidden">AI opt.</span>
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">AI Schedule Optimization</p>
                  <p className="text-xs">
                    When enabled, AI reviews your schedule and optimizes it for real-world efficiency:
                  </p>
                  <ul className="text-xs list-disc list-inside mt-1 space-y-0.5">
                    <li>Balances workload across days</li>
                    <li>Matches task difficulty to your energy levels</li>
                    <li>Adds buffer time between sessions</li>
                    <li>Improves pacing and variety</li>
                  </ul>
                  <p className="text-xs mt-2 text-muted-foreground">
                    Takes 1-2 seconds longer but creates more realistic schedules.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleGenerate} disabled={generate.isPending} className="gap-2 w-full sm:w-auto">
                  {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  <span className="hidden sm:inline">Regenerate week</span>
                  <span className="sm:hidden">Regenerate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Regenerate Week</p>
                <p className="text-xs">
                  Creates a fresh 7-day schedule by:
                </p>
                <ul className="text-xs list-disc list-inside mt-1 space-y-0.5">
                  <li>Taking all your current tasks</li>
                  <li>Considering priorities, deadlines, and energy levels</li>
                  <li>Respecting your constraints (classes, busy times)</li>
                  <li>Placing sessions in your preferred study windows</li>
                </ul>
                <p className="text-xs mt-2 text-muted-foreground">
                  Note: This replaces your current week's schedule. Completed sessions are preserved.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {/* Schedule Updates Explanation Card */}
      {showExplanation && aiExplanation && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50/50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Schedule Updates
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {aiExplanation}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setShowExplanation(false)}
                aria-label="Dismiss explanation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {isLoading || !sessions ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr]">
          <WeeklyTimeline sessions={sessions} />
          <div className="space-y-6">
            <QuickAddTaskWidget />
            <MicroPlanWidget />
          </div>
        </div>
      )}
    </div>
  );
}

