import api from "@/lib/api-client";

export interface SubjectPerformance {
  subject_name: string;
  time_spent_minutes: number;
  tasks_total: number;
  tasks_completed: number;
  completion_rate: number;
  sessions_total: number;
  sessions_completed: number;
  adherence_rate: number;
}

export interface EnergyProductivity {
  energy_level: "low" | "medium" | "high";
  sessions_count: number;
  completed_count: number;
  completion_rate: number;
  average_duration_minutes: number;
}

export interface DayAdherence {
  day_name: string;
  sessions_scheduled: number;
  sessions_completed: number;
  adherence_rate: number;
}

export interface TrendPoint {
  day: string;
  completed_minutes: number;
  scheduled_minutes: number;
}

export interface DetailedAnalytics {
  time_range_start: string;
  time_range_end: string;
  total_sessions: number;
  completed_sessions: number;
  overall_adherence: number;
  total_time_minutes: number;
  subject_performance: SubjectPerformance[];
  energy_productivity: EnergyProductivity[];
  day_adherence: DayAdherence[];
  productivity_trend: TrendPoint[];
  time_distribution: Record<string, number>;
}

export async function fetchDetailedAnalytics(
  startDate?: string,
  endDate?: string
): Promise<DetailedAnalytics> {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  
  const { data } = await api.get<DetailedAnalytics>(
    `/analytics/detailed?${params.toString()}`
  );
  return data;
}

