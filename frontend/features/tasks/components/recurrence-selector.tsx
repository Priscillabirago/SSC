"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Repeat, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RecurrencePattern } from "@/lib/types";

interface RecurrenceSelectorProps {
  readonly value: RecurrencePattern | null;
  readonly onChange: (pattern: RecurrencePattern | null) => void;
  readonly endDate: string | null;
  readonly onEndDateChange: (date: string | null) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" }
];

export function RecurrenceSelector({
  value,
  onChange,
  endDate,
  onEndDateChange
}: RecurrenceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(!!value);

  const handleToggleRecurring = (checked: boolean) => {
    setIsRecurring(checked);
    if (checked) {
      // Set default pattern
      onChange({
        frequency: "weekly",
        interval: 1,
        days_of_week: [1], // Tuesday
        advance_days: 3
      });
    } else {
      onChange(null);
      onEndDateChange(null);
    }
  };

  const updatePattern = (updates: Partial<RecurrencePattern>) => {
    if (!value) return;
    onChange({ ...value, ...updates });
  };

  if (!isRecurring) {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id="recurring"
          checked={false}
          onCheckedChange={handleToggleRecurring}
        />
        <Label htmlFor="recurring" className="flex items-center gap-2 cursor-pointer">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          <span>Make this recurring</span>
        </Label>
      </div>
    );
  }

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="recurring"
            checked={true}
            onCheckedChange={handleToggleRecurring}
          />
          <Label htmlFor="recurring" className="flex items-center gap-2 cursor-pointer">
            <Repeat className="h-4 w-4" />
            <span className="font-medium">Recurring task</span>
          </Label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="h-6 text-xs"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {isOpen && value && (
        <div className="space-y-3 pt-2 pl-6 border-l-2 border-border/40">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Frequency</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>How often the task repeats: Daily, Weekly, Bi-weekly, or Monthly</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={value.frequency}
                onValueChange={(freq) =>
                  updatePattern({
                    frequency: freq as RecurrencePattern["frequency"],
                    // Reset pattern-specific fields when frequency changes
                    days_of_week: freq === "weekly" || freq === "biweekly" ? [1] : undefined,
                    day_of_month: freq === "monthly" ? 1 : undefined,
                    week_of_month: undefined
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {value.frequency === "daily" && (
              <div className="space-y-2">
                <Label className="text-xs">Every N days</Label>
                <Input
                  type="number"
                  min={1}
                  value={value.interval || 1}
                  onChange={(e) => updatePattern({ interval: Number(e.target.value) })}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {(value.frequency === "weekly" || value.frequency === "biweekly") && (
              <div className="space-y-2">
                <Label className="text-xs">Day(s) of week</Label>
                <div className="flex flex-wrap gap-1">
                  {DAYS_OF_WEEK.map((day) => (
                    <Button
                      key={day.value}
                      variant={
                        value.days_of_week?.includes(day.value) ? "default" : "outline"
                      }
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => {
                        const current = value.days_of_week || [];
                        const updated = current.includes(day.value)
                          ? current.filter((d) => d !== day.value)
                          : [...current, day.value].sort((a, b) => a - b);
                        updatePattern({ days_of_week: updated.length > 0 ? updated : [day.value] });
                      }}
                    >
                      {day.label.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {value.frequency === "monthly" && (
              <div className="space-y-2">
                <Label className="text-xs">Day of month</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={value.day_of_month || 1}
                  onChange={(e) =>
                    updatePattern({ day_of_month: Number(e.target.value) })
                  }
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>

          {value.frequency === "daily" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="weekdays-only"
                checked={value.weekdays_only || false}
                onCheckedChange={(checked) =>
                  updatePattern({ weekdays_only: checked as boolean })
                }
              />
              <Label htmlFor="weekdays-only" className="text-xs cursor-pointer">
                Weekdays only (Mon-Fri)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Create instances N days early</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Instances will appear in your task list this many days before their deadline. 
                        This helps you plan ahead and see upcoming tasks early.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="number"
                min={0}
                value={value.advance_days || 3}
                onChange={(e) => updatePattern({ advance_days: Number(e.target.value) })}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Instances appear in your list this many days before their deadline (for planning ahead)
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End date (optional)</Label>
              <Input
                type="date"
                value={endDate || ""}
                onChange={(e) => onEndDateChange(e.target.value || null)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

