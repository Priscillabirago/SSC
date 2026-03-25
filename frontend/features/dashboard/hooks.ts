import { useQuery } from "@tanstack/react-query";

import { fetchAnalyticsOverview, fetchBadges, fetchDashboardInsights, fetchOnboardingStatus, fetchWeeklyRecap, fetchStudyingNow } from "./api";

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
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 90,
  });
}

export function useBadges() {
  return useQuery({
    queryKey: ["analytics", "badges"],
    queryFn: fetchBadges,
    staleTime: 1000 * 60 * 5,
  });
}

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["users", "onboarding-status"],
    queryFn: fetchOnboardingStatus,
    staleTime: 1000 * 60 * 10,
  });
}

