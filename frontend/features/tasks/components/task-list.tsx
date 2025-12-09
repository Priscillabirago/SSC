"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Pencil, Search, Filter, X, PlayCircle, PauseCircle, ChevronDown, ChevronRight, Plus, Trash2, Repeat, Settings, Info, Calendar, ExternalLink, ListTodo, Edit2, GripVertical, ChevronUp } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/utils";
import type { Subject, Subtask, Task, TaskStatus } from "@/lib/types";
import { useDeleteTask, useGenerateSubtasks, useUpdateTask } from "@/features/tasks/hooks";
import { useSessions } from "@/features/schedule/hooks";
import { toast } from "@/components/ui/use-toast";
import { ManageSeriesDialog } from "./manage-series-dialog";

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
  editingSubtaskDetails: { taskId: number; subtaskId: string; estimatedMinutes: number | null } | null;
  setEditingSubtaskText: (value: { taskId: number; subtaskId: string; text: string } | null) => void;
  setEditingSubtaskDetails: (value: { taskId: number; subtaskId: string; estimatedMinutes: number | null } | null) => void;
  toggleSubtask: (taskId: number, subtaskId: string) => void;
  saveSubtaskEdit: (taskId: number, subtaskId: string) => void;
  cancelSubtaskEdit: () => void;
  startEditingSubtask: (taskId: number, subtaskId: string, currentTitle: string) => void;
  startEditingSubtaskDetails: (taskId: number, subtaskId: string, e?: React.MouseEvent) => void;
  saveSubtaskDetails: (taskId: number, subtaskId: string) => void;
  cancelSubtaskDetailsEdit: () => void;
  deleteSubtask: (taskId: number, subtaskId: string) => void;
}

