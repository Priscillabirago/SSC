import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import type { Task } from "@/lib/types";

import { createTask, deleteTask, generateSubtasks, listTasks, updateTask } from "./api";

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: listTasks
  });
}

export function useCreateTask() {
  return useMutation({
    mutationFn: (payload: Partial<Task>) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Task> }) => updateTask(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData<Task[]>(["tasks"], (tasks) =>
        tasks?.map((task) => (task.id === data.id ? data : task))
      );
    }
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: (taskId: number) => deleteTask(taskId),
    onSuccess: (_, taskId) => {
      queryClient.setQueryData<Task[]>(["tasks"], (tasks) =>
        tasks?.filter((task) => task.id !== taskId)
      );
    }
  });
}

export function useGenerateSubtasks() {
  return useMutation({
    mutationFn: (taskId: number) => generateSubtasks(taskId)
  });
}

