import api from "@/lib/api-client";
import type { StudySession, WeeklyPlan } from "@/lib/types";

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