// Sortable Subtask Item Component
const SortableSubtaskItem = ({
  subtask,
  task,
  index,
  editingSubtaskText,
  editingSubtaskDetails,
  setEditingSubtaskText,
  setEditingSubtaskDetails,
  toggleSubtask,
  saveSubtaskEdit,
  cancelSubtaskEdit,
  startEditingSubtask,
  startEditingSubtaskDetails,
  saveSubtaskDetails,
  cancelSubtaskDetailsEdit,
  deleteSubtask,
}: SortableSubtaskItemProps) => {
  const isEditing = editingSubtaskText?.taskId === task.id && editingSubtaskText?.subtaskId === subtask.id;
  const isEditingDetails = editingSubtaskDetails?.taskId === task.id && editingSubtaskDetails?.subtaskId === subtask.id;
  
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
    disabled: isEditing || isEditingDetails
  });
  
  const estimatedTimeInputRef = useRef<HTMLInputElement>(null);
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-start gap-2 text-xs group">
        {!isEditingDetails && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
        {isEditingDetails && (
          <div className="mt-1.5 w-3.5" />
        )}
        <Checkbox
          checked={subtask.completed}
          onCheckedChange={() => toggleSubtask(task.id, subtask.id)}
          className="h-3.5 w-3.5 mt-1"
          disabled={isEditing || isEditingDetails}
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
                {subtask.estimated_minutes && (
                  <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                    ({subtask.estimated_minutes} min)
                  </span>
                )}
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startEditingSubtaskDetails(task.id, subtask.id, e);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      aria-label="Edit details"
                    >
                      <Settings className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit time & notes</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
      {isEditingDetails && editingSubtaskDetails && (
        <div 
          className="ml-8 p-2 bg-muted/50 rounded border space-y-2 z-10 relative"
        >
          <div className="flex items-center gap-2">
            <Label className="text-[10px] w-20">Est. time:</Label>
            <Input
              ref={estimatedTimeInputRef}
              type="number"
              min="0"
              className="h-6 text-xs w-20"
              placeholder="min"
              value={editingSubtaskDetails.estimatedMinutes ?? ""}
              onChange={(e) => {
                e.stopPropagation();
                setEditingSubtaskDetails({
                  ...editingSubtaskDetails,
                  estimatedMinutes: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onFocus={(e) => {
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveSubtaskDetails(task.id, subtask.id);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelSubtaskDetailsEdit();
                }
              }}
              autoFocus
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  saveSubtaskDetails(task.id, subtask.id);
                }}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelSubtaskDetailsEdit();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function TaskList({ tasks, subjects, initialSubjectFilter }: TaskListProps) {
  const router = useRouter();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const generateSubtasks = useGenerateSubtasks();
  const { data: sessions } = useSessions();
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [editAllFuture, setEditAllFuture] = useState(false);
  const [editDeadlineTime, setEditDeadlineTime] = useState<Map<number, { useTime: boolean; time: string }>>(new Map());
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: number; subtaskId: string | null } | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState<{ taskId: number; subtaskId: string; text: string } | null>(null);
  const [editingSubtaskDetails, setEditingSubtaskDetails] = useState<{ taskId: number; subtaskId: string; estimatedMinutes: number | null } | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [manageSeriesOpen, setManageSeriesOpen] = useState(false);
  const [selectedInstanceForSeries, setSelectedInstanceForSeries] = useState<Task | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["today"]));
  const [completedSectionExpanded, setCompletedSectionExpanded] = useState(true);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  
  // Timer state: track which task is being timed and when it started
  const [activeTimers, setActiveTimers] = useState<Map<number, number>>(() => {
    // Load from localStorage on mount
    if (globalThis.window !== undefined) {
      const saved = globalThis.window.localStorage.getItem("activeTaskTimers");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const map = new Map<number, number>();
          Object.entries(parsed).forEach(([taskId, startTime]) => {
            map.set(Number(taskId), Number(startTime));
          });
          return map;
        } catch {
          return new Map();
        }
      }
    }
    return new Map();
  });
  
  const [elapsedTimes, setElapsedTimes] = useState<Map<number, number>>(new Map());
  
  // Update elapsed times every second for active timers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newElapsed = new Map<number, number>();
      
      activeTimers.forEach((startTime, taskId) => {
        const elapsed = Math.floor((now - startTime) / 1000 / 60); // minutes
        newElapsed.set(taskId, elapsed);
      });
      
      setElapsedTimes(newElapsed);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeTimers]);
  
  // Save active timers to localStorage whenever they change
  useEffect(() => {
    if (globalThis.window !== undefined) {
      if (activeTimers.size > 0) {
        const obj: Record<string, number> = {};
        activeTimers.forEach((startTime, taskId) => {
          obj[String(taskId)] = startTime;
        });
        globalThis.window.localStorage.setItem("activeTaskTimers", JSON.stringify(obj));
      } else {
        globalThis.window.localStorage.removeItem("activeTaskTimers");
      }
    }
  }, [activeTimers]);
  
  const startTimer = (taskId: number) => {
    setActiveTimers((prev) => {
      const next = new Map(prev);
      next.set(taskId, Date.now());
      return next;
    });
  };
  
  const stopTimer = (taskId: number, addToActual: boolean = true) => {
    const startTime = activeTimers.get(taskId);
    if (!startTime) return;
    
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 1000 / 60);
    
    setActiveTimers((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
    
    setElapsedTimes((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
    
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
  
  const formatTimer = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Helper function to handle task completion checkbox
  const handleTaskCompletion = (task: Task, checked: boolean) => {
    if (checked && activeTimers.has(task.id)) {
      stopTimer(task.id, true);
    } else if (!checked && activeTimers.has(task.id)) {
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

  // Helper: Create date object from date part
  const createDateFromParts = (datePart: string, hours: number, minutes: number): Date | null => {
    const dateObj = new Date();
    dateObj.setFullYear(Number.parseInt(datePart.slice(0, 4), 10));
    dateObj.setMonth(Number.parseInt(datePart.slice(5, 7), 10) - 1);
    dateObj.setDate(Number.parseInt(datePart.slice(8, 10), 10));
    dateObj.setHours(hours, minutes, 0, 0);
    return Number.isFinite(dateObj.getTime()) ? dateObj : null;
  };

  // Helper: Process deadline with optional time
  const processDeadline = (payload: Partial<Task>, taskId: number): void => {
    if (payload.deadline === undefined || payload.deadline === null) return;
    
    const timeInfo = editDeadlineTime.get(taskId);
    const datePart = extractDatePart(payload.deadline);
    
    if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return;
    
    if (timeInfo?.useTime && timeInfo.time && /^\d{2}:\d{2}$/.test(timeInfo.time)) {
      const [hours, minutes] = timeInfo.time.split(':').map(Number);
      const dateObj = createDateFromParts(datePart, hours, minutes);
      if (dateObj) {
        payload.deadline = dateObj.toISOString();
      }
    } else {
      const dateObj = createDateFromParts(datePart, 23, 59);
      if (dateObj) {
        payload.deadline = dateObj.toISOString();
      }
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
    const payload = { ...draft };
    payload.subject_id ??= null;
    
    processDeadline(payload, task.id);
    
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
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deadlineDateOnly = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    if (deadlineDateOnly < today) {
      return "text-red-600 font-medium";
    } else if (deadlineDateOnly.getTime() === today.getTime()) {
      return "text-amber-600 font-medium";
    }
    return "";
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
    const currentElapsed = elapsedTimes.get(task.id) ?? 0;
    // Use total_minutes_spent (session + timer) if available, otherwise calculate
    const totalActual = task.total_minutes_spent ?? ((task.actual_minutes_spent ?? 0) + (task.timer_minutes_spent ?? 0)) + currentElapsed;
    const displayActual = totalActual > 0 ? totalActual : (task.total_minutes_spent ?? task.actual_minutes_spent);
    
    if (displayActual != null) {
      return (
        <span className={displayActual > task.estimated_minutes ? "text-red-600" : "text-green-600"}>
          {" "}• Actual: {displayActual} min
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
  
  const startEditingSubtaskDetails = (taskId: number, subtaskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    
    // Close any other editing states first
    setEditingSubtaskText(null);
    
    const task = tasks.find((t) => t.id === taskId);
    const subtask = task?.subtasks?.find((st) => st.id === subtaskId);
    if (!subtask) return;
    
    setEditingSubtaskDetails({
      taskId,
      subtaskId,
      estimatedMinutes: subtask.estimated_minutes ?? null
    });
  };
  
  const saveSubtaskDetails = (taskId: number, subtaskId: string) => {
    if (!editingSubtaskDetails?.taskId || editingSubtaskDetails.taskId !== taskId || editingSubtaskDetails.subtaskId !== subtaskId) return;
    
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.subtasks) return;
    
    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId
        ? {
            ...st,
            estimated_minutes: editingSubtaskDetails.estimatedMinutes
            // Notes removed for now
          }
        : st
    );
    
    updateTask.mutate(
      {
        id: taskId,
        payload: { subtasks: updatedSubtasks }
      },
      {
        onSuccess: () => {
          setEditingSubtaskDetails(null);
          toast({ title: "Subtask details updated" });
        }
      }
    );
  };
  
  const cancelSubtaskDetailsEdit = () => {
    setEditingSubtaskDetails(null);
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

    const deadline = new Date(task.deadline!);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const monthFromNow = new Date(today);
    monthFromNow.setMonth(monthFromNow.getMonth() + 1);
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());

    switch (filter) {
      case "overdue": {
        return deadline < today;
      }
      case "today": {
        return deadlineDate.getTime() === today.getTime();
      }
      case "this_week": {
        // Calculate start of current week (Sunday = 0, Monday = 1)
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek); // Go back to Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        
        // Calculate end of current week (Saturday)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        
        return deadline >= startOfWeek && deadline <= endOfWeek;
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
    // Sort completed tasks by most recently updated first (most recent completion at top)
    const getTaskTime = (task: Task): number => {
      if (task.updated_at) return new Date(task.updated_at).getTime();
      if (task.created_at) return new Date(task.created_at).getTime();
      return 0;
    };
    const completed = filteredAndSorted
      .filter((task) => task.is_completed)
      .sort((a, b) => {
        // Sort by updated_at if available, otherwise by created_at
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
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-blue-200 text-blue-600 bg-blue-50 cursor-help">
              <Clock className="h-2.5 w-2.5 mr-0.5" />
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
                          className="h-8 w-40 text-xs mr-2"
                          value={draft.title ?? task.title}
                          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        />
      );
    }
    return (
      <>
        <div className="flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-blue-500" />
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
          {task.is_recurring_template && (
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-purple-300 text-purple-700 bg-purple-50">
              <Repeat className="h-2.5 w-2.5 mr-0.5" />
              Recurring
            </Badge>
          )}
          {task.recurring_template_id && !task.is_recurring_template && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-purple-200 text-purple-600 bg-purple-50/50 cursor-help">
                    <Repeat className="h-2.5 w-2.5 mr-0.5" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This is an instance of a recurring task. Click "Manage Series" to edit the recurrence pattern.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor[task.priority]}`}>
                        {task.priority}
                      </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[task.status]}`}>
          {statusLabel[task.status]}
        </span>
        {renderSessionCountBadge(task.id)}
      </>
    );
  };

  // Helper: Render editing form
  const renderEditingForm = (task: Task) => (
    <>
      {task.recurring_template_id && !task.is_recurring_template && (
        <div className="w-full mb-2 space-y-1">
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
                          <Select
                            value={draft.priority ?? task.priority}
                            onValueChange={v => setDraft((d) => ({ ...d, priority: v as Task["priority"] }))}
                          >
                            <SelectTrigger className="h-7 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <Input
                            className="h-7 w-24 text-xs"
                            type="number"
                            value={draft.estimated_minutes ?? task.estimated_minutes}
                            onChange={e => setDraft((d) => ({ ...d, estimated_minutes: Number(e.target.value) }))}
        placeholder="Est. min"
                          />
                          <Input
        className="h-7 w-24 text-xs"
        type="number"
        value={draft.actual_minutes_spent ?? task.actual_minutes_spent ?? ""}
        onChange={e => setDraft((d) => ({ ...d, actual_minutes_spent: e.target.value ? Number(e.target.value) : null }))}
        placeholder="Actual min"
      />
      <div className="flex items-center gap-1">
        <Input
          className="h-7 w-32 text-xs"
                            type="date"
                            value={(() => {
                              const deadlineStr = draft.deadline || task.deadline;
                              if (!deadlineStr) return "";
                              // Parse as UTC, then convert to local date for the input
                              let deadlineDate: Date;
                              if (deadlineStr.includes('Z') || deadlineStr.includes('+') || deadlineStr.includes('-', 10)) {
                                deadlineDate = new Date(deadlineStr);
                              } else {
                                deadlineDate = new Date(deadlineStr + 'Z');
                              }
                              // Format as YYYY-MM-DD in local timezone
                              const year = deadlineDate.getFullYear();
                              const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
                              const day = String(deadlineDate.getDate()).padStart(2, '0');
                              return `${year}-${month}-${day}`;
                            })()}
                            onChange={e => setDraft((d) => ({ ...d, deadline: e.target.value }))}
                            placeholder="Due date"
                          />
        <Checkbox
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
        {editDeadlineTime.get(task.id)?.useTime && (
          <Input
            className="h-7 w-20 text-xs"
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
      <Button size="sm" className="h-7 text-xs ml-2" onClick={() => handleTaskSave(task)}>
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs ml-1" onClick={() => {
                            setEditId(null); setDraft({});
                          }}>Cancel</Button>
                        </>
  );

  // Helper: Render task display view
  const renderTaskDisplay = (task: Task, subject: Subject | undefined) => (
    <div className="flex flex-wrap gap-2 items-center">
      <span>
        Est: {task.estimated_minutes} min
        {renderActualTime(task)}
        {activeTimers.has(task.id) && (
          <span className="text-blue-600 font-medium animate-pulse">
            {" "}• ⏱️ {formatTimer(elapsedTimes.get(task.id) ?? 0)}
          </span>
        )}
      </span>
      {task.deadline && (
        <>
          <span>•</span>
          <span className={getDeadlineStyle(task.deadline)}>
            Due {formatDate(task.deadline)}
          </span>
        </>
      )}
      <span>•</span>
      <span>{subject ? subject.name : "General"}</span>
      {task.description && (
        <>
          <span>•</span>
          <span className="text-xs italic truncate max-w-xs">{task.description}</span>
        </>
                      )}
                    </div>
  );


  // Helper: Render subtask list items with drag and drop
  const renderSubtaskList = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null;
    
    // Check if any subtask is being edited - if so, disable drag for that task's list
    const hasEditingSubtask = task.subtasks.some(
      (st) => 
        (editingSubtaskText?.taskId === task.id && editingSubtaskText?.subtaskId === st.id) ||
        (editingSubtaskDetails?.taskId === task.id && editingSubtaskDetails?.subtaskId === st.id)
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
                editingSubtaskDetails={editingSubtaskDetails}
                setEditingSubtaskText={setEditingSubtaskText}
                setEditingSubtaskDetails={setEditingSubtaskDetails}
                toggleSubtask={toggleSubtask}
                saveSubtaskEdit={saveSubtaskEdit}
                cancelSubtaskEdit={cancelSubtaskEdit}
                startEditingSubtask={startEditingSubtask}
                startEditingSubtaskDetails={startEditingSubtaskDetails}
                saveSubtaskDetails={saveSubtaskDetails}
                cancelSubtaskDetailsEdit={cancelSubtaskDetailsEdit}
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
    <div className="mt-2 ml-8 flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs"
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
        <Plus className="h-3 w-3 mr-1" />
        Add checklist
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs"
        onClick={() => handleGenerateSubtasks(task)}
        disabled={generateSubtasks.isPending}
      >
        {generateSubtasks.isPending ? "Generating..." : (
          <>
            <span className="mr-1.5">✨</span>
            <span>AI generate</span>
          </>
        )}
      </Button>
    </div>
  );

  // Helper: Render expanded subtasks content
  const renderExpandedSubtasks = (task: Task, isEditingThis: boolean) => {
    if (!expandedSubtasks.has(task.id) && !isEditingThis) return null;
    return (
      <div className="mt-2 space-y-1.5">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleAddMoreSubtasks(task)}
              disabled={generateSubtasks.isPending}
            >
              {generateSubtasks.isPending ? "..." : "✨ AI add more"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Helper: Calculate total estimated minutes for subtasks
  const getTotalEstimatedMinutes = (subtasks: Subtask[] | null | undefined): number => {
    if (!subtasks) return 0;
    return subtasks.reduce((sum, st) => sum + (st.estimated_minutes ?? 0), 0);
  };

  // Helper: Render subtasks header
  const renderSubtasksHeader = (task: Task, progress: { completed: number; total: number; percent: number }) => {
    const isExpanded = expandedSubtasks.has(task.id);
    const progressText = progress.total > 0
      ? `${progress.completed}/${progress.total} subtasks (${progress.percent}%)`
      : "Subtasks";
    const totalEstimatedMinutes = getTotalEstimatedMinutes(task.subtasks);

    return (
      <div className="space-y-1.5">
        <button
          onClick={() => toggleSubtasks(task.id)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="flex-1 text-left">{progressText}</span>
          {totalEstimatedMinutes > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {totalEstimatedMinutes} min total
            </span>
          )}
        </button>
        {isExpanded && (
          <div className="space-y-1">
            <Progress value={progress.percent} className="h-1.5" />
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
    
    return (
      <div className="mt-2 ml-8 border-l-2 border-border/40 pl-3">
        {hasSubtasks ? renderSubtasksHeader(task, progress) : (
          <span className="text-xs text-muted-foreground">Checklist</span>
        )}
        {renderExpandedSubtasks(task, isEditingThis)}
      </div>
    );
  };

  // Helper: Render action buttons
  const renderTaskActions = (task: Task) => (
                  <div className="flex items-center gap-1 ml-2">
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
      {task.status !== "completed" && task.status !== "in_progress" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  startTimer(task.id);
                  updateTask.mutate(
                    { id: task.id, payload: { status: "in_progress" } },
                    { onSuccess: () => toast({ title: "Task started", description: "Timer is running..." }) }
                  );
                }}
                aria-label="Start task"
              >
                <PlayCircle className="h-3 w-3 mr-1" />
                Start
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Start working on this task and begin time tracking</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {task.status === "in_progress" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            stopTimer(task.id, true);
            updateTask.mutate(
              { id: task.id, payload: { status: "on_hold" } },
              { onSuccess: () => toast({ title: "Task paused", description: "Time has been saved." }) }
            );
          }}
          aria-label="Pause task"
        >
          <PauseCircle className="h-3 w-3 mr-1" />
          Pause
        </Button>
      )}
      {getSessionCount(task.id) > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => router.push("/schedule")}
                aria-label="View in schedule"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View in Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View this task's scheduled sessions on the Scheduler page</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
          setEditId(task.id); 
          setDraft(task);
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteTask.mutate(task.id, {
                          onSuccess: () => toast({ title: "Task removed" })
                        })
                      }
                      aria-label="Delete task"
                    >
                      Remove
                    </Button>
                  </div>
  );

  // Render a full-featured task card with all functionality
  const renderFullTaskCard = (task: Task) => {
    const subject = task.subject_id ? subjectMap.get(task.subject_id) : undefined;
    const isEditing = editId === task.id;
    return (
      <div
        key={task.id}
        className="flex items-center justify-between rounded-xl border-l-4 border-l-blue-400 border border-border/60 bg-white/80 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start gap-3 w-full">
          <Checkbox
            checked={task.is_completed}
            onCheckedChange={(checked) => handleTaskCompletion(task, checked as boolean)}
          />
          <div className="w-full">
            <div className="flex items-center gap-2">
              {renderTaskTitle(task, isEditing)}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
              {isEditing ? renderEditingForm(task) : renderTaskDisplay(task, subject)}
            </div>
            {!isEditing && renderSubtasksSection(task)}
          </div>
        </div>
        {!isEditing && renderTaskActions(task)}
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
                const timeDisplay = totalTime > 0 ? `${Math.round(totalTime / 60 * 10) / 10}h` : null;
                
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
