import api from "@/lib/api-client";
import type { DailyEnergy, EnergyLevel } from "@/lib/types";

export async function getEnergyLogs(): Promise<DailyEnergy[]> {
  const { data } = await api.get<DailyEnergy[]>("/energy/");
  return data;
}

export async function getTodayEnergy(): Promise<DailyEnergy | null> {
  const { data } = await api.get<DailyEnergy | null>("/energy/today");
  return data;
}

export async function upsertEnergy(day: string, level: EnergyLevel): Promise<DailyEnergy> {
  const { data } = await api.post<DailyEnergy>("/energy/", { day, level });
  return data;
}

