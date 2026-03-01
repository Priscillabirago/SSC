import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useRouter } from "next/navigation";

import { storeTokens, clearTokens } from "@/lib/auth";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/components/ui/use-toast";

import { login, register } from "./api";

type ApiError = AxiosError<{ detail?: string | { msg?: string }[] }>;

function extractErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as ApiError & { message?: string };
  const data = axiosError.response?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const detail = obj.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; message?: string };
      return first?.msg ?? first?.message ?? fallback;
    }
    const message = obj.message;
    if (typeof message === "string") return message;
  }
  // Network errors (CORS, connection refused, timeout) often have no response
  if (!axiosError.response && axiosError.message) {
    return `Unable to reach server: ${axiosError.message}. If using a deployed app, check that the backend URL and CORS are configured correctly.`;
  }
  // 5xx server errors may not include a parseable detail
  if (axiosError.response?.status && axiosError.response.status >= 500) {
    return "Server error. Please try again later or contact support.";
  }
  return fallback;
}

export function useLogin() {
  const router = useRouter();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => {
      return login(email, password);
    },
    onSuccess: (tokens) => {
      storeTokens(tokens);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({
        title: "Welcome back!",
        description: "Your workspace is ready."
      });
      router.push("/dashboard");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: extractErrorMessage(error, "Please check your details and try again.")
      });
    }
  });
}

export function useRegister() {
  const router = useRouter();
  return useMutation({
    mutationFn: register,
    onSuccess: (tokens) => {
      storeTokens(tokens);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      const startDemo = globalThis.window !== undefined && new URLSearchParams(globalThis.window.location.search).get("startDemo") === "1";
      toast({
        title: "Welcome!",
        description: startDemo ? "Starting your guided tour…" : "Tell us about your study habits in settings."
      });
      router.push(startDemo ? "/dashboard?startDemo=1" : "/dashboard");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: extractErrorMessage(
          error,
          "Please double-check your details and try again."
        )
      });
    }
  });
}

export function useLogout() {
  const router = useRouter();
  return () => {
    clearTokens();
    queryClient.clear();
    router.push("/login");
  };
}

