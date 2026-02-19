"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSubjects } from "@/features/subjects/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { NewSubjectDialog } from "./new-subject-dialog";
import { SubjectCard } from "./subject-card";
import { Skeleton } from "@/components/ui/skeleton";

export function ManageSubjectsDialog() {
  const [open, setOpen] = useState(false);
  const { data: subjects, isLoading } = useSubjects();
  const { data: tasks } = useTasks();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Manage Subjects</span>
          <span className="sm:hidden">Subjects</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage Subjects
          </DialogTitle>
          <DialogDescription>
            Organize your subjects. Edit colors, priorities, and exam dates.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b">
            <p className="text-sm text-muted-foreground">
              {subjects?.length || 0} subject{subjects?.length !== 1 ? "s" : ""}
            </p>
            <NewSubjectDialog />
          </div>
          <ScrollArea className="flex-1 pr-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !subjects || subjects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground mb-4">
                  No subjects yet. Create your first subject to get started.
                </p>
                <NewSubjectDialog />
              </div>
            ) : (
              <div className="space-y-3">
                {subjects.map((subject) => {
                  const taskCount = tasks?.filter(
                    (t) => !t.is_completed && !t.is_recurring_template && t.subject_id === subject.id
                  ).length || 0;
                  
                  return (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      taskCount={taskCount}
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

