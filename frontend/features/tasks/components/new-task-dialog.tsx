"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { Subject, Task, RecurrencePattern } from "@/lib/types";
import { useCreateTask } from "@/features/tasks/hooks";
import { toast } from "@/components/ui/use-toast";
import { RecurrenceSelector } from "./recurrence-selector";
import { localDateTimeToUTCISO, parseTimeToMinutes } from "@/lib/utils";

const priorities: Task["priority"][] = ["low", "medium", "high", "critical"];

interface NewTaskDialogProps {
  readonly subjects: Subject[];
}

export function NewTaskDialog({ subjects }: NewTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    subject_id: undefined as number | undefined,
    priority: "medium" as Task["priority"],
    estimated_minutes: 60,
    estimated_time_display: "1:00", // Display value in hh:mm format
    deadline: "",
    deadline_time: "",
    description: ""
  });
  const [useSpecificTime, setUseSpecificTime] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | null>(null);
  const createTask = useCreateTask();

  const handleSubmit = () => {
    // Combine date and time if time is specified
    let deadline: string | undefined = undefined;
    if (form.deadline) {
      // Parse date string in local timezone to avoid UTC parsing issues
      // form.deadline is in format "YYYY-MM-DD" from date input
      const dateParts = form.deadline.split('-');
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts.map(Number);
        
        if (useSpecificTime && form.deadline_time) {
          // Combine date and time in local timezone, preserving the date component
          const timeParts = form.deadline_time.split(':');
          if (timeParts.length >= 2) {
            const [hours, minutes] = timeParts.map(Number);
            deadline = localDateTimeToUTCISO(year, month, day, hours, minutes);
          }
        } else {
          // Date only - default to end of day (23:59) in local timezone, preserving the date component
          deadline = localDateTimeToUTCISO(year, month, day, 23, 59);
        }
      }
    }
    // Parse recurrence end date in local timezone (format: "YYYY-MM-DD")
    const endDate = recurrenceEndDate ? (() => {
      const dateParts = recurrenceEndDate.split('-');
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts.map(Number);
        return localDateTimeToUTCISO(year, month, day, 23, 59);
      }
      return undefined;
    })() : undefined;
    
    // Prepare payload - only send fields the backend expects
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      subject_id: form.subject_id ?? null,
      priority: form.priority,
      estimated_minutes: form.estimated_minutes,
      deadline: deadline ?? null,
    };

    if (recurrencePattern) {
      payload.is_recurring_template = true;
      payload.recurrence_pattern = recurrencePattern;
      if (endDate) {
        payload.recurrence_end_date = endDate;
      }
    }
    
    createTask.mutate(
      payload,
      {
        onSuccess: () => {
          toast({ 
            title: recurrencePattern ? "Recurring task created" : "Task added",
            description: recurrencePattern ? "Instances will be generated automatically" : undefined
          });
          setOpen(false);
          setForm({
            title: "",
            subject_id: undefined,
            priority: "medium",
            estimated_minutes: 60,
            estimated_time_display: "1:00",
            deadline: "",
            deadline_time: "",
            description: ""
          });
          setUseSpecificTime(false);
          setRecurrencePattern(null);
          setRecurrenceEndDate(null);
        },
        onError: (error: any) => {
          console.error("Error creating task:", error);
          const errorMessage = error?.response?.data?.detail || error?.message || "Please try again";
          const errorText = typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage);
          toast({
            title: "Failed to create task",
            description: errorText
          });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select
                value={form.subject_id ? String(form.subject_id) : "general"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    subject_id: value === "general" ? undefined : Number(value)
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={String(subject.id)}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value: Task["priority"]) =>
                  setForm((prev) => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Est. (hh:mm)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1:00"
                pattern="[0-9]{1,2}:[0-5][0-9]"
                value={form.estimated_time_display}
                onChange={(event) => {
                  const raw = event.target.value;
                  const parsed = parseTimeToMinutes(raw);
                  setForm((prev) => ({
                    ...prev,
                    estimated_time_display: raw,
                    estimated_minutes: parsed ?? 60
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>
                  Deadline
                  {recurrencePattern && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (First instance due date)
                    </span>
                  )}
                </Label>
                {recurrencePattern && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          For recurring tasks, this is the deadline for the first instance. 
                          Future instances will be calculated based on your recurrence pattern.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <Input
                type="date"
                value={form.deadline}
                onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Optional - leave empty for no deadline
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use-specific-time"
                  checked={useSpecificTime}
                  onCheckedChange={(checked) => setUseSpecificTime(checked === true)}
                />
                <Label htmlFor="use-specific-time" className="text-sm font-normal cursor-pointer">
                  Set specific time
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        If unchecked, deadline defaults to 11:59 PM on the selected date. 
                        Check this to set a specific time (e.g., 2:00 PM for an afternoon deadline).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {useSpecificTime && (
                <Input
                  type="time"
                  value={form.deadline_time}
                  onChange={(event) => setForm((prev) => ({ ...prev, deadline_time: event.target.value }))}
                  className="mt-2"
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="What does success look like?"
            />
          </div>
          <RecurrenceSelector
            value={recurrencePattern}
            onChange={setRecurrencePattern}
            endDate={recurrenceEndDate}
            onEndDateChange={setRecurrenceEndDate}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createTask.isPending || !form.title.trim()}>
              Create task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

