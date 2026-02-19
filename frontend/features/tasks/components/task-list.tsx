"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Pencil, Search, Filter, X, ChevronDown, ChevronRight, Plus, Trash2, Repeat, Settings, Info, Calendar, ExternalLink, ListTodo, Edit2, GripVertical, ChevronUp, MoreVertical, StickyNote, Check, Loader2, Sparkles, AlertCircle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatTimer, localDateTimeToUTCISO, parseBackendDateTime, parseTimeToMinutes } from "@/lib/utils";
import type { Subject, Subtask, Task, TaskStatus, StudySession } from "@/lib/types";
import { useDeleteTask, useGenerateSubtasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSessions } from "@/features/schedule/hooks";
import { toast } from "@/components/ui/use-toast";
import { ManageSeriesDialog } from "./manage-series-dialog";
import { useFocusSession } from "@/contexts/focus-session-context";
import { useQuickTrack } from "@/contexts/quick-track-context";
import { StartTrackingButton } from "@/components/tracking/start-tracking-button";

const priorityColor: Record<Task["priority"], string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700"
};

const statusColor: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700"
};

const statusLabel: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  on_hold: "On Hold",
  completed: "Completed"
};

// Helper to get recurrence pattern description
function getRecurrenceDescription(pattern: any): string {
  if (!pattern) return "";
  const freq = pattern.frequency || "weekly";
  const interval = pattern.interval || 1;
  
  if (freq === "daily") {
    return `Every ${interval} day${interval > 1 ? "s" : ""}`;
  } else if (freq === "weekly") {
    const days = pattern.days_of_week || [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayLabels = days.map((d: number) => dayNames[d]).join(", ");
    return `Weekly on ${dayLabels}`;
  } else if (freq === "biweekly") {
    return "Every 2 weeks";
  } else if (freq === "monthly") {
    return "Monthly";
  }
  return "Recurring";
}

type SortOption = "deadline" | "priority" | "estimated_time" | "created";
type DeadlineFilter = "all" | "overdue" | "today" | "this_week" | "this_month" | "no_deadline";

interface TaskListProps {
  readonly tasks: Task[];
  readonly subjects: Subject[];
  readonly initialSubjectFilter?: number | "all";
}

interface SortableSubtaskItemProps {
  subtask: Subtask;
  task: Task;
  index: number;
  editingSubtaskText: { taskId: number; subtaskId: string; text: string } | null;
  setEditingSubtaskText: (value: { taskId: number; subtaskId: string; text: string } | null) => void;
  toggleSubtask: (taskId: number, subtaskId: string) => void;
  saveSubtaskEdit: (taskId: number, subtaskId: string) => void;
  cancelSubtaskEdit: () => void;
  startEditingSubtask: (taskId: number, subtaskId: string, currentTitle: string) => void;
  deleteSubtask: (taskId: number, subtaskId: string) => void;
}

// Sortable Subtask Item Component
const SortableSubtaskItem = ({
  subtask,
  task,
  index,
  editingSubtaskText,
  setEditingSubtaskText,
  toggleSubtask,
  saveSubtaskEdit,
  cancelSubtaskEdit,
  startEditingSubtask,
  deleteSubtask,
}: SortableSubtaskItemProps) => {
  const isEditing = editingSubtaskText?.taskId === task.id && editingSubtaskText?.subtaskId === subtask.id;
  
  // Disable drag when editing to prevent interference
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: subtask.id,
    disabled: isEditing
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-start gap-2 text-xs group">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1.5">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <Checkbox
          checked={subtask.completed}
          onCheckedChange={() => toggleSubtask(task.id, subtask.id)}
          className="h-3.5 w-3.5 mt-1"
          disabled={isEditing}
        />
        {isEditing ? (
          <div className="flex-1 flex items-center gap-1">
            <Input
              className="h-6 text-xs flex-1"
              value={editingSubtaskText.text}
              onChange={(e) => setEditingSubtaskText({ ...editingSubtaskText, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  saveSubtaskEdit(task.id, subtask.id);
                } else if (e.key === "Escape") {
                  cancelSubtaskEdit();
                }
              }}
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => saveSubtaskEdit(task.id, subtask.id)}
              aria-label="Save"
            >
              <CheckCircle2 className="h-3 w-3 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={cancelSubtaskEdit}
              aria-label="Cancel"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`cursor-pointer hover:text-primary transition-colors text-left ${
                    subtask.completed ? "line-through text-muted-foreground" : "text-foreground"
                  }`}
                  onClick={() => startEditingSubtask(task.id, subtask.id, subtask.title)}
                  title="Click to edit title"
                >
                  {subtask.title}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => startEditingSubtask(task.id, subtask.id, subtask.title)}
                      aria-label="Edit title"
                    >
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit title</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => deleteSubtask(task.id, subtask.id)}
                      aria-label="Delete subtask"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export function TaskList({ tasks, subjects, initialSubjectFilter }: TaskListProps) {
  const router = useRouter();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const generateSubtasks = useGenerateSubtasks();
  const { data: sessions } = useSessions();
  const { startSession } = useFocusSession();
  const { startQuickTrack, stopQuickTrack, isActive: isQuickTrackActive, getElapsedTime, getStartTime } = useQuickTrack();
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [editAllFuture, setEditAllFuture] = useState(false);
  const [editDeadlineTime, setEditDeadlineTime] = useState<Map<number, { useTime: boolean; time: string }>>(new Map());
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: number; subtaskId: string | null } | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState<{ taskId: number; subtaskId: string; text: string } | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const [quickDeadlineValue, setQuickDeadlineValue] = useState<string>("");
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [editingNotes, setEditingNotes] = useState<Map<number, string>>(new Map());
  const [savingNotes, setSavingNotes] = useState<Set<number>>(new Set());
  const [pendingSaveNotes, setPendingSaveNotes] = useState<Set<number>>(new Set());
  const [notesLastEdited, setNotesLastEdited] = useState<Map<number, Date>>(new Map());
  const notesSaveTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const notesEditorRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [manageSeriesOpen, setManageSeriesOpen] = useState(false);
  const [selectedInstanceForSeries, setSelectedInstanceForSeries] = useState<Task | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["today"]));
  const [completedSectionExpanded, setCompletedSectionExpanded] = useState(true);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  
  // Helper: Check if there's an active scheduled session for a task
  const getActiveSessionForTask = (taskId: number): StudySession | null => {
    if (!sessions) return null;
    const now = new Date();
    return sessions.find((s) => {
      if (s.task_id !== taskId) return false;
      if (s.status !== "planned" && s.status !== "in_progress") return false;
      const startTime = new Date(s.start_time);
      const endTime = new Date(s.end_time);
      return startTime <= now && now <= endTime;
    }) || null;
  };
  
  const startTimer = (taskId: number, skipOverlapCheck: boolean = false) => {
    // Check for overlapping scheduled session
    if (!skipOverlapCheck) {
      const activeSession = getActiveSessionForTask(taskId);
      if (activeSession) {
        const startTime = new Date(activeSession.start_time);
        const endTime = new Date(activeSession.end_time);
        const timeStr = `${startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        
        toast({
          title: "Scheduled session in progress",
          description: `You have a session scheduled for ${timeStr}. Using Quick Track may cause double-counted time. Consider using Focus Mode from the Schedule page instead.`,
          duration: 8000,
        });
        // Still start the timer but warn the user
      }
    }
    
    // Use QuickTrackContext to start timer (syncs across pages)
    startQuickTrack(taskId);
  };
  
  const stopTimer = (taskId: number, addToActual: boolean = true) => {
    // Use QuickTrackContext to stop timer (syncs across pages)
    // stopQuickTrack returns elapsed minutes and removes timer from context
    const elapsedMinutes = stopQuickTrack(taskId, false);
    
    if (!elapsedMinutes) return; // Timer wasn't active
    
    // Save to timer_minutes_spent if requested
    if (addToActual && elapsedMinutes > 0) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        const currentTimer = task.timer_minutes_spent ?? 0;
        updateTask.mutate(
          {
            id: taskId,
            payload: {
              timer_minutes_spent: currentTimer + elapsedMinutes
            }
          },
          {
            onSuccess: () => {
              toast({
                title: "Time tracked",
                description: `Added ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} to this task.`
              });
            }
          }
        );
      }
    }
  };
  

  // Helper: Create a temporary session from a task for focus mode
  const createSessionFromTask = (task: Task): StudySession => {
    const now = new Date();
    const duration = task.estimated_minutes || 60; // Default to 60 minutes if no estimate
    const endTime = new Date(now.getTime() + duration * 60 * 1000);
    
    return {
      id: -1, // Temporary ID
      user_id: 0, // Will be set by backend if needed
      task_id: task.id,
      subject_id: task.subject_id || null,
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      status: "planned",
      focus: task.title,
    };
  };

  // Helper: Start focus mode for a task (used in multiple places)
  const startFocusModeForTask = (
    task: Task,
    taskSubject: Subject | null,
    quickTrackTimeMs: number,
    quickTrackStartTime: number | null
  ) => {
    const tempSession = createSessionFromTask(task);
    startSession(tempSession, task, taskSubject, quickTrackTimeMs, quickTrackStartTime);
    updateTask.mutate(
      { id: task.id, payload: { status: "in_progress" } },
      { onSuccess: () => toast({ title: "Focus session started", description: "Entering focus mode..." }) }
    );
  };

  // Helper function to handle task completion checkbox
  const handleTaskCompletion = (task: Task, checked: boolean) => {
    if (checked && isQuickTrackActive(task.id)) {
      stopTimer(task.id, true);
    } else if (!checked && isQuickTrackActive(task.id)) {
      startTimer(task.id);
    }
    const handleSuccess = () => {
      toast({ title: "Nice!", description: checked ? "Task marked complete." : "Task unmarked." });
    };
    updateTask.mutate(
      { 
        id: task.id, 
        payload: { 
          is_completed: checked,
          status: checked ? "completed" : "todo" as TaskStatus
        } 
      },
      { onSuccess: handleSuccess }
    );
  };

  // Helper: Extract date part from deadline
  const extractDatePart = (deadline: string | Date | null | undefined): string | null => {
    if (!deadline) return null;
    if (typeof deadline === 'string') {
      return deadline.slice(0, 10);
    }
    // deadline is already a Date object, just format it
    return deadline.toISOString().slice(0, 10);
  };

  // Helper: Process deadline with optional time
  const processDeadline = (payload: Partial<Task>, taskId: number): void => {
    // Handle clearing deadline (empty string should become null)
    if (payload.deadline === "" || payload.deadline === undefined || payload.deadline === null) {
      payload.deadline = null;
      return;
    }
    
    const timeInfo = editDeadlineTime.get(taskId);
    const datePart = extractDatePart(payload.deadline);
    
    // If date part is invalid, set deadline to null (clear it)
    if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      payload.deadline = null;
      return;
    }
    
    // Parse date components
    const year = Number.parseInt(datePart.slice(0, 4), 10);
    const month = Number.parseInt(datePart.slice(5, 7), 10);
    const day = Number.parseInt(datePart.slice(8, 10), 10);
    
    // Validate parsed values
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      payload.deadline = null;
      return;
    }
    
    if (timeInfo?.useTime && timeInfo.time && /^\d{2}:\d{2}$/.test(timeInfo.time)) {
      const timeParts = timeInfo.time.split(':');
      if (timeParts.length >= 2) {
        const [hours, minutes] = timeParts.map(Number);
        // Validate time values
        if (!Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
          // Use utility function to preserve date component when converting to UTC
          payload.deadline = localDateTimeToUTCISO(year, month, day, hours, minutes);
        } else {
          // Fallback to end of day if time parsing fails
          payload.deadline = localDateTimeToUTCISO(year, month, day, 23, 59);
        }
      } else {
        // Fallback to end of day if time parsing fails
        payload.deadline = localDateTimeToUTCISO(year, month, day, 23, 59);
      }
    } else {
      // Use utility function to preserve date component when converting to UTC
      payload.deadline = localDateTimeToUTCISO(year, month, day, 23, 59);
    }
  };

  // Helper: Create success handler
  const createSaveSuccessHandler = (task: Task) => () => {
    toast({ 
      title: editAllFuture && task.recurring_template_id ? "Series updated" : "Task updated",
      description: editAllFuture && task.recurring_template_id 
        ? "This and all future instances have been updated" 
        : undefined
    });
    setEditId(null);
    setDraft({});
    setEditAllFuture(false);
    setEditDeadlineTime(prev => {
      const next = new Map(prev);
      next.delete(task.id);
      return next;
    });
  };

  // Helper: Update recurring template
  const updateRecurringTemplate = (task: Task, payload: Partial<Task>, onSuccess: () => void): boolean => {
    if (!editAllFuture || !task.recurring_template_id) return false;
    
    const template = tasks.find(t => t.id === task.recurring_template_id && t.is_recurring_template);
    if (!template) return false;
    
    updateTask.mutate(
      {
        id: template.id,
        payload: {
          title: payload.title ?? template.title,
          description: payload.description ?? template.description,
          notes: payload.notes ?? template.notes,
          priority: payload.priority ?? template.priority,
          estimated_minutes: payload.estimated_minutes ?? template.estimated_minutes,
          subject_id: payload.subject_id ?? template.subject_id
        }
      },
      { onSuccess }
    );
    return true;
  };

  // Helper function to handle task save
  const handleTaskSave = (task: Task) => {
    const payload: Partial<Task> = {};
    
    // Only include fields that were actually edited or need to be sent
    // Copy all draft fields that exist
    if (draft.title !== undefined) payload.title = draft.title;
    if (draft.description !== undefined) payload.description = draft.description;
    if (draft.notes !== undefined) payload.notes = draft.notes;
    if (draft.priority !== undefined) payload.priority = draft.priority;
    if (draft.status !== undefined) payload.status = draft.status;
    if (draft.subject_id !== undefined) payload.subject_id = draft.subject_id ?? null;
    if (draft.subtasks !== undefined) payload.subtasks = draft.subtasks;
    
    // Always process deadline if it's in the draft (user edited it) or if we need to clear it
    if ('deadline' in draft) {
      processDeadline(payload, task.id);
    }
    
    // Handle estimated_minutes: always explicitly include it
    // The draft is initialized with task data, so estimated_minutes is always present
    // If user edited to a valid value (>= 5), send that; otherwise send original
    const draftEstimatedMinutes = draft.estimated_minutes;
    if (draftEstimatedMinutes !== undefined && draftEstimatedMinutes !== null && draftEstimatedMinutes >= 5) {
      // User entered a valid value - send it
      payload.estimated_minutes = draftEstimatedMinutes;
    } else {
      // Invalid or not edited - send original value
      // This ensures the field is always in the payload
      payload.estimated_minutes = task.estimated_minutes ?? null;
    }
    
    const handleSaveSuccess = createSaveSuccessHandler(task);
    
    if (updateRecurringTemplate(task, payload, handleSaveSuccess)) {
      return;
    }
    
    updateTask.mutate(
      {
        id: task.id, payload,
      },
      { onSuccess: handleSaveSuccess }
    );
  };

  // Helper function to handle adding more AI-generated subtasks
  const handleAddMoreSubtasks = (task: Task) => {
    const handleAddMoreSuccess = (generatedSubtasks: Subtask[]) => {
      const currentSubtasks = task.subtasks || [];
      const handleUpdateSuccess = () => {
        toast({
          title: "More subtasks added!",
          description: `AI generated ${generatedSubtasks.length} additional subtasks.`
        });
      };
      updateTask.mutate(
        {
          id: task.id,
          payload: { subtasks: [...currentSubtasks, ...generatedSubtasks] }
        },
        { onSuccess: handleUpdateSuccess }
      );
    };
    generateSubtasks.mutate(task.id, { onSuccess: handleAddMoreSuccess });
  };

  // Helper function to handle generating initial subtasks
  const handleGenerateSubtasks = (task: Task) => {
    const handleGenerateSuccess = (generatedSubtasks: Subtask[]) => {
      const handleUpdateSuccess = () => {
        toggleSubtasks(task.id);
        toast({
          title: "Subtasks generated!",
          description: `AI created ${generatedSubtasks.length} subtasks for you.`
        });
      };
      updateTask.mutate(
        {
          id: task.id,
          payload: { subtasks: generatedSubtasks }
        },
        { onSuccess: handleUpdateSuccess }
      );
    };
    const handleGenerateError = () => {
      toast({
        variant: "destructive",
        title: "Failed to generate subtasks",
        description: "Please try again or add them manually."
      });
    };
    generateSubtasks.mutate(task.id, {
      onSuccess: handleGenerateSuccess,
      onError: handleGenerateError
    });
  };

  // Helper function to get deadline styling
  const getDeadlineStyle = (deadline: string | null | undefined): string => {
    if (!deadline) return "";
    // Use parseBackendDateTime to handle UTC correctly, then use UTC date components
    const deadlineDate = parseBackendDateTime(deadline);
    const now = new Date();
    // Use UTC date components for comparison to avoid timezone shifts
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const deadlineDateOnlyUTC = new Date(Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate()));
    if (deadlineDateOnlyUTC < todayUTC) {
      return "text-red-600 font-medium";
    } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
      return "text-amber-600 font-medium";
    }
    return "";
  };

  // Helper: Get urgency info for task (overdue, due today, or normal)
  const getTaskUrgency = (task: Task): { isOverdue: boolean; isDueToday: boolean; cardBgClass: string; borderClass: string } => {
    if (!task.deadline || task.is_completed) {
      return { isOverdue: false, isDueToday: false, cardBgClass: "", borderClass: "" };
    }
    
    const deadlineDate = parseBackendDateTime(task.deadline);
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const deadlineDateOnlyUTC = new Date(Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate()));
    
    if (deadlineDateOnlyUTC < todayUTC) {
      // Overdue - more visible red tint
      return { 
        isOverdue: true, 
        isDueToday: false, 
        cardBgClass: "bg-red-50/40", 
        borderClass: "border-l-2 border-l-red-400/60" 
      };
    } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
      // Due today - more visible amber tint
      return { 
        isOverdue: false, 
        isDueToday: true, 
        cardBgClass: "bg-amber-50/40", 
        borderClass: "border-l-2 border-l-amber-400/60" 
      };
    }
    
    return { isOverdue: false, isDueToday: false, cardBgClass: "", borderClass: "" };
  };

  // Helper function to format time difference
  const formatTimeDifference = (diffMs: number): string => {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    const months = Math.floor(diffDays / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  };

  // Helper function to get completion time
  const getCompletionTime = (task: Task): Date | null => {
    if (task.updated_at) return new Date(task.updated_at);
    if (task.created_at) return new Date(task.created_at);
    return null;
  };

  // Helper function to format time since completion
  const formatTimeSinceCompletion = (task: Task): string => {
    const completionTime = getCompletionTime(task);
    if (!completionTime) return "Recently";
    
    const now = new Date();
    const diffMs = now.getTime() - completionTime.getTime();
    return formatTimeDifference(diffMs);
  };

  // Helper function to render actual time display
  const renderActualTime = (task: Task) => {
    const currentElapsed = getElapsedTime(task.id);
    // Use total_minutes_spent if available (backend computed property)
    // Otherwise calculate: actual_minutes_spent (sessions) + timer_minutes_spent (timers)
    // Only add currentElapsed if there's an active timer that hasn't been saved yet
    let totalActual: number;
    if (typeof task.total_minutes_spent === "number") {
      // Backend computed property is authoritative
      totalActual = task.total_minutes_spent + currentElapsed;
    } else {
      // Fallback calculation
      const sessionTime = task.actual_minutes_spent ?? 0;
      const timerTime = task.timer_minutes_spent ?? 0;
      totalActual = sessionTime + timerTime + currentElapsed;
    }
    
    if (totalActual > 0) {
      return (
        <span className={totalActual > task.estimated_minutes ? "text-red-600" : "text-green-600"}>
          {" "}• Actual: {formatTimer(totalActual)}
        </span>
      );
    }
    return null;
  };
  
  // Subtask management functions
  const toggleSubtasks = (taskId: number) => {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };
  
  const addSubtask = (taskId: number) => {
    if (!newSubtaskTitle.trim()) return;
    
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    
    const currentSubtasks = task.subtasks || [];
    const newSubtask: Subtask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      title: newSubtaskTitle.trim(),
      completed: false,
      estimated_minutes: null
    };
    
    const updatedSubtasks = [...currentSubtasks, newSubtask];
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks }
      },
      {
        onSuccess: () => {
          setNewSubtaskTitle("");
          // If this was the first subtask, expand the section and keep input ready
          if (currentSubtasks.length === 0) {
            setExpandedSubtasks((prev) => {
              const next = new Set(prev);
              next.add(taskId);
              return next;
            });
            // Keep editing state so user can quickly add more
            // The input will appear in the "has subtasks" section now
          } else {
            setEditingSubtask(null);
          }
          toast({ title: "Subtask added" });
        }
      }
    );
  };
  
  const toggleSubtask = (taskId: number, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.subtasks) return;
    
    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks }
      },
      {
        onSuccess: () => {
          // Check if all subtasks are completed, optionally auto-complete task
          const allCompleted = updatedSubtasks.every((st) => st.completed);
          if (allCompleted && updatedSubtasks.length > 0 && !task.is_completed) {
            toast({
              title: "All subtasks complete!",
              description: "Consider marking the task as complete."
            });
          }
        }
      }
    );
  };
  
  const deleteSubtask = (taskId: number, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.subtasks) return;
    
    const updatedSubtasks = task.subtasks.filter((st) => st.id !== subtaskId);
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks.length > 0 ? updatedSubtasks : null }
      },
      {
        onSuccess: () => toast({ title: "Subtask removed" })
      }
    );
  };
  
  const startEditingSubtask = (taskId: number, subtaskId: string, currentTitle: string) => {
    setEditingSubtaskText({ taskId, subtaskId, text: currentTitle });
  };
  
  const saveSubtaskEdit = (taskId: number, subtaskId: string) => {
    if (!editingSubtaskText?.taskId || editingSubtaskText.taskId !== taskId || editingSubtaskText.subtaskId !== subtaskId) return;
    
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.subtasks) return;
    
    const updatedText = editingSubtaskText.text.trim();
    if (!updatedText) {
      toast({ title: "Subtask title cannot be empty", variant: "destructive" });
      setEditingSubtaskText(null);
      return;
    }
    
    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, title: updatedText } : st
    );
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks }
      },
      {
        onSuccess: () => {
          setEditingSubtaskText(null);
          toast({ title: "Subtask updated" });
        }
      }
    );
  };
  
  const cancelSubtaskEdit = () => {
    setEditingSubtaskText(null);
  };
  
  const handleDragEnd = (event: DragEndEvent, taskId: number) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.subtasks) return;
    
    const oldIndex = task.subtasks.findIndex((st) => st.id === active.id);
    const newIndex = task.subtasks.findIndex((st) => st.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const updatedSubtasks = arrayMove(task.subtasks, oldIndex, newIndex);
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks }
      },
      {
        onSuccess: () => toast({ title: "Subtask reordered" })
      }
    );
  };
  
  const getSubtaskProgress = (task: Task): { completed: number; total: number; percent: number } => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return { completed: 0, total: 0, percent: 0 };
    }
    const completed = task.subtasks.filter((st) => st.completed).length;
    const total = task.subtasks.length;
    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  };
  
  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Task["priority"] | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState<number | "all">(initialSubjectFilter ?? "all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("deadline");
  
  // Update subject filter when initialSubjectFilter changes
  useEffect(() => {
    if (initialSubjectFilter !== undefined) {
      setSubjectFilter(initialSubjectFilter);
    }
  }, [initialSubjectFilter]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  // Efficiently compute session counts once (memoized)
  const sessionCounts = useMemo(() => {
    if (!sessions) return new Map<number, number>();
    const counts = new Map<number, number>();
    sessions.forEach((s) => {
      if (s.task_id) {
        counts.set(s.task_id, (counts.get(s.task_id) || 0) + 1);
      }
    });
    return counts;
  }, [sessions]);

  // Helper to get session count for a task (now O(1) lookup)
  const getSessionCount = (taskId: number): number => {
    return sessionCounts.get(taskId) || 0;
  };

  // Helper functions to reduce complexity
  const matchesSearch = (task: Task, query: string): boolean => {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    const matchesTitle = task.title.toLowerCase().includes(lowerQuery);
    const matchesDescription = task.description?.toLowerCase().includes(lowerQuery) ?? false;
    return matchesTitle || matchesDescription;
  };

  const matchesPriority = (task: Task, filter: Task["priority"] | "all"): boolean => {
    if (filter === "all") return true;
    return task.priority === filter;
  };

  const matchesSubject = (task: Task, filter: number | "all" | null): boolean => {
    if (filter === "all") return true;
    if (filter === null) return task.subject_id === null;
    return task.subject_id === filter;
  };

  const matchesDeadline = (task: Task, filter: DeadlineFilter): boolean => {
    if (filter === "all") return true;
    
    const hasDeadline = !!task.deadline;
    if (filter === "no_deadline") return !hasDeadline;
    if (!hasDeadline) return false;

    // Use parseBackendDateTime to handle UTC correctly, then use UTC date components
    const deadline = parseBackendDateTime(task.deadline!);
    const now = new Date();
    // Use UTC date components for comparison to avoid timezone shifts
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekFromNow = new Date(today);
    weekFromNow.setUTCDate(weekFromNow.getUTCDate() + 7);
    const monthFromNow = new Date(today);
    monthFromNow.setUTCMonth(monthFromNow.getUTCMonth() + 1);
    const deadlineDate = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate()));

    switch (filter) {
      case "overdue": {
        return deadline < today;
      }
      case "today": {
        return deadlineDate.getTime() === today.getTime();
      }
      case "this_week": {
        // Calculate start of current week (Sunday = 0, Monday = 1) using UTC
        const dayOfWeek = today.getUTCDay();
        const startOfWeek = new Date(today);
        startOfWeek.setUTCDate(today.getUTCDate() - dayOfWeek); // Go back to Sunday
        startOfWeek.setUTCHours(0, 0, 0, 0);
        
        // Calculate end of current week (Saturday) using UTC
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
        endOfWeek.setUTCHours(23, 59, 59, 999);
        
        return deadlineDate.getTime() >= startOfWeek.getTime() && deadlineDate.getTime() <= endOfWeek.getTime();
      }
      case "this_month": {
        return deadline >= today && deadline <= monthFromNow;
      }
      default:
        return true;
    }
  };

  const compareTasks = (a: Task, b: Task): number => {
    switch (sortBy) {
      case "deadline": {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      case "priority": {
        const priorityOrder: Record<Task["priority"], number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      case "estimated_time": {
        return b.estimated_minutes - a.estimated_minutes;
      }
      case "created": {
        return 0; // Would need created_at field
      }
      default:
        return 0;
    }
  };

  const filteredAndSorted = useMemo(() => {
    const filtered = tasks.filter((task) => {
      // Hide recurring task templates - only show instances
      if (task.is_recurring_template) {
        return false;
      }

  return (
        matchesSearch(task, searchQuery) &&
        matchesPriority(task, priorityFilter) &&
        matchesSubject(task, subjectFilter) &&
        matchesDeadline(task, deadlineFilter)
      );
    });

    return [...filtered].sort(compareTasks);
  }, [tasks, searchQuery, priorityFilter, subjectFilter, deadlineFilter, sortBy]);

  // Group tasks by urgency
  const groupedByUrgency = useMemo(() => {
    const upcoming = filteredAndSorted.filter((task) => !task.is_completed);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay())); // End of current week (Saturday)
    endOfWeek.setHours(23, 59, 59, 999);
    
    const dueToday: Task[] = [];
    const dueThisWeek: Task[] = [];
    const later: Task[] = [];
    
    upcoming.forEach((task) => {
      if (!task.deadline) {
        later.push(task);
        return;
      }
      
      const deadline = new Date(task.deadline);
      deadline.setHours(0, 0, 0, 0);
      
      if (deadline.getTime() === today.getTime()) {
        dueToday.push(task);
      } else if (deadline <= endOfWeek) {
        dueThisWeek.push(task);
      } else {
        later.push(task);
      }
    });
    
    return { dueToday, dueThisWeek, later };
  }, [filteredAndSorted]);
  
  const grouped = useMemo(() => {
    const upcoming = filteredAndSorted.filter((task) => !task.is_completed);
    // Sort completed tasks by most recently completed first
    const getTaskTime = (task: Task): number => {
      // Prefer completed_at (when task was actually completed) over updated_at
      if (task.completed_at) return new Date(task.completed_at).getTime();
      if (task.updated_at) return new Date(task.updated_at).getTime();
      if (task.created_at) return new Date(task.created_at).getTime();
      return 0;
    };
    const completed = filteredAndSorted
      .filter((task) => task.is_completed)
      .sort((a, b) => {
        // Sort by completed_at if available, otherwise by updated_at, then created_at
        const aTime = getTaskTime(a);
        const bTime = getTaskTime(b);
        return bTime - aTime; // Most recent first
      });
    return { upcoming, completed };
  }, [filteredAndSorted]);
  
  // Calculate quick stats
  const quickStats = useMemo(() => {
    const allUpcoming = tasks.filter((t) => !t.is_completed && !t.is_recurring_template);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    
    const dueToday = allUpcoming.filter((t) => {
      if (!t.deadline) return false;
      const deadline = new Date(t.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline.getTime() === today.getTime();
    }).length;
    
    const dueThisWeek = allUpcoming.filter((t) => {
      if (!t.deadline) return false;
      const deadline = new Date(t.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline <= endOfWeek && deadline > today;
    }).length;
    
    const overdue = allUpcoming.filter((t) => {
      if (!t.deadline) return false;
      const deadline = new Date(t.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline < today;
    }).length;
    
    return { dueToday, dueThisWeek, overdue, total: allUpcoming.length };
  }, [tasks]);

  const hasActiveFilters = searchQuery || priorityFilter !== "all" || subjectFilter !== "all" || deadlineFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("all");
    setSubjectFilter("all");
    setDeadlineFilter("all");
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Helper: Render session count badge
  const renderSessionCountBadge = (taskId: number) => {
    const sessionCount = getSessionCount(taskId);
    if (sessionCount === 0) return null;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="h-5 min-h-5 px-3 text-[10px] font-medium border-blue-200 text-blue-600 bg-blue-50 cursor-help inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="h-3 w-3 shrink-0" />
              {sessionCount} session{sessionCount === 1 ? "" : "s"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This task has {sessionCount} scheduled session{sessionCount === 1 ? "" : "s"}. Click "View in Schedule" to see when.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Helper: Render task title and badges
  const renderTaskTitle = (task: Task, isEditing: boolean) => {
    if (isEditing) {
      return (
        <Input
          className="h-8 flex-1 min-w-[200px] text-xs"
          value={draft.title ?? task.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Task title"
        />
      );
    }
    return (
      <div className="space-y-1.5">
        {/* Title with inline badges */}
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground break-words leading-tight flex-1 min-w-0">{task.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-full border px-2 h-5 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${priorityColor[task.priority]}`}
                >
              {task.priority}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { priority: "low" } })}
                  className={task.priority === "low" ? "bg-muted" : ""}
                >
                  Low
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { priority: "medium" } })}
                  className={task.priority === "medium" ? "bg-muted" : ""}
                >
                  Medium
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { priority: "high" } })}
                  className={task.priority === "high" ? "bg-muted" : ""}
                >
                  High
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { priority: "critical" } })}
                  className={task.priority === "critical" ? "bg-muted" : ""}
                >
                  Critical
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-full border px-2 h-5 text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${statusColor[task.status]}`}
                >
              {statusLabel[task.status]}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { status: "todo" } })}
                  className={task.status === "todo" ? "bg-muted" : ""}
                >
                  To Do
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { status: "in_progress" } })}
                  className={task.status === "in_progress" ? "bg-muted" : ""}
                >
                  In Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { status: "blocked" } })}
                  className={task.status === "blocked" ? "bg-muted" : ""}
                >
                  Blocked
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { status: "on_hold" } })}
                  className={task.status === "on_hold" ? "bg-muted" : ""}
                >
                  On Hold
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { status: "completed", is_completed: true } })}
                  className={task.status === "completed" ? "bg-muted" : ""}
                >
                  Completed
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {task.is_recurring_template && (
              <Badge variant="outline" className="h-5 px-2 text-[10px] font-medium border-purple-300 text-purple-700 bg-purple-50 flex items-center gap-1 shrink-0">
                <Repeat className="h-3 w-3" />
              </Badge>
            )}
            {task.recurring_template_id && !task.is_recurring_template && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-5 px-2 text-[10px] font-medium border-purple-200 text-purple-600 bg-purple-50/50 cursor-help flex items-center gap-1 shrink-0">
                      <Repeat className="h-3 w-3" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This is an instance of a recurring task. Click "Manage Series" to edit the recurrence pattern.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {getSessionCount(task.id) > 0 && renderSessionCountBadge(task.id)}
          </div>
        </div>
      </div>
    );
  };

  // Helper: Render editing form
  const renderEditingForm = (task: Task) => (
    <div className="w-full space-y-3">
      {task.recurring_template_id && !task.is_recurring_template && (
        <div className="w-full space-y-1">
          <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 border border-purple-200 rounded text-[10px]">
            <Checkbox
              id={`edit-all-future-${task.id}`}
              checked={editAllFuture}
              onCheckedChange={(checked) => setEditAllFuture(checked as boolean)}
              className="h-3 w-3"
            />
            <Label htmlFor={`edit-all-future-${task.id}`} className="text-purple-700 cursor-pointer flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              <span>Edit this and all future instances</span>
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-purple-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    When checked, changes will apply to this instance and all future instances. Unchecked means only this instance will be updated.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
      
      {/* First row: Category, Priority, Status */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Category</Label>
          <Select
            value={(() => {
              const currentSubjectId = draft.subject_id ?? task.subject_id;
              return currentSubjectId ? String(currentSubjectId) : "general";
            })()}
            onValueChange={v => setDraft((d) => ({ ...d, subject_id: v === "general" ? null : Number(v) }))}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="General" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Priority</Label>
          <Select
            value={draft.priority ?? task.priority}
            onValueChange={v => setDraft((d) => ({ ...d, priority: v as Task["priority"] }))}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Status</Label>
          <Select
            value={draft.status ?? task.status}
            onValueChange={v => setDraft((d) => ({ ...d, status: v as TaskStatus }))}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
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
      
      {/* Second row: Time estimates */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Est. (hh:mm)</Label>
          <Input
            className="h-7 w-24 text-xs"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1:30"
            pattern="[0-9]{1,2}:[0-5][0-9]"
            value={
              (() => {
                const minutes = draft.estimated_minutes ?? task.estimated_minutes ?? null;
                if (minutes == null) return "";
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                if (hours === 0) return `${mins}`; // allow short values like "30"
                return `${hours}:${String(mins).padStart(2, "0")}`;
              })()
            }
            onChange={e => {
              const raw = e.target.value;
              const minutes = parseTimeToMinutes(raw);
              // Always update draft with parsed value (even if < 5)
              // We'll validate on save and use original if invalid
              setDraft((d) => ({
                ...d,
                estimated_minutes: minutes ?? undefined,
              }));
            }}
          />
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Timer Time</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Time tracked via Quick Track (Tasks page timer). You can edit this to correct any mistakes.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            className="h-7 w-20 text-xs"
            type="number"
            min="0"
            value={draft.timer_minutes_spent ?? task.timer_minutes_spent ?? 0}
            onChange={e => {
              const value = e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
              setDraft((d) => ({
                ...d,
                timer_minutes_spent: Number.isNaN(value) ? 0 : value,
              }));
            }}
            placeholder="0"
          />
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Total Actual</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Session time ({task.actual_minutes_spent ?? 0} min from completed sessions) + Timer time = Total.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            className="h-7 w-20 text-xs bg-muted/50 cursor-not-allowed"
            type="number"
            value={(task.actual_minutes_spent ?? 0) + (draft.timer_minutes_spent ?? task.timer_minutes_spent ?? 0)}
            disabled
            readOnly
          />
        </div>
      </div>
      
      {/* Third row: Deadline */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Due Date</Label>
          <div className="flex items-center gap-1.5">
            <Input
              className="h-7 w-36 text-xs"
              type="date"
              value={(() => {
                const deadlineStr = draft.deadline || task.deadline;
                if (!deadlineStr) return "";
                // Parse as UTC, then extract UTC date components (preserves the date the user selected)
                let deadlineDate: Date;
                if (deadlineStr.includes('Z') || deadlineStr.includes('+') || deadlineStr.includes('-', 10)) {
                  deadlineDate = new Date(deadlineStr);
                } else {
                  deadlineDate = new Date(deadlineStr + 'Z');
                }
                // Use UTC methods to preserve the date component (since we store as UTC)
                const year = deadlineDate.getUTCFullYear();
                const month = String(deadlineDate.getUTCMonth() + 1).padStart(2, '0');
                const day = String(deadlineDate.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })()}
              onChange={e => setDraft((d) => ({ ...d, deadline: e.target.value }))}
              placeholder="Due date"
            />
            <div className="flex items-center gap-1.5">
              <Checkbox
                id={`deadline-time-${task.id}`}
                className="h-4 w-4"
                checked={editDeadlineTime.get(task.id)?.useTime ?? false}
                onCheckedChange={(checked) => {
                  setEditDeadlineTime(prev => {
                    const next = new Map(prev);
                    const current = next.get(task.id) || { useTime: false, time: "" };
                    next.set(task.id, { ...current, useTime: checked === true });
                    return next;
                  });
                }}
              />
              <Label htmlFor={`deadline-time-${task.id}`} className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                Time
              </Label>
            </div>
            {editDeadlineTime.get(task.id)?.useTime && (
              <Input
                className="h-7 w-24 text-xs"
                type="time"
                value={editDeadlineTime.get(task.id)?.time || (task.deadline ? (() => {
                  // Parse deadline as UTC, then format in local time
                  let deadlineDate: Date;
                  if (task.deadline.includes('Z') || task.deadline.includes('+') || task.deadline.includes('-', 10)) {
                    deadlineDate = new Date(task.deadline);
                  } else {
                    deadlineDate = new Date(task.deadline + 'Z');
                  }
                  return deadlineDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: false 
                  });
                })() : "")}
                onChange={e => {
                  setEditDeadlineTime(prev => {
                    const next = new Map(prev);
                    const current = next.get(task.id) || { useTime: true, time: "" };
                    next.set(task.id, { ...current, time: e.target.value });
                    return next;
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Notes field */}
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground">Notes</Label>
        <Textarea
          className="min-h-[100px] text-xs resize-y"
          placeholder="Add notes, reminders, or context for this task..."
          value={draft.notes ?? task.notes ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => handleTaskSave(task)}>
          Save
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-xs" 
          onClick={() => {
            setEditId(null); 
            setDraft({});
            setEditDeadlineTime(prev => {
              const next = new Map(prev);
              next.delete(task.id);
              return next;
            });
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  // Helper: Render task display view
  const renderTaskDisplay = (task: Task, subject: Subject | undefined) => (
    <div className="space-y-1">
      {/* Primary metadata - compact and refined */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-3 w-3 opacity-60" />
          <span>
            {formatTimer(task.estimated_minutes)}
            {renderActualTime(task)}
            {isQuickTrackActive(task.id) && (
              <span className="text-blue-600 font-medium animate-pulse ml-1">
                • {formatTimer(getElapsedTime(task.id))}
              </span>
            )}
          </span>
        </span>
        {editingDeadlineId === task.id ? (
          <>
            <span className="text-muted-foreground/40">•</span>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                className="h-6 text-xs w-32"
                value={quickDeadlineValue}
                onChange={(e) => setQuickDeadlineValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quickDeadlineValue) {
                    const [year, month, day] = quickDeadlineValue.split("-").map(Number);
                    const deadlineISO = localDateTimeToUTCISO(year, month, day, 23, 59);
                    updateTask.mutate({ id: task.id, payload: { deadline: deadlineISO } });
                    setEditingDeadlineId(null);
                    setQuickDeadlineValue("");
                  } else if (e.key === "Escape") {
                    setEditingDeadlineId(null);
                    setQuickDeadlineValue("");
                  }
                }}
                onBlur={() => {
                  if (quickDeadlineValue) {
                    const [year, month, day] = quickDeadlineValue.split("-").map(Number);
                    const deadlineISO = localDateTimeToUTCISO(year, month, day, 23, 59);
                    updateTask.mutate({ id: task.id, payload: { deadline: deadlineISO } });
                  }
                  setEditingDeadlineId(null);
                  setQuickDeadlineValue("");
                }}
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => {
                  if (quickDeadlineValue) {
                    const [year, month, day] = quickDeadlineValue.split("-").map(Number);
                    const deadlineISO = localDateTimeToUTCISO(year, month, day, 23, 59);
                    updateTask.mutate({ id: task.id, payload: { deadline: deadlineISO } });
                  }
                  setEditingDeadlineId(null);
                  setQuickDeadlineValue("");
                }}
              >
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => {
                  setEditingDeadlineId(null);
                  setQuickDeadlineValue("");
                }}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          </>
        ) : (
          <>
            {task.deadline ? (
              <>
                <span className="text-muted-foreground/40">•</span>
                <button
                  type="button"
                  className={`flex items-center gap-1 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${getDeadlineStyle(task.deadline)}`}
                  onClick={() => {
                    const deadlineDate = parseBackendDateTime(task.deadline!);
                    const year = deadlineDate.getUTCFullYear();
                    const month = String(deadlineDate.getUTCMonth() + 1).padStart(2, "0");
                    const day = String(deadlineDate.getUTCDate()).padStart(2, "0");
                    setQuickDeadlineValue(`${year}-${month}-${day}`);
                    setEditingDeadlineId(task.id);
                  }}
                  title="Click to change deadline"
                >
                  {(() => {
                    const deadlineDate = parseBackendDateTime(task.deadline!);
                    const now = new Date();
                    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    const deadlineDateOnlyUTC = new Date(Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate()));
                    
                    if (deadlineDateOnlyUTC < todayUTC) {
                      // Overdue
                      return (
                        <>
                          <AlertCircle className="h-3 w-3 text-red-600" />
                          <span>{formatDate(task.deadline)}</span>
                        </>
                      );
                    } else if (deadlineDateOnlyUTC.getTime() === todayUTC.getTime()) {
                      // Due today
                      return (
                        <>
                          <Clock className="h-3 w-3 text-amber-600" />
                          <span>{formatDate(task.deadline)}</span>
                        </>
                      );
                    } else {
                      // Future
                      return (
                        <>
              <Calendar className="h-3 w-3 opacity-60" />
              <span>{formatDate(task.deadline)}</span>
                        </>
                      );
                    }
                  })()}
                </button>
          </>
            ) : (
          <>
            <span className="text-muted-foreground/40">•</span>
                <button
                  type="button"
                  className="flex items-center gap-1 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, "0");
                    const day = String(today.getDate()).padStart(2, "0");
                    setQuickDeadlineValue(`${year}-${month}-${day}`);
                    setEditingDeadlineId(task.id);
                  }}
                  title="Click to add deadline"
                >
                  <Calendar className="h-3 w-3 opacity-60" />
                  <span>Add deadline</span>
                </button>
              </>
            )}
            <span className="text-muted-foreground/40">•</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${
                    subject ? "" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Click to change category"
                >
              <span
                className="inline-flex h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: subject?.color || "transparent" }}
              />
                  <span>{subject?.name || "No category"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem
                  onClick={() => updateTask.mutate({ id: task.id, payload: { subject_id: null } })}
                  className={subject === null || subject === undefined ? "bg-muted" : ""}
                >
                  <span className="inline-flex h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30 mr-2" />
                  <span>General</span>
                </DropdownMenuItem>
                {subjects.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => updateTask.mutate({ id: task.id, payload: { subject_id: s.id } })}
                    className={subject?.id === s.id ? "bg-muted" : ""}
                  >
                    <span
                      className="inline-flex h-2 w-2 rounded-full shrink-0 mr-2"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      {/* Description if exists */}
      {task.description && (
        <p className="text-xs text-muted-foreground/70 break-words leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}
      
      {/* Notes section */}
      {renderNotesSection(task)}
    </div>
  );


  // Helper: Format relative time (e.g., "Just now", "2 hours ago")
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString();
  };

  // Helper: Auto-save notes (called after debounce)
  const saveNotes = async (taskId: number, notesValue: string) => {
    setPendingSaveNotes(prev => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setSavingNotes(prev => new Set(prev).add(taskId));
    try {
      await updateTask.mutateAsync({ id: taskId, payload: { notes: notesValue || null } });
      setNotesLastEdited(prev => {
        const next = new Map(prev);
        next.set(taskId, new Date());
        return next;
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        variant: "destructive",
        title: "Failed to save notes",
        description: errorMessage || "Please try again.",
      });
    } finally {
      setSavingNotes(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // Debounced auto-save effect for notes
  useEffect(() => {
    editingNotes.forEach((notesValue, taskId) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      
      const currentNotes = task.notes ?? "";
      if (notesValue === currentNotes) return; // No change, skip
      
      // Clear existing timeout
      const existingTimeout = notesSaveTimeouts.current.get(taskId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      // Set pending save state
      setPendingSaveNotes(prev => new Set(prev).add(taskId));
      
      // Set new timeout for debounced save
      const timeout = setTimeout(() => {
        saveNotes(taskId, notesValue);
        notesSaveTimeouts.current.delete(taskId);
      }, 1000); // 1 second debounce
      
      notesSaveTimeouts.current.set(taskId, timeout);
    });
    
    // Cleanup on unmount
    return () => {
      notesSaveTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      notesSaveTimeouts.current.clear();
    };
  }, [editingNotes, tasks]);

  // Helper: Quick note templates
  const noteTemplates = [
    { 
      label: "Progress update", 
      text: "Progress:\n- Completed: \n- In progress: \n- Next steps: " 
    },
    { 
      label: "Stuck on...", 
      text: "Stuck on:\n- Issue: \n- Tried: \n- Need help with: " 
    },
    { 
      label: "Key learnings", 
      text: "Key learnings:\n- \n- \n- " 
    },
    { 
      label: "To review", 
      text: "To review:\n- \n- \n- " 
    },
    { 
      label: "Questions", 
      text: "Questions:\n- \n- \n- " 
    },
  ];

  const applyNoteTemplate = (taskId: number, templateText: string) => {
    const editor = notesEditorRefs.current.get(taskId);
    if (editor) {
      const selection = globalThis.getSelection();
      const range = selection?.getRangeAt(0);
      
      // Insert template at cursor or append to end
      if (range) {
        const currentNotes = editor.textContent || "";
        const newNotes = currentNotes ? `${currentNotes}\n\n${templateText}` : templateText;
        editor.textContent = newNotes;
        
        // Move cursor to first placeholder
        const firstPlaceholder = newNotes.indexOf(': ');
        if (firstPlaceholder !== -1) {
          range.setStart(editor.childNodes[0] || editor, firstPlaceholder + 2);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      } else {
        const currentNotes = editor.textContent || "";
        editor.textContent = currentNotes ? `${currentNotes}\n\n${templateText}` : templateText;
      }
      
      // Trigger input event to update state
      const event = new Event('input', { bubbles: true });
      editor.dispatchEvent(event);
    }
  };

  // Helper: Convert URLs in text to clickable links
  const convertUrlsToLinks = (element: HTMLElement) => {
    // Get all text content
    const text = element.innerText || element.textContent || "";
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    const urls = text.match(urlRegex);
    
    if (!urls || urls.length === 0) return;
    
    // Get existing links
    const existingLinks = new Set(Array.from(element.querySelectorAll('a')).map(a => a.getAttribute('href')));
    const newUrls = urls.filter(url => !existingLinks.has(url));
    
    if (newUrls.length === 0) return;
    
    // Save cursor position
    const selection = globalThis.getSelection();
    let cursorPos = 0;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      cursorPos = preCaretRange.toString().length;
    }
    
    // Simple approach: get innerHTML, replace URLs that aren't already in links
    let html = element.innerHTML;
    newUrls.forEach(url => {
      // Only replace if URL is not already inside an <a> tag
      const escapedUrl = url.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const urlInLinkRegex = new RegExp(String.raw`<a[^>]*>.*?${escapedUrl}.*?</a>`, 'gi');
      if (!urlInLinkRegex.test(html)) {
        // Replace URL with link, but preserve surrounding text
        const replaceRegex = new RegExp(String.raw`(^|[^"']|>|\s)(${escapedUrl})([^<]*?)(<|$|\s)`, 'g');
        html = html.replace(replaceRegex, (match, before, urlMatch, after, end) => {
          // Check if we're inside an existing tag
          const beforeMatch = html.substring(0, html.indexOf(match));
          const lastOpenTag = beforeMatch.lastIndexOf('<');
          const lastCloseTag = beforeMatch.lastIndexOf('>');
          if (lastOpenTag > lastCloseTag) {
            // Inside a tag, don't replace
            return match;
          }
          return `${before}<a href="${urlMatch}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline cursor-pointer" style="pointer-events: auto;" contenteditable="false">${urlMatch}</a>${after}${end}`;
        });
      }
    });
    
    if (html !== element.innerHTML) {
      element.innerHTML = html;
      
      // Restore cursor position
      if (selection && cursorPos > 0) {
        try {
          const range = document.createRange();
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let charCount = 0;
          let targetNode: Node | null = null;
          
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const nodeLength = node.textContent?.length || 0;
            if (charCount + nodeLength >= cursorPos) {
              targetNode = node;
              break;
            }
            charCount += nodeLength;
          }
          
          if (targetNode) {
            range.setStart(targetNode, Math.min(cursorPos - charCount, targetNode.textContent?.length || 0));
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (error: unknown) {
          // If restoration fails, just focus
          console.warn('Failed to restore cursor position:', error);
          element.focus();
        }
      }
    }
  };

  // Helper: Render notes section
  const renderNotesSection = (task: Task) => {
    const isExpanded = expandedNotes.has(task.id);
    const notesValue = editingNotes.get(task.id) ?? task.notes ?? "";
    const hasNotes = task.notes && task.notes.trim().length > 0;
    const isSaving = savingNotes.has(task.id);
    const isPendingSave = pendingSaveNotes.has(task.id);
    const lastEdited = notesLastEdited.get(task.id);
    const characterCount = notesValue.length;
    let notesPreview = "";
    if (hasNotes && task.notes) {
      notesPreview = task.notes.length > 50 ? `${task.notes.substring(0, 50)}...` : task.notes;
    }

    return (
      <div className="mt-2">
        {isExpanded ? (
          // Expanded state - prominent notes area
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Notes</span>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Templates
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {noteTemplates.map((template) => (
                      <DropdownMenuItem
                        key={template.label}
                        onClick={() => applyNoteTemplate(task.id, template.text)}
                      >
                        {template.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {hasNotes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={async () => {
                      if (confirm("Clear all notes?")) {
                        setEditingNotes(prev => {
                          const next = new Map(prev);
                          next.set(task.id, "");
                          return next;
                        });
                        await saveNotes(task.id, "");
                      }
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    setExpandedNotes(prev => {
                      const next = new Set(prev);
                      next.delete(task.id);
                      return next;
                    });
                  }}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="p-3">
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions, jsx-a11y/aria-role, jsx-a11y/no-noninteractive-tabindex */}
              <div
                ref={(el) => {
                  if (el) {
                    notesEditorRefs.current.set(task.id, el);
                    // Initialize content when editor is first created or when notes change externally
                    // Check if notesValue is HTML or plain text
                    const isHTML = notesValue.includes('<') && notesValue.includes('>');
                    if (isHTML) {
                      // If it's HTML, set innerHTML
                      if (el.innerHTML !== notesValue) {
                        el.innerHTML = notesValue;
                      }
                    } else if (el.textContent !== notesValue) {
                      // If it's plain text, set textContent and convert URLs
                      el.textContent = notesValue;
                      // Convert any URLs in initial content to links
                      if (notesValue) {
                        setTimeout(() => convertUrlsToLinks(el), 100);
                      }
                    }
                  } else {
                    notesEditorRefs.current.delete(task.id);
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                aria-label="Task notes editor"
                onInput={(e) => {
                  const editor = e.currentTarget;
                  const value = editor.innerText || editor.textContent || "";
                  
                  // Convert URLs to links after a short delay (debounce)
                  setTimeout(() => {
                    convertUrlsToLinks(editor);
                  }, 500);
                  
                  setEditingNotes(prev => {
                    const next = new Map(prev);
                    next.set(task.id, value);
                    return next;
                  });
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  const selection = globalThis.getSelection();
                  
                  if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    
                    // Check if pasted text contains URLs
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    if (urlRegex.test(text)) {
                      // Create a text node with URLs converted to links
                      const tempDiv = document.createElement('div');
                      tempDiv.textContent = text;
                      const html = tempDiv.innerHTML.replaceAll(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>');
                      tempDiv.innerHTML = html;
                      
                      // Insert the HTML
                      const fragment = document.createDocumentFragment();
                      while (tempDiv.firstChild) {
                        fragment.appendChild(tempDiv.firstChild);
                      }
                      range.insertNode(fragment);
                    } else {
                      // Just insert plain text
                      const textNode = document.createTextNode(text);
                      range.insertNode(textNode);
                    }
                    
                    // Move cursor after inserted content
                    range.setStartAfter(range.endContainer);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // Trigger input event
                    const inputEvent = new Event('input', { bubbles: true });
                    e.currentTarget.dispatchEvent(inputEvent);
                  }
                }}
                onKeyDown={(e) => {
                  // Handle Enter key - ensure proper newline insertion
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // eslint-disable-next-line deprecation/deprecation
                    document.execCommand('insertLineBreak', false);
                    return;
                  }
                  
                  // Handle keyboard shortcuts for formatting
                  // Detect Mac using userAgent (platform is deprecated)
                  const isMac = /Mac|iPhone|iPad|iPod/.test(globalThis.navigator.userAgent);
                  const isMod = isMac ? e.metaKey : e.ctrlKey;
                  
                  if (isMod && !e.shiftKey && !e.altKey) {
                    if (e.key === 'b' || e.key === 'B') {
                      e.preventDefault();
                      // eslint-disable-next-line deprecation/deprecation
                      document.execCommand('bold', false);
                    } else if (e.key === 'i' || e.key === 'I') {
                      e.preventDefault();
                      // eslint-disable-next-line deprecation/deprecation
                      document.execCommand('italic', false);
                    } else if (e.key === 'u' || e.key === 'U') {
                      e.preventDefault();
                      // eslint-disable-next-line deprecation/deprecation
                      document.execCommand('underline', false);
                    }
                  }
                }}
                onClick={(e) => {
                  // Make links clickable - handle clicks on <a> tags
                  const target = e.target as HTMLElement;
                  const link = target.closest('a');
                  if (link) {
                    const href = link.getAttribute('href');
                    if (href) {
                      e.preventDefault();
                      e.stopPropagation();
                      globalThis.open(href, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                onMouseDown={(e) => {
                  // Prevent contentEditable from taking focus when clicking links
                  const target = e.target as HTMLElement;
                  if (target.tagName === 'A' || target.closest('a')) {
                    e.stopPropagation();
                  }
                }}
                onBlur={(e) => {
                  // Force immediate save on blur (clear timeout and save)
                  const timeout = notesSaveTimeouts.current.get(task.id);
                  if (timeout) {
                    clearTimeout(timeout);
                    notesSaveTimeouts.current.delete(task.id);
                  }
                  
                  // Convert any remaining URLs to links before saving
                  convertUrlsToLinks(e.currentTarget);
                  
                  // Save HTML content (preserves links and formatting)
                  const value = e.currentTarget.innerHTML || "";
                  // Also get plain text for comparison
                  const plainText = e.currentTarget.innerText || e.currentTarget.textContent || "";
                  const currentNotes = task.notes ?? "";
                  
                  // Save HTML but compare with plain text to avoid unnecessary saves
                  setPendingSaveNotes(prev => {
                    const next = new Set(prev);
                    next.delete(task.id);
                    return next;
                  });
                  
                  // Only save if content has changed
                  if (plainText === currentNotes) {
                    return;
                  }
                  
                  // Save HTML content to preserve links
                  saveNotes(task.id, value);
                }}
                className="min-h-[120px] max-h-[300px] overflow-y-auto resize-y text-sm rounded-md border border-input bg-background px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 whitespace-pre-wrap break-words notes-editor"
                style={{ 
                  minHeight: '120px',
                  maxHeight: '300px',
                }}
                data-placeholder="Add notes, reminders, or context for this task..."
              />
              <style dangerouslySetInnerHTML={{ __html: `
                .notes-editor[data-placeholder]:empty:before {
                  content: attr(data-placeholder);
                  color: hsl(var(--muted-foreground));
                  pointer-events: none;
                }
              `}} />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {(() => {
                    if (isSaving || isPendingSave) {
                      return (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Saving...</span>
                        </>
                      );
                    }
                    if (lastEdited) {
                      return (
                        <>
                          <Check className="h-3 w-3 text-green-600" />
                          <span>Saved • Last edited: {formatRelativeTime(lastEdited)}</span>
                        </>
                      );
                    }
                    if (hasNotes) {
                      return <span>Saved</span>;
                    }
                    return null;
                  })()}
                </div>
                <span>{characterCount} {characterCount === 1 ? 'character' : 'characters'}</span>
              </div>
            </div>
          </div>
        ) : (
          // Collapsed state - always show button
          <button
            type="button"
            onClick={() => {
              setExpandedNotes(prev => new Set(prev).add(task.id));
              setEditingNotes(prev => {
                const next = new Map(prev);
                next.set(task.id, task.notes ?? "");
                return next;
              });
            }}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              hasNotes 
                ? "text-foreground hover:text-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <StickyNote className={`h-3.5 w-3.5 ${hasNotes ? "text-primary" : "text-muted-foreground"}`} />
            <span>{hasNotes ? `Notes: "${notesPreview}"` : "Add notes"}</span>
          </button>
        )}
      </div>
    );
  };

  // Helper: Render subtask list items with drag and drop
  const renderSubtaskList = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null;
    
    // Check if any subtask is being edited - if so, disable drag for that task's list
    const hasEditingSubtask = task.subtasks.some(
      (st) => 
        (editingSubtaskText?.taskId === task.id && editingSubtaskText?.subtaskId === st.id)
    );
    
    return (
      <DndContext
        sensors={hasEditingSubtask ? [] : sensors} // Disable drag sensors when editing
        collisionDetection={closestCenter}
        onDragEnd={(e) => {
          if (!hasEditingSubtask) {
            handleDragEnd(e, task.id);
          }
        }}
      >
        <SortableContext items={task.subtasks.map((st) => st.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {task.subtasks.map((subtask, index) => (
              <SortableSubtaskItem
                key={subtask.id}
                subtask={subtask}
                task={task}
                index={index}
                editingSubtaskText={editingSubtaskText}
                setEditingSubtaskText={setEditingSubtaskText}
                toggleSubtask={toggleSubtask}
                saveSubtaskEdit={saveSubtaskEdit}
                cancelSubtaskEdit={cancelSubtaskEdit}
                startEditingSubtask={startEditingSubtask}
                deleteSubtask={deleteSubtask}
              />
            ))}
                  </div>
        </SortableContext>
      </DndContext>
    );
  };

  // Helper: Render subtask input form
  const renderSubtaskInput = (taskId: number) => {
    if (editingSubtask?.taskId !== taskId) return null;
    return (
      <div className="flex items-center gap-1 mt-2">
        <Input
          className="h-6 text-xs flex-1"
          placeholder="New subtask..."
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addSubtask(taskId);
            } else if (e.key === "Escape") {
              setEditingSubtask(null);
              setNewSubtaskTitle("");
            }
          }}
          autoFocus
        />
        <Button size="sm" className="h-6 text-xs" onClick={() => addSubtask(taskId)}>
          Add
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => {
            setEditingSubtask(null);
            setNewSubtaskTitle("");
          }}
        >
          Cancel
        </Button>
                </div>
    );
  };

  // Helper: Render add checklist buttons
  const renderAddChecklistButtons = (task: Task) => (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditingSubtask({ taskId: task.id, subtaskId: null });
                setNewSubtaskTitle("");
                setExpandedSubtasks((prev) => {
                  const next = new Set(prev);
                  next.add(task.id);
                  return next;
                });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Checklist
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Manually add checklist items</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => handleGenerateSubtasks(task)}
              disabled={generateSubtasks.isPending}
            >
              {generateSubtasks.isPending ? "Generating..." : (
                <>
                  <span className="mr-1">✨</span>
                  <span>AI Generate Checklist</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>AI will generate subtasks based on this task</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  // Helper: Render expanded subtasks content
  const renderExpandedSubtasks = (task: Task, isEditingThis: boolean) => {
    if (!expandedSubtasks.has(task.id) && !isEditingThis) return null;
    
    const progress = task.subtasks && task.subtasks.length > 0 
      ? getSubtaskProgress(task) 
      : { completed: 0, total: 0, percent: 0 };
    
    return (
      <div className="mt-2 space-y-1.5">
        {/* Progress bar */}
        {progress.total > 0 && (
          <div className="space-y-1">
            <Progress value={progress.percent} className="h-1.5" />
          </div>
        )}
        {renderSubtaskList(task)}
        {renderSubtaskInput(task.id)}
        {!isEditingThis && (
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setEditingSubtask({ taskId: task.id, subtaskId: null });
                setNewSubtaskTitle("");
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add subtask
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => handleAddMoreSubtasks(task)}
                    disabled={generateSubtasks.isPending}
                  >
                    {generateSubtasks.isPending ? "Generating..." : (
                      <>
                        <span className="mr-1">✨</span>
                        <span>AI Add More</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI will generate additional subtasks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    );
  };


  // Helper: Render subtasks section
  const renderSubtasksSection = (task: Task) => {
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const isEditingThis = editingSubtask?.taskId === task.id;

    if (!hasSubtasks && !isEditingThis) {
      return renderAddChecklistButtons(task);
    }

    const progress = hasSubtasks ? getSubtaskProgress(task) : { completed: 0, total: 0, percent: 0 };
    const isExpanded = expandedSubtasks.has(task.id);
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => toggleSubtasks(task.id)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>
                {progress.total > 0
                  ? `${progress.completed}/${progress.total} subtasks`
                  : "Checklist"}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isExpanded ? "Collapse checklist" : "Expand checklist"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Helper: Render action buttons
  const renderTaskActions = (task: Task) => (
                  <div className="flex items-center gap-1.5">
      {task.recurring_template_id && !task.is_recurring_template && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setSelectedInstanceForSeries(task);
                  setManageSeriesOpen(true);
                }}
                aria-label="Manage series"
              >
                <Settings className="h-3 w-3 mr-1" />
                Manage Series
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit the recurrence pattern for this series</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {task.status !== "completed" && (
        <StartTrackingButton
          task={task}
          subject={task.subject_id ? subjects.find((s) => s.id === task.subject_id) : null}
          variant={task.status === "in_progress" ? "outline" : "default"}
          size="sm"
          className="h-7 text-xs"
          onFocusSessionStart={() => {
            const taskSubject = task.subject_id ? subjects.find((s) => s.id === task.subject_id) : null;
            // Get Quick Track start time BEFORE stopping (since stopQuickTrack removes it)
            const quickTrackStartTime = isQuickTrackActive(task.id) ? getStartTime(task.id) : null;
            
            // Calculate Quick Track time to preserve
            const quickTrackTimeMs = isQuickTrackActive(task.id)
              ? getElapsedTime(task.id) * 60 * 1000
              : 0;
            
            // Helper to start Focus Mode (called after Quick Track time is saved)
            const startFocusMode = () => {
              startFocusModeForTask(task, taskSubject || null, quickTrackTimeMs, quickTrackStartTime);
            };
            
            // If Quick Track is active, stop it first and wait for mutation to complete
            if (isQuickTrackActive(task.id)) {
              const elapsed = stopQuickTrack(task.id, true);
              const currentTimer = task.timer_minutes_spent ?? 0;
              updateTask.mutate(
                {
                  id: task.id,
                  payload: {
                    timer_minutes_spent: currentTimer + elapsed,
                    status: "in_progress",
                  },
                },
                {
                  onSuccess: () => {
                    // Only start Focus Mode after Quick Track time is successfully saved
                    startFocusMode();
                  },
                  onError: () => {
                    toast({
                      variant: "destructive",
                      title: "Failed to save Quick Track time",
                      description: "Could not convert to Focus Mode. Please try again.",
                    });
                  },
                }
              );
            } else {
              // No Quick Track active, start Focus Mode immediately
              startFocusMode();
            }
          }}
        />
      )}
      {getSessionCount(task.id) > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => router.push("/schedule")}
                aria-label="View in schedule"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View this task's scheduled sessions on the Scheduler page</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setEditId(task.id); 
                // Initialize draft with task data, ensuring deadline is included
                setDraft({
                  ...task,
                  deadline: task.deadline || undefined, // Ensure deadline is explicitly set
                });
                // Initialize time state if deadline has time
                if (task.deadline) {
                  // Backend sends UTC datetime, interpret as UTC then convert to local
                  let deadlineDate: Date;
                  if (task.deadline.includes('Z') || task.deadline.includes('+') || task.deadline.includes('-', 10)) {
                    deadlineDate = new Date(task.deadline);
                  } else {
                    // Naive UTC datetime - append 'Z' to interpret as UTC
                    deadlineDate = new Date(task.deadline + 'Z');
                  }
                  
                  // Check if time is significant (not end of day in UTC)
                  const hours = deadlineDate.getUTCHours();
                  const minutes = deadlineDate.getUTCMinutes();
                  const hasTime = !(hours === 23 && minutes === 59);
                  
                  if (hasTime) {
                    // Format time in local timezone for display
                    // deadlineDate is already a Date object representing UTC time
                    // toLocaleTimeString will convert it to local time automatically
                    const timeString = deadlineDate.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      hour12: false
                    });
                    setEditDeadlineTime(prev => {
                      const next = new Map(prev);
                      next.set(task.id, { useTime: true, time: timeString });
                      return next;
                    });
                  }
                }
              }}
              aria-label="Edit task"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit task</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                deleteTask.mutate(task.id, {
                  onSuccess: () => toast({ title: "Task removed" })
                })
              }
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Remove task</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
                  </div>
  );

  // Render a full-featured task card with all functionality
  const renderFullTaskCard = (task: Task) => {
    const subject = task.subject_id ? subjectMap.get(task.subject_id) : undefined;
    const isEditing = editId === task.id;
    const urgency = getTaskUrgency(task);
    
    return (
      <div
        key={task.id}
        className={`group rounded-lg border border-border/40 shadow-sm hover:border-border/60 hover:shadow transition-all ${urgency.cardBgClass || "bg-card"} ${urgency.borderClass}`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <Checkbox
            checked={task.is_completed}
            onCheckedChange={(checked) => handleTaskCompletion(task, checked as boolean)}
            className="mt-0.5 shrink-0"
          />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-3">
                {renderTaskTitle(task, isEditing)}
                {renderEditingForm(task)}
              </div>
            ) : (
              <>
                {/* Top row: Title and actions */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    {renderTaskTitle(task, isEditing)}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity -mt-1"
                        aria-label="More actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {task.recurring_template_id && !task.is_recurring_template && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedInstanceForSeries(task);
                              setManageSeriesOpen(true);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Manage Series
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {getSessionCount(task.id) > 0 && (
                        <>
                          <DropdownMenuItem onClick={() => router.push("/schedule")}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View in Schedule
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setEditId(task.id);
                          setDraft({
                            ...task,
                            deadline: task.deadline || undefined,
                          });
                          if (task.deadline) {
                            let deadlineDate: Date;
                            if (task.deadline.includes('Z') || task.deadline.includes('+') || task.deadline.includes('-', 10)) {
                              deadlineDate = new Date(task.deadline);
                            } else {
                              deadlineDate = new Date(task.deadline + 'Z');
                            }
                            const hours = deadlineDate.getUTCHours();
                            const minutes = deadlineDate.getUTCMinutes();
                            const hasTime = !(hours === 23 && minutes === 59);
                            if (hasTime) {
                              const timeString = deadlineDate.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              });
                              setEditDeadlineTime(prev => {
                                const next = new Map(prev);
                                next.set(task.id, { useTime: true, time: timeString });
                                return next;
                              });
                            }
                          }
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Task
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          deleteTask.mutate(task.id, {
                            onSuccess: () => toast({ title: "Task removed" })
                          })
                        }
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Task
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {/* Metadata row */}
                {renderTaskDisplay(task, subject)}
                
                {/* Actions row */}
                <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    {task.status !== "completed" && (
                      <StartTrackingButton
                        task={task}
                        subject={subject}
                        variant={task.status === "in_progress" ? "outline" : "default"}
                        size="sm"
                        className="h-7 text-xs"
                        onFocusSessionStart={() => {
                          const taskSubject = task.subject_id ? subjects.find((s) => s.id === task.subject_id) : null;
                          const quickTrackStartTime = isQuickTrackActive(task.id) ? getStartTime(task.id) : null;
                          const quickTrackTimeMs = isQuickTrackActive(task.id)
                            ? getElapsedTime(task.id) * 60 * 1000
                            : 0;
                          const startFocusMode = () => {
                            startFocusModeForTask(task, taskSubject || null, quickTrackTimeMs, quickTrackStartTime);
                          };
                          if (isQuickTrackActive(task.id)) {
                            const elapsed = stopQuickTrack(task.id, true);
                            const currentTimer = task.timer_minutes_spent ?? 0;
                            updateTask.mutate(
                              {
                                id: task.id,
                                payload: {
                                  timer_minutes_spent: currentTimer + elapsed,
                                  status: "in_progress",
                                },
                              },
                              {
                                onSuccess: () => startFocusMode(),
                                onError: () => {
                                  toast({
                                    variant: "destructive",
                                    title: "Failed to save Quick Track time",
                                    description: "Could not convert to Focus Mode. Please try again.",
                                  });
                                },
                              }
                            );
                          } else {
                            startFocusMode();
                          }
                        }}
                      />
                    )}
                    {renderSubtasksSection(task)}
                  </div>
                </div>
                
                {/* Expanded subtasks */}
                {expandedSubtasks.has(task.id) && (task.subtasks && task.subtasks.length > 0 || editingSubtask?.taskId === task.id) && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    {renderExpandedSubtasks(task, editingSubtask?.taskId === task.id)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      {/* Quick Stats Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-gradient-to-r from-white/90 to-white/70 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Quick Stats</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {quickStats.overdue > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                {quickStats.overdue}
              </span>
              <span className="text-muted-foreground">Overdue</span>
            </div>
          )}
          {quickStats.dueToday > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                {quickStats.dueToday}
              </span>
              <span className="text-muted-foreground">Due Today</span>
            </div>
          )}
          {quickStats.dueThisWeek > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                {quickStats.dueThisWeek}
              </span>
              <span className="text-muted-foreground">This Week</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
              {quickStats.total}
            </span>
            <span className="text-muted-foreground">Total</span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Upcoming tasks
          </CardTitle>
            <div className="text-xs text-muted-foreground">
              {grouped.upcoming.length} {grouped.upcoming.length === 1 ? "task" : "tasks"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters and Search */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
                {filtersExpanded ? (
                  <ChevronDown className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 ml-1" />
                )}
              </Button>
                    </div>
            {filtersExpanded && (
            <div className="flex flex-wrap gap-2">
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as Task["priority"] | "all")}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <Filter className="mr-2 h-3 w-3" />
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
                          <Select
                            value={(() => {
                  if (subjectFilter === "all") return "all";
                  if (subjectFilter === null) return "none";
                  return String(subjectFilter);
                            })()}
                onValueChange={(v) => {
                  if (v === "all") setSubjectFilter("all");
                  else if (v === "none") setSubjectFilter(null as any);
                  else setSubjectFilter(Number(v));
                }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Subject" />
                            </SelectTrigger>
                            <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  <SelectItem value="none">General</SelectItem>
                              {subjects.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
              <Select value={deadlineFilter} onValueChange={(v) => setDeadlineFilter(v as DeadlineFilter)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Deadline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Deadlines</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="no_deadline">No Deadline</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                  <SelectItem value="deadline">Sort by Deadline</SelectItem>
                  <SelectItem value="priority">Sort by Priority</SelectItem>
                  <SelectItem value="estimated_time">Sort by Time</SelectItem>
                            </SelectContent>
                          </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
            )}
          </div>
          
          {/* Grouped Task Sections */}
          {grouped.upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              {hasActiveFilters ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-2">No tasks match your filters.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setPriorityFilter("all");
                      setSubjectFilter("all");
                      setDeadlineFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <ListTodo className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No pending tasks</p>
                  <p className="text-xs text-muted-foreground mb-4">Create your first task to get started!</p>
                </div>
              )}
            </p>
          )}
          
          {/* Due Today Section */}
          {groupedByUrgency.dueToday.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => toggleSection("today")}
                className="flex w-full items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-left hover:bg-red-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.has("today") ? (
                    <ChevronDown className="h-4 w-4 text-red-700" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-red-700" />
                  )}
                  <span className="text-sm font-semibold text-red-900">
                    🔴 Due Today ({groupedByUrgency.dueToday.length})
                  </span>
                </div>
              </button>
              {expandedSections.has("today") && (
                <div className="space-y-2 pl-6">
                  {groupedByUrgency.dueToday.map((task) => renderFullTaskCard(task))}
                </div>
              )}
            </div>
          )}
          
          {/* This Week Section */}
          {groupedByUrgency.dueThisWeek.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => toggleSection("thisWeek")}
                className="flex w-full items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-left hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.has("thisWeek") ? (
                    <ChevronDown className="h-4 w-4 text-blue-700" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-blue-700" />
                  )}
                  <span className="text-sm font-semibold text-blue-900">
                    📅 This Week ({groupedByUrgency.dueThisWeek.length})
                  </span>
                </div>
              </button>
              {expandedSections.has("thisWeek") && (
                <div className="space-y-2 pl-6">
                  {groupedByUrgency.dueThisWeek.map((task) => renderFullTaskCard(task))}
                </div>
              )}
            </div>
          )}
          
          {/* Later Section */}
          {groupedByUrgency.later.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => toggleSection("later")}
                className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.has("later") ? (
                    <ChevronDown className="h-4 w-4 text-slate-700" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-700" />
                  )}
                  <span className="text-sm font-semibold text-slate-900">
                    📋 Later ({groupedByUrgency.later.length})
                  </span>
                </div>
              </button>
              {expandedSections.has("later") && (
                <div className="space-y-2 pl-6">
                  {groupedByUrgency.later.map((task) => renderFullTaskCard(task))}
                </div>
              )}
            </div>
          )}
          
          {/* Fallback: If no grouping matches but tasks exist, show them */}
          {grouped.upcoming.length > 0 && 
           groupedByUrgency.dueToday.length === 0 && 
           groupedByUrgency.dueThisWeek.length === 0 && 
           groupedByUrgency.later.length === 0 && (
            <div className="space-y-3">
              {grouped.upcoming.map((task) => renderFullTaskCard(task))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Completed Tasks Section */}
      {grouped.completed.length > 0 && (
        <Card className="border-muted/50">
          <CardHeader className="pb-3">
            <button
              onClick={() => setCompletedSectionExpanded(!completedSectionExpanded)}
              className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Completed recently
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {grouped.completed.length}
                </Badge>
              </div>
              {completedSectionExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {completedSectionExpanded && (
            <CardContent className="space-y-2 pt-0">
              {(showAllCompleted ? grouped.completed : grouped.completed.slice(0, 5)).map((task) => {
                const subject = task.subject_id ? subjectMap.get(task.subject_id) : undefined;
                const timeSince = formatTimeSinceCompletion(task);
                const totalTime = task.total_minutes_spent ?? ((task.actual_minutes_spent ?? 0) + (task.timer_minutes_spent ?? 0));
                const timeDisplay = totalTime > 0 ? formatTimer(totalTime) : null;
                
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border border-muted/40 bg-muted/20 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <Checkbox
                        checked={task.is_completed}
                        onCheckedChange={(checked) => handleTaskCompletion(task, checked as boolean)}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{task.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{timeSince}</span>
                          {timeDisplay && (
                            <>
                              <span>•</span>
                              <span>{timeDisplay} spent</span>
                            </>
                          )}
                          {subject && (
                            <>
                              <span>•</span>
                              <span>{subject.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {grouped.completed.length > 5 && !showAllCompleted && (
                <button
                  onClick={() => setShowAllCompleted(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center transition-colors"
                >
                  View all {grouped.completed.length} completed tasks
                </button>
              )}
              {showAllCompleted && grouped.completed.length > 5 && (
                <button
                  onClick={() => setShowAllCompleted(false)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center transition-colors"
                >
                  Show less
                </button>
              )}
            </CardContent>
          )}
        </Card>
      )}
      
      {/* Manage Series Dialog */}
      {selectedInstanceForSeries && (
        <ManageSeriesDialog
          open={manageSeriesOpen}
          onOpenChange={setManageSeriesOpen}
          instance={selectedInstanceForSeries}
          template={tasks.find(t => t.id === selectedInstanceForSeries.recurring_template_id && t.is_recurring_template) || null}
        />
      )}
    </div>
  );
}
