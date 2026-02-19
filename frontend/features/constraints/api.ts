import api from "@/lib/api-client";
import type { Constraint, ConstraintCreate } from "@/lib/types";

export async function listConstraints(): Promise<Constraint[]> {
  const { data } = await api.get<Constraint[]>("/constraints/");
  return data;
}

export async function createConstraint(payload: ConstraintCreate): Promise<Constraint> {
  const { data } = await api.post<Constraint>("/constraints/", payload);
  return data;
}

export async function updateConstraint(
  constraintId: number,
  payload: Partial<ConstraintCreate>
): Promise<Constraint> {
  const { data } = await api.patch<Constraint>(`/constraints/${constraintId}`, payload);
  return data;
}

export async function deleteConstraint(constraintId: number): Promise<void> {
  await api.delete(`/constraints/${constraintId}`);
}
