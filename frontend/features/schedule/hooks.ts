import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import type { StudySession, WeeklyPlan } from "@/lib/types";

import { analyzeSchedule, generateSchedule, getWorkloadAnalysis, listSessions, microPlan, prepareSession, updateSession } from "./api";

export function useSessions() {
  return useQuery({
    queryKey: ["schedule", "sessions"],
    queryFn: listSessions
  });
}

export function useGenerateSchedule() {
  return useMutation({
    mutationFn: (useAiOptimization: boolean = false) => generateSchedule(useAiOptimization),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
    }
  });
}

export function useMicroPlan() {
  return useMutation({
    mutationFn: (minutes: number) => microPlan(minutes)
  });
}

export function useUpdateSession() {
  return useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: number; payload: { status?: StudySession["status"]; notes?: string; start_time?: string; end_time?: string } }) =>
      updateSession(sessionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule", "sessions"] });
      // Invalidate tasks query because session status changes update actual_minutes_spent
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });
}

export function usePrepareSession() {
  return useMutation({
    mutationFn: (sessionId: number) => prepareSession(sessionId)
  });
}

export function useWorkloadAnalysis() {
  return useQuery({
    queryKey: ["schedule", "workload-analysis"],
    queryFn: getWorkloadAnalysis,
    staleTime: 30000, // 30 seconds - analysis can be cached briefly
  });
}

export function useAnalyzeSchedule() {
  return useMutation({
    mutationFn: (plan: WeeklyPlan) => analyzeSchedule(plan),
  });
}

