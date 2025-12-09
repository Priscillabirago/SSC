import { useQuery } from "@tanstack/react-query";

import { fetchAnalyticsOverview, fetchDashboardInsights } from "./api";

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
    staleTime: 1000 * 60 * 5, // 5 minutes - insights don't need to refresh too often
  });
}

