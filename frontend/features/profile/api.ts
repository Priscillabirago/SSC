import api from "@/lib/api-client";
import type { UserProfile } from "@/lib/types";

export async function getProfile(): Promise<UserProfile> {
  const { data } = await api.get<UserProfile>("/users/me");
  return data;
}

export async function updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  const { data } = await api.patch<UserProfile>("/users/me", payload);
  return data;
}

