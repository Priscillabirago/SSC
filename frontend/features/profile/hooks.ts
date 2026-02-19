import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";

import { getProfile, updateProfile } from "./api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: 1,
    enabled: globalThis.window !== undefined && Boolean(localStorage.getItem("ssc.accessToken"))
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      // Settings like weekly_study_hours and preferred_study_windows affect workload analysis
      queryClient.invalidateQueries({ queryKey: ["schedule", "workload-analysis"] });
    }
  });
}

