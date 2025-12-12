export type StudyWindow = "morning" | "afternoon" | "evening" | "night";

export interface CustomTimeRange {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface StudyWindowConfig {
  type: "preset" | "custom";
  value: StudyWindow | CustomTimeRange;
}

// Support both old format (list of strings) and new format (list of configs)
export type PreferredStudyWindows = StudyWindow[] | StudyWindowConfig[];

export interface UserProfile {
  id: number;
  email: string;
  full_name?: string;
  timezone: string;
  weekly_study_hours: number;
  preferred_study_windows: PreferredStudyWindows;
  max_session_length: number;
  break_duration: number;
  energy_tagging_enabled: boolean;
}

export type SubjectPriority = "low" | "medium" | "high";
export type SubjectDifficulty = "easy" | "medium" | "hard";

export interface Subject {
  id: number;
  user_id: number;
  name: string;
  priority: SubjectPriority;
  difficulty: SubjectDifficulty;
  workload: number;
  exam_date?: string;
  color: string;
}

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "on_hold" | "completed";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  estimated_minutes?: number | null;
  notes?: string | null;
}

export interface RecurrencePattern {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  interval?: number;
  days_of_week?: number[];
  day_of_month?: number;
  week_of_month?: number;
  advance_days?: number;
  weekdays_only?: boolean;
}

export interface Task {
  id: number;
  user_id: number;
  subject_id?: number | null;
  title: string;
  description?: string | null;
  deadline?: string | null;
  estimated_minutes: number;
  actual_minutes_spent?: number | null;  // Session time only
  timer_minutes_spent?: number | null;  // Timer time only
  total_minutes_spent?: number | null;  // Computed: session + timer
  priority: TaskPriority;
  status: TaskStatus;
  subtasks?: Subtask[] | null;
  is_completed: boolean;
  completed_at?: string | null;  // Timestamp when task was marked complete
  // Recurring task fields
  is_recurring_template?: boolean;
  recurring_template_id?: number | null;
  recurrence_pattern?: RecurrencePattern | null;
  recurrence_end_date?: string | null;
  next_occurrence_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type ConstraintType = "class" | "busy" | "blocked" | "no_study";

export interface Constraint {
  id: number;
  name: string;
  type: ConstraintType;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  is_recurring: boolean;
  days_of_week?: number[] | null;
}

export interface StudySession {
  id: number;
  user_id: number;
  subject_id?: number | null;
  task_id?: number | null;
  start_time: string;
  end_time: string;
  status: "planned" | "completed" | "skipped" | "partial";
  energy_level?: string | null;
  generated_by?: string | null;
  focus?: string | null;
}

export interface WeeklyPlan {
  user_id: number;
  generated_at: string;
  days: Array<{
    day: string;
    sessions: StudySession[];
  }>;
  optimization_explanation?: string | null;
}

export interface AnalyticsOverview {
  adherence_rate: number;
  completion_rate: number;
  streak: number;
  time_distribution: Record<string, number>;
  productivity_trend: { day: string; completed_minutes: number; scheduled_minutes: number }[];
  upcoming_tasks: Task[];
  today_plan: StudySession[];
  weekly_hours_completed?: number | null;
  weekly_hours_target?: number | null;
}

export type EnergyLevel = "low" | "medium" | "high";

export interface DailyEnergy {
  id: number;
  user_id: number;
  day: string;
  level: EnergyLevel;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

// Type for API error responses
export interface ApiError {
  response?: {
    data?: {
      detail?: string;
      message?: string;
    };
  };
  message?: string;
}

// Helper function to extract error message
export function getErrorMessage(error: unknown, fallback = "An error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const apiError = error as ApiError;
    return apiError?.response?.data?.detail || apiError?.response?.data?.message || apiError?.message || fallback;
  }
  return fallback;
}

