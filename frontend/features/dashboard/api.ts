import api from "@/lib/api-client";
import type { AnalyticsOverview } from "@/lib/types";

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>("/analytics/overview");
  return data;
}

export interface DashboardInsight {
  type: "celebration" | "warning" | "recommendation" | "observation";
  title: string;
  message: string;
  action: string | null;
}

export interface DashboardInsights {
  insights: DashboardInsight[];
  motivational_message: string;
  overall_tone: "positive" | "neutral" | "needs_attention";
}

export async function fetchDashboardInsights(): Promise<DashboardInsights> {
  const { data } = await api.get<DashboardInsights>("/analytics/insights");
  return data;
}

export interface WeeklyRecapData {
  has_data: boolean;
  recap: string | null;
  highlight?: string;
  concern?: string | null;
  actions?: string[];
  tone?: "celebratory" | "encouraging" | "honest";
  stats?: {
    sessions_completed: number;
    sessions_total: number;
    hours_studied: number;
    hours_target: number;
    adherence: number;
    tasks_completed: number;
    streak: number;
  };
  week_start: string;
  week_end: string;
}

export async function fetchWeeklyRecap(): Promise<WeeklyRecapData> {
  const { data } = await api.get<WeeklyRecapData>("/analytics/weekly-recap");
  return data;
}

