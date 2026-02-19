import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import type { ConstraintCreate } from "@/lib/types";

import { createConstraint, deleteConstraint, listConstraints, updateConstraint } from "./api";

export function useConstraints() {
  return useQuery({
    queryKey: ["constraints"],
    queryFn: listConstraints,
  });
}

export function useCreateConstraint() {
  return useMutation({
    mutationFn: (payload: ConstraintCreate) => createConstraint(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["constraints"] });
      queryClient.invalidateQueries({ queryKey: ["schedule", "workload-analysis"] });
    },
  });
}

export function useUpdateConstraint() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ConstraintCreate> }) =>
      updateConstraint(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["constraints"] });
      queryClient.invalidateQueries({ queryKey: ["schedule", "workload-analysis"] });
    },
  });
}

export function useDeleteConstraint() {
  return useMutation({
    mutationFn: (constraintId: number) => deleteConstraint(constraintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["constraints"] });
      queryClient.invalidateQueries({ queryKey: ["schedule", "workload-analysis"] });
    },
  });
}
