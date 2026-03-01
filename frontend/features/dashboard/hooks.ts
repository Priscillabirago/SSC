import { useQuery } from "@tanstack/react-query";

import { fetchAnalyticsOverview, fetchDashboardInsights, fetchWeeklyRecap, fetchStudyingNow } from "./api";

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: fetchAnalyticsOverview
  });
}

export function useDashboardInsights() {
  return useQuery({
    queryKey: ["analytics", "insights"],
    queryFn: fetchDashboardInsights,
    staleTime: 1000 * 60 * 5,
  });
}

export function useWeeklyRecap() {
  return useQuery({
    queryKey: ["analytics", "weekly-recap"],
    queryFn: fetchWeeklyRecap,
    staleTime: 1000 * 60 * 30, // 30 min — recap doesn't change often
  });
}

export function useStudyingNow() {
  return useQuery({
    queryKey: ["analytics", "studying-now"],
    queryFn: fetchStudyingNow,
    staleTime: 1000 * 60, // 1 min — backend caches 90s
    refetchInterval: 1000 * 90, // Refetch every 90s when visible
  });
}

