"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Info, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ManageSubjectsDialog } from "@/features/subjects/components/manage-subjects-dialog";
import { useSubjects } from "@/features/subjects/hooks";
import { NewTaskDialog } from "@/features/tasks/components/new-task-dialog";
import { TaskList } from "@/features/tasks/components/task-list";
import { useTasks } from "@/features/tasks/hooks";
import { cn } from "@/lib/utils";

export function TasksView() {
  const router = useRouter();
  const { data: subjects, isLoading: loadingSubjects } = useSubjects();
  const { data: tasks, isLoading: loadingTasks } = useTasks();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "all">("all");
  
  const hasActiveTasks = tasks?.some(t => !t.is_completed && !t.is_recurring_template) ?? false;

  // Calculate task counts for each subject
  const subjectTaskCounts = useMemo(() => {
    if (!tasks || !subjects) return new Map();
    const counts = new Map<number | "all", number>();
    
    // Count "all"
    counts.set("all", tasks.filter(t => !t.is_completed && !t.is_recurring_template).length);
    
    // Count per subject
    subjects.forEach(subject => {
      counts.set(
        subject.id,
        tasks.filter(t => !t.is_completed && !t.is_recurring_template && t.subject_id === subject.id).length
      );
    });
    
    return counts;
  }, [tasks, subjects]);

  if (loadingSubjects || !subjects || loadingTasks || !tasks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Tasks</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">What's the difference?</p>
                  <p className="text-xs mb-2">
                    <strong>This page:</strong> Create and manage your tasks and subjects. This is your source data.
                  </p>
                  <p className="text-xs">
                    <strong>Scheduling page:</strong> View your auto-generated study plan. The scheduler uses your tasks from here to create time blocks.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-muted-foreground">
            Create and manage your tasks. Filter by subject to focus on specific areas.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          {hasActiveTasks && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/schedule")}
                    className="gap-2 flex-1 sm:flex-initial"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Generate Schedule</span>
                    <span className="sm:hidden">Schedule</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Go to Scheduler to generate your study plan from these tasks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <NewTaskDialog subjects={subjects} />
          <ManageSubjectsDialog />
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
        <button
          type="button"
          onClick={() => setSelectedSubjectId("all")}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            "border-2 hover:bg-muted/50",
            selectedSubjectId === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground"
          )}
        >
          <span>All</span>
          <Badge variant="secondary" className="text-xs h-5 px-1.5">
            {subjectTaskCounts.get("all") || 0}
          </Badge>
        </button>
        {subjects.map((subject) => {
          const taskCount = subjectTaskCounts.get(subject.id) || 0;
          const isSelected = selectedSubjectId === subject.id;
          return (
            <button
              key={subject.id}
              type="button"
              onClick={() => setSelectedSubjectId(subject.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                "border-2 hover:bg-muted/50",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: subject.color }}
              />
              <span>{subject.name}</span>
              {taskCount > 0 && (
                <Badge variant="secondary" className="text-xs h-5 px-1.5">
                  {taskCount}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Full-width Task List */}
      <TaskList 
        tasks={tasks} 
        subjects={subjects} 
        initialSubjectFilter={selectedSubjectId === "all" ? "all" : selectedSubjectId} 
      />
    </div>
  );
}

