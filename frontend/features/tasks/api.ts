import api from "@/lib/api-client";
import type { Subtask, Task } from "@/lib/types";

export async function listTasks(): Promise<Task[]> {
  const { data } = await api.get<Task[]>("/tasks/");
  return data;
}

export async function createTask(payload: Partial<Task>): Promise<Task> {
  const { data } = await api.post<Task>("/tasks/", payload);
  return data;
}

export async function updateTask(taskId: number, payload: Partial<Task>): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return data;
}

export async function deleteTask(taskId: number): Promise<void> {
  await api.delete(`/tasks/${taskId}`);
}

export async function generateSubtasks(taskId: number): Promise<Subtask[]> {
  const { data } = await api.post<Subtask[]>(`/tasks/${taskId}/generate-subtasks`);
  return data;
}

export async function getTemplateForInstance(taskId: number): Promise<Task> {
  const { data } = await api.get<Task>(`/tasks/${taskId}/template`);
  return data;
}

export interface TaskSession {
  id: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "planned" | "in_progress" | "completed" | "skipped" | "partial";
  energy_level?: string | null;
  subject_name?: string | null;
}

export async function listTaskSessions(taskId: number): Promise<TaskSession[]> {
  const { data } = await api.get<TaskSession[]>(`/tasks/${taskId}/sessions`);
  return data;
}

