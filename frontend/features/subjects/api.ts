import api from "@/lib/api-client";
import type { Subject } from "@/lib/types";

export async function listSubjects(): Promise<Subject[]> {
  const { data } = await api.get<Subject[]>("/subjects/");
  return data;
}

export async function createSubject(payload: Partial<Subject>): Promise<Subject> {
  const { data } = await api.post<Subject>("/subjects/", payload);
  return data;
}

export async function updateSubject(subjectId: number, payload: Partial<Subject>): Promise<Subject> {
  const { data } = await api.put<Subject>(`/subjects/${subjectId}`, payload);
  return data;
}

export async function deleteSubject(subjectId: number): Promise<void> {
  await api.delete(`/subjects/${subjectId}`);
}

