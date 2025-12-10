"use client";

import { useState, useEffect } from "react";
import { Repeat, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task, RecurrencePattern } from "@/lib/types";
import { useUpdateTask, useTasks } from "@/features/tasks/hooks";
import { toast } from "@/components/ui/use-toast";
import { RecurrenceSelector } from "./recurrence-selector";
import { localDateTimeToUTCISO } from "@/lib/utils";

interface ManageSeriesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly instance: Task;
  readonly template: Task | null;
}

export function ManageSeriesDialog({ open, onOpenChange, instance, template }: ManageSeriesDialogProps) {
  const updateTask = useUpdateTask();
  const { refetch } = useTasks();
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | null>(null);

  // Load template data when dialog opens
  useEffect(() => {
    if (open && template) {
      setRecurrencePattern(template.recurrence_pattern || null);
      setRecurrenceEndDate(template.recurrence_end_date ? template.recurrence_end_date.slice(0, 10) : null);
    }
  }, [open, template]);

  const handleSave = () => {
    if (!template) {
      toast({
        title: "Error",
        description: "Template not found"
      });
      return;
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

    // If recurrence pattern is null, we're removing recurrence
    const isRemovingRecurrence = !recurrencePattern;

    updateTask.mutate(
      {
        id: template.id,
        payload: {
          recurrence_pattern: recurrencePattern || null,
          recurrence_end_date: endDate,
          // If removing recurrence, also set is_recurring_template to false
          ...(isRemovingRecurrence ? { is_recurring_template: false } : {})
        }
      },
      {
        onSuccess: () => {
          toast({
            title: isRemovingRecurrence ? "Recurrence removed" : "Series updated",
            description: isRemovingRecurrence
              ? "This task is no longer recurring. Future instances have been removed."
              : "The recurrence pattern has been updated. Future instances will use the new pattern."
          });
          refetch(); // Refresh tasks to show updated instances
          onOpenChange(false);
        },
        onError: (error: any) => {
          toast({
            title: "Failed to update series",
            description: error?.response?.data?.detail || "Please try again"
          });
        }
      }
    );
  };

  if (!template) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-purple-600" />
            Manage Recurring Series
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-purple-900">
              <strong>Series:</strong> {template.title}
            </p>
            <p className="text-xs text-purple-700 mt-1">
              Changes will affect all future instances. Existing instances won't be modified.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Recurrence Pattern</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Update how often this task repeats. Future instances will be regenerated with the new pattern.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <RecurrenceSelector
              value={recurrencePattern}
              onChange={setRecurrencePattern}
              endDate={recurrenceEndDate}
              onEndDateChange={setRecurrenceEndDate}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateTask.isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

