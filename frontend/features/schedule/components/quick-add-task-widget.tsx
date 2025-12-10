"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { Task } from "@/lib/types";
import { useCreateTask } from "@/features/tasks/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";
import { useGenerateSchedule } from "@/features/schedule/hooks";
import { localDateTimeToUTCISO } from "@/lib/utils";

const priorities: Task["priority"][] = ["low", "medium", "high", "critical"];

export function QuickAddTaskWidget() {
  const [expanded, setExpanded] = useState(false);
  const { data: subjects } = useSubjects();
  const createTask = useCreateTask();
  const generateSchedule = useGenerateSchedule();
  const [form, setForm] = useState({
    title: "",
    description: "",
    subject_id: undefined as number | undefined,
    priority: "high" as Task["priority"], // Default to high for urgent tasks
    status: "todo" as Task["status"],
    estimated_minutes: 60,
    deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"), // Tomorrow by default
    deadlineTime: "",
    useDeadlineTime: false,
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

    // Process deadline with optional time
    let deadline: string | undefined = undefined;
    if (form.deadline) {
      // Parse date string in local timezone to avoid UTC parsing issues
      // form.deadline is in format "YYYY-MM-DD" from date input
      const dateParts = form.deadline.split('-');
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts.map(Number);
        
        if (form.useDeadlineTime && form.deadlineTime) {
          // Combine date and time in local timezone, preserving the date component
          const timeParts = form.deadlineTime.split(':');
          if (timeParts.length >= 2) {
            const [hours, minutes] = timeParts.map(Number);
            deadline = localDateTimeToUTCISO(year, month, day, hours, minutes);
          }
        } else {
          // Just date, set to end of day in local timezone, preserving the date component
          deadline = localDateTimeToUTCISO(year, month, day, 23, 59);
        }
      }
    }
    
    createTask.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        subject_id: form.subject_id,
        priority: form.priority,
        status: form.status,
        estimated_minutes: form.estimated_minutes,
        deadline,
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
            description: "",
            subject_id: undefined,
            priority: "high",
            status: "todo",
            estimated_minutes: 60,
            deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"),
            deadlineTime: "",
            useDeadlineTime: false,
          });
          setExpanded(false);
          // Optionally auto-regenerate schedule
          generateSchedule.mutate(false, {
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
      <Card className="border-2 border-dashed border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer">
        <CardContent className="p-4">
          <Button
            variant="ghost"
            className="w-full justify-center gap-2 h-auto py-2"
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
    <Card className="border-amber-200/60 bg-amber-50/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm font-semibold">Quick Add Task</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setExpanded(false);
              setForm({
                title: "",
                description: "",
                subject_id: undefined,
                priority: "high",
                status: "todo",
                estimated_minutes: 60,
                deadline: format(new Date(Date.now() + 86400000), "yyyy-MM-dd"),
                deadlineTime: "",
                useDeadlineTime: false,
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

          <div>
            <Label htmlFor="quick-description" className="text-xs">Description</Label>
            <Input
              id="quick-description"
              className="h-8 text-sm"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="quick-subject" className="text-xs">Category</Label>
              <Select
                value={form.subject_id ? String(form.subject_id) : "general"}
                onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v === "general" ? undefined : Number(v) }))}
              >
                <SelectTrigger id="quick-subject" className="h-8 text-xs">
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  {subjects?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
              <Label htmlFor="quick-status" className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as Task["status"] }))}
              >
                <SelectTrigger id="quick-status" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
            
            <div>
              <Label htmlFor="quick-deadline" className="text-xs">Due Date</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="quick-deadline"
                  type="date"
                  className="h-8 text-xs flex-1"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                />
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="quick-deadline-time"
                    className="h-4 w-4"
                    checked={form.useDeadlineTime}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, useDeadlineTime: checked === true }))}
                  />
                  <Label htmlFor="quick-deadline-time" className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                    Time
                  </Label>
                </div>
                {form.useDeadlineTime && (
                  <Input
                    type="time"
                    className="h-8 w-20 text-xs"
                    value={form.deadlineTime}
                    onChange={(e) => setForm((f) => ({ ...f, deadlineTime: e.target.value }))}
                  />
                )}
              </div>
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

