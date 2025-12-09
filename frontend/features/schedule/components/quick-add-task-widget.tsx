"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, X, Zap, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/lib/types";
import { useCreateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";
import { useGenerateSchedule } from "@/features/schedule/hooks";

const priorities: Task["priority"][] = ["low", "medium", "high", "critical"];

export function QuickAddTaskWidget() {
  const [expanded, setExpanded] = useState(false);
  const { data: subjects } = useSubjects();
  const createTask = useCreateTask();
  const generateSchedule = useGenerateSchedule();
  const [form, setForm] = useState({
    title: "",
    subject_id: undefined as number | undefined,
    priority: "high" as Task["priority"], // Default to high for urgent tasks
    estimated_minutes: 60,
    deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"), // Tomorrow by default
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({
        variant: "destructive",
        title: "Title required",
        description: "Please enter a task title."
      });
      return;
    }

    const deadline = form.deadline ? new Date(form.deadline).toISOString() : undefined;
    
    createTask.mutate(
      {
        ...form,
        deadline,
        status: "todo"
      },
      {
        onSuccess: () => {
          toast({ 
            title: "Task added",
            description: "Task created successfully. Regenerate schedule to include it."
          });
          // Reset form
          setForm({
            title: "",
            subject_id: undefined,
            priority: "high",
            estimated_minutes: 60,
            deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"),
          });
          setExpanded(false);
          // Optionally auto-regenerate schedule
          generateSchedule.mutate(undefined, {
            onSuccess: () => {
              toast({
                title: "Schedule updated",
                description: "Your schedule has been regenerated with the new task."
              });
            }
          });
        },
        onError: (error: any) => {
          const errorMessage = error?.response?.data?.detail || error?.message || "Please try again";
          const errorText = typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage);
          toast({
            variant: "destructive",
            title: "Failed to create task",
            description: errorText
          });
        }
      }
    );
  };

  if (!expanded) {
    return (
      <Card className="border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors">
        <CardContent className="p-4">
          <Button
            variant="ghost"
            className="w-full justify-center gap-2"
            onClick={() => setExpanded(true)}
          >
            <Plus className="h-4 w-4" />
            Quick Add Urgent Task
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm">Quick Add Task</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Quickly add an urgent task. The schedule will be automatically regenerated to include it.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setExpanded(false);
              setForm({
                title: "",
                subject_id: undefined,
                priority: "high",
                estimated_minutes: 60,
                deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"),
              });
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="quick-title" className="text-xs">Task Title *</Label>
            <Input
              id="quick-title"
              className="h-8 text-sm"
              placeholder="e.g., Review chapter 5"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="quick-priority" className="text-xs">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Task["priority"] }))}
              >
                <SelectTrigger id="quick-priority" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="quick-minutes" className="text-xs">Est. (min)</Label>
              <Input
                id="quick-minutes"
                type="number"
                min={15}
                step={15}
                className="h-8 text-xs"
                value={form.estimated_minutes}
                onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="quick-subject" className="text-xs">Subject</Label>
              <Select
                value={form.subject_id ? String(form.subject_id) : "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v === "none" ? undefined : Number(v) }))}
              >
                <SelectTrigger id="quick-subject" className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subjects?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="quick-deadline" className="text-xs">Deadline</Label>
              <Input
                id="quick-deadline"
                type="date"
                className="h-8 text-xs"
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-8 text-xs"
            disabled={createTask.isPending || !form.title.trim()}
          >
            {createTask.isPending ? "Adding..." : "Add & Regenerate Schedule"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

