import api from "@/lib/api-client";
import type { StudySession, StudySessionCreate, WeeklyPlan } from "@/lib/types";

export async function listSessions(): Promise<StudySession[]> {
  const { data } = await api.get<StudySession[]>("/schedule/sessions");
  return data;
}

export async function generateSchedule(useAiOptimization: boolean = false): Promise<WeeklyPlan> {
  const { data } = await api.post<WeeklyPlan>(`/schedule/generate?use_ai_optimization=${useAiOptimization}`);
  return data;
}

export async function microPlan(minutes: number): Promise<StudySession[]> {
  const { data } = await api.post<StudySession[]>("/schedule/micro", null, {
    params: { minutes }
  });
  return data;
}

export async function updateSession(
  sessionId: number,
  payload: { 
    status?: StudySession["status"]; 
    notes?: string;
    start_time?: string;
    end_time?: string;
    is_pinned?: boolean;
  }
): Promise<StudySession> {
  const { data } = await api.patch<StudySession>(`/schedule/sessions/${sessionId}`, payload);
  return data;
}

export interface SessionPreparation {
  tips: string[];
  strategy: string;
  rationale: string;
}

export async function prepareSession(sessionId: number): Promise<SessionPreparation> {
  const { data } = await api.post<SessionPreparation>(`/schedule/sessions/${sessionId}/prepare`);
  return data;
}

export async function startSession(sessionId: number): Promise<StudySession> {
  const { data } = await api.post<StudySession>(`/schedule/sessions/${sessionId}/start`);
  return data;
}

export interface WorkloadWarning {
  type: string;
  severity: "soft" | "hard";
  title: string;
  message: string;
  suggestions?: string[];
  tasks?: Array<{ 
    title: string; 
    hours_short?: number;
    hours?: number;
    priority?: string;
    deadline?: string | null;
    buffer_hours?: number;
  }>;
  clusters?: Array<{ deadline_date: string; deadline_day: string; task_count: number; total_hours: number }>;
  subjects?: Array<{ subject_name: string; exam_date: string; days_until_exam: number }>;
  overloads?: Array<{ day: string; scheduled_hours: number; available_hours: number; overflow: number }>;
  days?: string[];
}

export interface WorkloadAnalysis {
  warnings: WorkloadWarning[];
  metrics: {
    total_task_hours?: number;
    available_hours_per_week?: number;
    realistic_capacity?: number;
    completion_rate?: number;
    weekly_goal?: number;
    hours_per_day?: number;
    // Post-generation metrics
    total_scheduled_hours?: number;
    unscheduled_hours?: number;
    unscheduled_task_count?: number;
    daily_distribution?: Record<string, number>;
    imbalance_ratio?: number;
    window_hours?: number;
  };
}

export async function getWorkloadAnalysis(): Promise<WorkloadAnalysis> {
  const { data } = await api.get<WorkloadAnalysis>("/schedule/workload-analysis");
  return data;
}

export async function analyzeSchedule(plan: WeeklyPlan): Promise<WorkloadAnalysis> {
  const { data } = await api.post<WorkloadAnalysis>("/schedule/analyze", plan);
  return data;
}

export async function createSession(payload: StudySessionCreate): Promise<StudySession> {
  const { data } = await api.post<StudySession>("/schedule/sessions", payload);
  return data;
}

export async function pinSession(sessionId: number, isPinned: boolean = true): Promise<StudySession> {
  const { data } = await api.patch<StudySession>(`/schedule/sessions/${sessionId}`, {
    is_pinned: isPinned,
  });
  return data;
}

export async function deleteSession(sessionId: number): Promise<void> {
  await api.delete(`/schedule/sessions/${sessionId}`);
}

// Calendar export

export async function getCalendarToken(): Promise<{ calendar_token: string | null }> {
  const { data } = await api.get<{ calendar_token: string | null }>("/schedule/calendar/token");
  return data;
}

export async function generateCalendarToken(): Promise<{ calendar_token: string }> {
  const { data } = await api.post<{ calendar_token: string }>("/schedule/calendar/token");
  return data;
}

export async function revokeCalendarToken(): Promise<void> {
  await api.delete("/schedule/calendar/token");
}

export function getCalendarDownloadUrl(): string {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return `${baseURL}/schedule/calendar/download`;
}

export function getCalendarFeedUrl(token: string): string {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return `${baseURL}/schedule/calendar/feed?token=${token}`;
}

