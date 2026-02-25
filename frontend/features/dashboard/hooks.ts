import { useQuery } from "@tanstack/react-query";

import { fetchAnalyticsOverview, fetchDashboardInsights, fetchWeeklyRecap } from "./api";

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

