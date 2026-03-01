import api from "@/lib/api-client";

export interface ShareTokenResponse {
  url: string;
  expires_at: string | null;
}

export interface ShareSessionPublic {
  start_time: string;
  end_time: string;
  focus: string | null;
  status: string;
}

export interface ShareDayPublic {
  date: string;
  day_name: string;
  sessions: ShareSessionPublic[];
}

export interface SharePlanPublic {
  display_name: string;
  timezone: string;
  week_start: string;
  week_end: string;
  days: ShareDayPublic[];
}

export async function createShareToken(): Promise<ShareTokenResponse> {
  const { data } = await api.post<ShareTokenResponse>("/share", null);
  return data;
}

export async function revokeShareToken(): Promise<void> {
  await api.delete("/share");
}

export async function fetchSharedPlan(token: string): Promise<SharePlanPublic> {
  const { data } = await api.get<SharePlanPublic>(`/share/${token}`);
  return data;
}
