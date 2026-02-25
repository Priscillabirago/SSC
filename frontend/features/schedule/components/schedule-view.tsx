"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw, Info, Sparkles, X, ListTodo } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarExportDialog } from "@/features/schedule/components/calendar-export";
import { MicroPlanWidget } from "@/features/schedule/components/micro-plan-widget";
import { QuickAddTaskWidget } from "@/features/schedule/components/quick-add-task-widget";
import { WeeklyTimeline } from "@/features/schedule/components/weekly-timeline";
import { WorkloadWarningsCard } from "@/features/schedule/components/workload-warnings-card";
import { useAnalyzeSchedule, useGenerateSchedule, useSessions } from "@/features/schedule/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { toast } from "@/components/ui/use-toast";
import type { WorkloadAnalysis } from "@/features/schedule/api";
import type { StudySession } from "@/lib/types";
import { compareSchedules, getScheduleDiffSummary, type ScheduleDiff } from "@/features/schedule/utils/schedule-diff";

export function ScheduleView() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [useAiOptimization, setUseAiOptimization] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [postGenAnalysis, setPostGenAnalysis] = useState<WorkloadAnalysis | null>(null);
  const [scheduleDiff, setScheduleDiff] = useState<ScheduleDiff | null>(null);
  const previousSessionsRef = useRef<StudySession[]>([]);
  
  useEffect(() => setMounted(true), []);

  const { data: sessions, isLoading } = useSessions();
  const { data: tasks } = useTasks();
  const generate = useGenerateSchedule();
  const analyzeSchedule = useAnalyzeSchedule();

  const hasTasks = (tasks?.filter(t => !t.is_completed && !t.is_recurring_template).length ?? 0) > 0;
  const hasSessions = (sessions?.length ?? 0) > 0;

  // Clear diff after 5 minutes (for visual badges)
  useEffect(() => {
    if (scheduleDiff) {
      const timeout = setTimeout(() => {
        setScheduleDiff(null);
      }, 5 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [scheduleDiff]);

  const handleGenerate = () => {
    // Store current sessions as "before" state
    const beforeSessions = sessions || [];
    previousSessionsRef.current = [...beforeSessions];
    
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
        
        // Sessions will be updated via query invalidation
        // Diff will be calculated in useEffect when sessions update
        
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
        setScheduleDiff(null);
        previousSessionsRef.current = [];
        toast({
          variant: "destructive",
          title: "Unable to generate schedule",
          description: "Check your tasks and constraints, then try again."
        });
      }
    });
  };

  // Calculate diff when sessions update after regeneration
  useEffect(() => {
    // Only calculate diff if:
    // 1. We have sessions data
    // 2. We stored previous sessions (regeneration happened)
    // 3. Generation is not pending (it completed)
    // 4. Sessions actually changed (not just initial load)
    if (
      sessions && 
      previousSessionsRef.current.length > 0 && 
      !generate.isPending &&
      !isLoading
    ) {
      const diff = compareSchedules(previousSessionsRef.current, sessions);
      
      // Only show diff if there are significant changes (>2 changes)
      const totalChanges = diff.moved.length + diff.added.length + diff.removed.length;
      if (totalChanges > 2) {
        setScheduleDiff(diff);
        const summary = getScheduleDiffSummary(diff);
        if (summary) {
          toast({
            title: "Schedule updated",
            description: summary,
            duration: 5000,
          });
        }
      } else {
        setScheduleDiff(null);
      }
      
      // Clear previous sessions after calculating diff
      previousSessionsRef.current = [];
    }
  }, [sessions, generate.isPending, isLoading]);

  // During SSR and initial hydration, render a consistent skeleton
  // This prevents hydration mismatches that can block navigation
  if (!mounted) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
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
          {hasTasks && (
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
          )}
          {hasSessions && <CalendarExportDialog />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleGenerate} disabled={generate.isPending || !hasTasks} className="gap-2 w-full sm:w-auto">
                  {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  <span className="hidden sm:inline">{hasSessions ? "Regenerate week" : "Generate week"}</span>
                  <span className="sm:hidden">{hasSessions ? "Regenerate" : "Generate"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{hasSessions ? "Regenerate Week" : "Generate Week"}</p>
                {hasTasks ? (
                  <>
                    <p className="text-xs">
                      Creates a fresh 7-day schedule by:
                    </p>
                    <ul className="text-xs list-disc list-inside mt-1 space-y-0.5">
                      <li>Taking all your current tasks</li>
                      <li>Considering priorities, deadlines, and energy levels</li>
                      <li>Respecting your constraints (classes, busy times)</li>
                      <li>Placing sessions in your preferred study windows</li>
                    </ul>
                    {hasSessions && (
                      <p className="text-xs mt-2 text-muted-foreground">
                        Note: This replaces your current week's schedule. Completed sessions are preserved.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs">Add some tasks first, then generate your study plan.</p>
                )}
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

      {(isLoading || !sessions) && (
        <Skeleton className="h-64 w-full" />
      )}

      {!isLoading && sessions && !hasTasks && !hasSessions && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ListTodo className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">No tasks yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mb-5">
              Add your subjects and tasks first. The scheduler will then create a study plan around your availability and priorities.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => router.push("/tasks")}
              className="gap-2"
            >
              <ListTodo className="h-3.5 w-3.5" />
              Go to Tasks
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && sessions && (hasTasks || hasSessions) && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr]">
          <WeeklyTimeline sessions={sessions} scheduleDiff={scheduleDiff} />
          <div className="space-y-6">
            <QuickAddTaskWidget />
            <MicroPlanWidget />
          </div>
        </div>
      )}
    </div>
  );
}

