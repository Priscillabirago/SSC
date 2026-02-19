"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Clock, Calendar, Repeat, AlertCircle, GraduationCap, Ban, CalendarX, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

import { useConstraints, useCreateConstraint, useUpdateConstraint, useDeleteConstraint } from "../hooks";
import type { Constraint, ConstraintType } from "@/lib/types";
import { localDateTimeToUTCISO, parseBackendDateTime, formatForDateTimeLocal } from "@/lib/utils";

const DAYS_OF_WEEK = [
  { value: 0, label: "Mon", fullLabel: "Monday" },
  { value: 1, label: "Tue", fullLabel: "Tuesday" },
  { value: 2, label: "Wed", fullLabel: "Wednesday" },
  { value: 3, label: "Thu", fullLabel: "Thursday" },
  { value: 4, label: "Fri", fullLabel: "Friday" },
  { value: 5, label: "Sat", fullLabel: "Saturday" },
  { value: 6, label: "Sun", fullLabel: "Sunday" },
];

const CONSTRAINT_TYPES: { value: ConstraintType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "class", label: "Class", icon: <GraduationCap className="h-4 w-4" />, description: "Regular class schedule" },
  { value: "busy", label: "Busy", icon: <Calendar className="h-4 w-4" />, description: "Work, appointments, etc." },
  { value: "blocked", label: "Blocked", icon: <Ban className="h-4 w-4" />, description: "Time you can't study" },
  { value: "no_study", label: "No Study", icon: <CalendarX className="h-4 w-4" />, description: "Prefer not to study" },
];

function getTypeIcon(type: ConstraintType) {
  const found = CONSTRAINT_TYPES.find((t) => t.value === type);
  return found?.icon || <Calendar className="h-4 w-4" />;
}

function getTypeBadgeVariant(type: ConstraintType): "default" | "destructive" | "outline" {
  if (type === "class") return "default";
  if (type === "blocked") return "destructive";
  return "outline";
}

function formatTime12h(timeStr: string): string {
  // timeStr is "HH:MM:SS" format
  const [hours, minutes] = timeStr.split(":");
  const h = Number.parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatDaysOfWeek(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return "No days selected";
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes(5) && !days.includes(6)) return "Weekdays";
  if (days.length === 2 && days.includes(5) && days.includes(6)) return "Weekends";
  
  const sortedDays = days.toSorted((a, b) => a - b);
  return sortedDays
    .map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label || "")
    .join(", ");
}

// Helper to format datetime-local input value
// Backend stores UTC, we need to convert to local time for datetime-local input
function formatDatetimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  // Parse backend datetime (handles UTC properly)
  const date = parseBackendDateTime(dateStr);
  // Use formatForDateTimeLocal which properly converts UTC to local for display
  return formatForDateTimeLocal(date);
}

// Helper to extract HH:MM from time string (handles HH:MM:SS format)
function formatTimeInput(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  return timeStr.substring(0, 5); // Take only HH:MM
}

interface ConstraintDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly existingConstraint?: Constraint | null;
}

