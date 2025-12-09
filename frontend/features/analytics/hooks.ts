import { useQuery } from "@tanstack/react-query";
import { fetchDetailedAnalytics } from "./api";

export function useDetailedAnalytics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["analytics", "detailed", startDate, endDate],
    queryFn: () => fetchDetailedAnalytics(startDate, endDate),
  });
}

