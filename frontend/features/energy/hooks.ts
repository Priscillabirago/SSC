import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import type { EnergyLevel } from "@/lib/types";

import { getEnergyLogs, getTodayEnergy, upsertEnergy } from "./api";

export function useEnergyLogs() {
  return useQuery({
    queryKey: ["energy", "logs"],
    queryFn: getEnergyLogs
  });
}

export function useTodayEnergy() {
  return useQuery({
    queryKey: ["energy", "today"],
    queryFn: getTodayEnergy
  });
}

export function useUpsertEnergy() {
  return useMutation({
    mutationFn: ({ day, level }: { day: string; level: EnergyLevel }) => upsertEnergy(day, level),
    onSuccess: (data) => {
      queryClient.setQueryData(["energy", "today"], data);
      queryClient.invalidateQueries({ queryKey: ["energy", "logs"] });
    }
  });
}

