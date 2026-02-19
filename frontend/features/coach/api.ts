import api from "@/lib/api-client";

export async function coachChat(message: string): Promise<{ reply: string }> {
  const { data } = await api.post<{ reply: string }>("/coach/chat", { message });
  return data;
}

export async function coachSuggestPlan(): Promise<{
  summary: string;
  highlights: string[];
  action_items: string[];
}> {
  const { data } = await api.post("/coach/suggest-plan");
  return data;
}

export async function coachReflect(payload: { worked: string; challenging: string }) {
  const { data } = await api.post("/coach/reflect", payload);
  return data;
}

export async function coachMicroPlan(minutes: number) {
  const { data } = await api.post("/coach/micro-plan", { minutes });
  return data;
}

export async function coachApplyProposal(proposal: any) {
  const { data } = await api.post("/coach/apply-proposal", proposal);
  return data;
}

export async function getCoachChatHistory() {
  const { data } = await api.get("/coach/chat/history");
  return data;
}

export async function postCoachChatMessage(message: { role: string; content: string }) {
  const { data } = await api.post("/coach/chat/history", message);
  return data;
}

export async function deleteCoachChatMessage(messageId: number) {
  await api.delete(`/coach/chat/history/${messageId}`);
}

export async function deleteAllCoachChatHistory() {
  await api.delete(`/coach/chat/history`);
}

export interface DailySummary {
  summary: string;
  tomorrow_tip: string;
  tone: "positive" | "neutral" | "encouraging";
  last_session_end: string | null;
  first_session_start: string | null;
  has_remaining_sessions: boolean;
  user_timezone: string;
}

export async function getDailySummary(): Promise<DailySummary> {
  const { data } = await api.get<DailySummary>("/coach/daily-summary");
  return data;
}

export interface SessionEncouragement {
  message: string;
  tone: "motivational" | "celebratory" | "supportive";
}

export async function getSessionEncouragement(payload: {
  elapsed_minutes: number;
  remaining_minutes: number;
  progress_percent: number;
  task_title?: string | null;
  is_paused?: boolean;
  pomodoro_count?: number;
}): Promise<SessionEncouragement> {
  const { data } = await api.post<SessionEncouragement>("/coach/session-encouragement", payload);
  return data;
}