function ConstraintDialog({ open, onOpenChange, existingConstraint }: ConstraintDialogProps) {
  const createConstraint = useCreateConstraint();
  const updateConstraint = useUpdateConstraint();
  
  const isEditMode = Boolean(existingConstraint);
  
  const [name, setName] = useState("");
  const [type, setType] = useState<ConstraintType>("class");
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [startDatetime, setStartDatetime] = useState("");
  const [endDatetime, setEndDatetime] = useState("");

  // Populate form when editing
  useEffect(() => {
    if (open && existingConstraint) {
      setName(existingConstraint.name);
      setType(existingConstraint.type);
      setIsRecurring(existingConstraint.is_recurring);
      setSelectedDays(existingConstraint.days_of_week || []);
      setStartTime(formatTimeInput(existingConstraint.start_time));
      setEndTime(formatTimeInput(existingConstraint.end_time));
      setStartDatetime(formatDatetimeLocal(existingConstraint.start_datetime));
      setEndDatetime(formatDatetimeLocal(existingConstraint.end_datetime));
    } else if (open && !existingConstraint) {
      // Reset form for new constraint
      resetForm();
    }
  }, [open, existingConstraint]);

  const resetForm = () => {
    setName("");
    setType("class");
    setIsRecurring(true);
    setSelectedDays([]);
    setStartTime("09:00");
    setEndTime("10:00");
    setStartDatetime("");
    setEndDatetime("");
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const validateRecurringConstraint = (): boolean => {
    if (selectedDays.length === 0) {
      toast({ variant: "destructive", title: "Days required", description: "Please select at least one day of the week." });
      return false;
    }
    if (!startTime || !endTime) {
      toast({ variant: "destructive", title: "Time required", description: "Please enter start and end times." });
      return false;
    }
    if (startTime >= endTime) {
      toast({ variant: "destructive", title: "Invalid times", description: "Start time must be before end time." });
      return false;
    }
    return true;
  };

  const validateOneTimeConstraint = (): boolean => {
    if (!startDatetime || !endDatetime) {
      toast({ variant: "destructive", title: "Date/time required", description: "Please enter start and end date/times." });
      return false;
    }
    if (new Date(startDatetime) >= new Date(endDatetime)) {
      toast({ variant: "destructive", title: "Invalid times", description: "Start must be before end." });
      return false;
    }
    return true;
  };

  const buildPayload = () => {
    if (isRecurring) {
      return {
        name: name.trim(),
        type,
        is_recurring: true,
        days_of_week: selectedDays,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        start_datetime: null,
        end_datetime: null,
      };
    }
    
    // Parse datetime-local strings and convert to UTC properly
    // datetime-local format: "YYYY-MM-DDTHH:MM"
    // We need to preserve the local time the user entered
    const parseDateTimeLocal = (dtLocal: string): string => {
      // Parse the datetime-local string
      const [datePart, timePart] = dtLocal.split("T");
      if (!datePart || !timePart) {
        // Fallback to old method if format is unexpected
        return new Date(dtLocal).toISOString();
      }
      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes] = timePart.split(":").map(Number);
      
      // Use localDateTimeToUTCISO to properly convert local time to UTC
      // This preserves the time the user actually entered
      return localDateTimeToUTCISO(year, month, day, hours, minutes || 0);
    };
    
    return {
      name: name.trim(),
      type,
      is_recurring: false,
      days_of_week: null,
      start_time: null,
      end_time: null,
      start_datetime: parseDateTimeLocal(startDatetime),
      end_datetime: parseDateTimeLocal(endDatetime),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Please enter a name for this blocked time." });
      return;
    }

    const isValid = isRecurring ? validateRecurringConstraint() : validateOneTimeConstraint();
    if (!isValid) return;

    const payload = buildPayload();

    if (isEditMode && existingConstraint) {
      updateConstraint.mutate(
        { id: existingConstraint.id, payload },
        {
          onSuccess: () => {
            toast({ title: "Blocked time updated", description: `"${name}" has been updated.` });
            toast({ 
              title: "Regenerate to apply", 
              description: "Regenerate your schedule to apply this change.",
              duration: 6000,
            });
            onOpenChange(false);
          },
          onError: (error: Error) => {
            toast({ variant: "destructive", title: "Failed to update", description: error.message || "Please try again." });
          },
        }
      );
    } else {
      createConstraint.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Blocked time added", description: `"${name}" has been added to your schedule.` });
          toast({ 
            title: "Regenerate to apply", 
            description: "Regenerate your schedule to remove sessions during this blocked time.",
            duration: 6000,
          });
          resetForm();
          onOpenChange(false);
        },
        onError: (error: Error) => {
          toast({ variant: "destructive", title: "Failed to add", description: error.message || "Please try again." });
        },
      });
    }
  };

  const isPending = createConstraint.isPending || updateConstraint.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditMode ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {isEditMode ? "Edit Blocked Time" : "Add Blocked Time"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? "Update this blocked time. The scheduler will avoid these times."
              : "Block time when you can't study. The scheduler will avoid these times."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., CS130 Lecture, Work Shift"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConstraintType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSTRAINT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      {t.icon}
                      <span>{t.label}</span>
                      <span className="text-xs text-muted-foreground">- {t.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center space-x-2 rounded-lg border p-3 bg-muted/30">
            <Checkbox
              id="is-recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setIsRecurring(checked === true)}
            />
            <div className="flex-1">
              <Label htmlFor="is-recurring" className="flex items-center gap-2 cursor-pointer">
                <Repeat className="h-4 w-4" />
                Recurring weekly
              </Label>
              <p className="text-xs text-muted-foreground">
                {isRecurring ? "Repeats every week on selected days" : "One-time event"}
              </p>
            </div>
          </div>

          {isRecurring ? (
            <>
              {/* Days of Week */}
              <div className="space-y-2">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={selectedDays.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      className="w-12"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Start
                  </Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    End
                  </Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* One-time datetime range */}
              <div className="space-y-2">
                <Label htmlFor="start-datetime" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date & Time
                </Label>
                <Input
                  id="start-datetime"
                  type="datetime-local"
                  value={startDatetime}
                  onChange={(e) => setStartDatetime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-datetime" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  End Date & Time
                </Label>
                <Input
                  id="end-datetime"
                  type="datetime-local"
                  value={endDatetime}
                  onChange={(e) => setEndDatetime(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {(() => {
                if (isPending) {
                  return isEditMode ? "Saving..." : "Adding...";
                }
                return isEditMode ? "Save Changes" : "Add";
              })()}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ConstraintCardProps {
  readonly constraint: Constraint;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly isDeleting: boolean;
}

function ConstraintCard({ constraint, onEdit, onDelete, isDeleting }: ConstraintCardProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getTypeIcon(constraint.type)}</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{constraint.name}</span>
            <Badge variant={getTypeBadgeVariant(constraint.type)} className="text-xs h-5">
              {constraint.type}
            </Badge>
            {constraint.is_recurring && (
              <Badge variant="outline" className="text-xs h-5">
                <Repeat className="h-3 w-3 mr-1" />
                Weekly
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {constraint.is_recurring ? (
              <>
                {formatDaysOfWeek(constraint.days_of_week)}
                {constraint.start_time && constraint.end_time && (
                  <> • {formatTime12h(constraint.start_time)} - {formatTime12h(constraint.end_time)}</>
                )}
              </>
            ) : (
              <>
                {constraint.start_datetime && format(parseBackendDateTime(constraint.start_datetime), "MMM d, h:mm a")}
                {constraint.end_datetime && <> - {format(parseBackendDateTime(constraint.end_datetime), "h:mm a")}</>}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{constraint.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the blocked time. The scheduler will be able to schedule sessions during this time again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function ConstraintsManager() {
  const { data: constraints, isLoading } = useConstraints();
  const deleteConstraint = useDeleteConstraint();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = () => {
    setEditingConstraint(null);
    setDialogOpen(true);
  };

  const handleEdit = (constraint: Constraint) => {
    setEditingConstraint(constraint);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingConstraint(null);
    }
  };

  const handleDelete = (constraintId: number) => {
    setDeletingId(constraintId);
    deleteConstraint.mutate(constraintId, {
      onSuccess: () => {
        toast({ title: "Deleted", description: "Blocked time removed." });
        toast({ 
          title: "Regenerate to apply", 
          description: "Regenerate your schedule to use this newly available time.",
          duration: 6000,
        });
        setDeletingId(null);
      },
      onError: (error: Error) => {
        toast({ variant: "destructive", title: "Failed to delete", description: error.message });
        setDeletingId(null);
      },
    });
  };

  const recurringConstraints = constraints?.filter((c) => c.is_recurring) || [];
  const oneTimeConstraints = constraints?.filter((c) => !c.is_recurring) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Blocked Times
            </CardTitle>
            <CardDescription>
              Times when you can't study (classes, work, etc.). The scheduler will avoid these.
            </CardDescription>
          </div>
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
        )}
        {!isLoading && (!constraints || constraints.length === 0) && (
          <div className="text-center py-8 space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">No blocked times set</p>
            <p className="text-xs text-muted-foreground">
              Add your class schedule, work hours, or other commitments to prevent conflicts.
            </p>
          </div>
        )}
        {!isLoading && constraints && constraints.length > 0 && (
          <>
            {recurringConstraints.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  Weekly Schedule
                </h4>
                <div className="space-y-2">
                  {recurringConstraints.map((constraint) => (
                    <ConstraintCard
                      key={constraint.id}
                      constraint={constraint}
                      onEdit={() => handleEdit(constraint)}
                      onDelete={() => handleDelete(constraint.id)}
                      isDeleting={deletingId === constraint.id}
                    />
                  ))}
                </div>
              </div>
            )}
            {oneTimeConstraints.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  One-time Events
                </h4>
                <div className="space-y-2">
                  {oneTimeConstraints.map((constraint) => (
                    <ConstraintCard
                      key={constraint.id}
                      constraint={constraint}
                      onEdit={() => handleEdit(constraint)}
                      onDelete={() => handleDelete(constraint.id)}
                      isDeleting={deletingId === constraint.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <ConstraintDialog 
        open={dialogOpen} 
        onOpenChange={handleDialogClose} 
        existingConstraint={editingConstraint}
      />
    </Card>
  );
}
