import api from "@/lib/api-client";
import type { AuthTokens } from "@/lib/auth";
import type { UserProfile } from "@/lib/types";

interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthResponse>("/auth/login", { email, password });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token
  };
}

export async function register(payload: {
  email: string;
  password: string;
  full_name?: string;
  timezone?: string;
}): Promise<AuthTokens> {
  const { data } = await api.post<AuthResponse>("/auth/register", payload);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token
  };
}

export async function fetchProfile(): Promise<UserProfile> {
  const { data } = await api.get<UserProfile>("/users/me");
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

export async function resetPassword(newPassword: string): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>("/auth/reset-password", {
    new_password: newPassword,
  });
  return data;
}

export async function changeEmail(newEmail: string, password: string): Promise<UserProfile> {
  const { data } = await api.post<UserProfile>("/auth/change-email", {
    new_email: newEmail,
    password: password,
  });
  return data;
}

