"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NewSubjectDialog } from "@/features/subjects/components/new-subject-dialog";
import { SubjectCard } from "@/features/subjects/components/subject-card";
import { useSubjects } from "@/features/subjects/hooks";
import { NewTaskDialog } from "@/features/tasks/components/new-task-dialog";
import { TaskList } from "@/features/tasks/components/task-list";
import { useTasks } from "@/features/tasks/hooks";

export function TasksView() {
  const router = useRouter();
  const { data: subjects, isLoading: loadingSubjects } = useSubjects();
  const { data: tasks, isLoading: loadingTasks } = useTasks();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "all">("all");
  
  const hasActiveTasks = tasks?.some(t => !t.is_completed && !t.is_recurring_template) ?? false;

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Subjects & Tasks</h1>
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
            Create and manage your tasks and subjects. These are used by the scheduler to generate your study plan.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            💡 <strong>Tip:</strong> Start by adding subjects, then create tasks for each subject with deadlines and priorities.
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
          <NewSubjectDialog />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1.1fr]">
        <Card className="h-full">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjects.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add subjects to guide how we balance your workload.
              </p>
            )}
            <div className="space-y-3">
              <button
                type="button"
                className={`w-full p-3 rounded-lg border-2 cursor-pointer transition-all text-left ${
                  selectedSubjectId === "all" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setSelectedSubjectId("all")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">All Subjects</span>
                  <span className="text-xs text-muted-foreground">
                    {tasks.filter(t => !t.is_completed && !t.is_recurring_template).length} tasks
                  </span>
                </div>
              </button>
              {subjects.map((subject) => {
                const taskCount = tasks.filter(t => !t.is_completed && !t.is_recurring_template && t.subject_id === subject.id).length;
                return (
                  <SubjectCard 
                    key={subject.id} 
                    subject={subject}
                    taskCount={taskCount}
                    onClick={() => setSelectedSubjectId(subject.id)}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
        <TaskList tasks={tasks} subjects={subjects} initialSubjectFilter={selectedSubjectId === "all" ? "all" : selectedSubjectId} />
      </div>
    </div>
  );
}

