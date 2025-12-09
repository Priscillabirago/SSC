import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import type { Subject } from "@/lib/types";

import { createSubject, deleteSubject, listSubjects, updateSubject } from "./api";

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: listSubjects
  });
}

export function useCreateSubject() {
  return useMutation({
    mutationFn: (payload: Partial<Subject>) => createSubject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    }
  });
}

export function useUpdateSubject() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Subject> }) =>
      updateSubject(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData<Subject[]>(["subjects"], (subjects) =>
        subjects?.map((subject) => (subject.id === data.id ? data : subject))
      );
    }
  });
}

export function useDeleteSubject() {
  return useMutation({
    mutationFn: (subjectId: number) => deleteSubject(subjectId),
    onSuccess: (_, subjectId) => {
      queryClient.setQueryData<Subject[]>(["subjects"], (subjects) =>
        subjects?.filter((subject) => subject.id !== subjectId)
      );
    }
  });
}

