import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useRouter } from "next/navigation";

import { storeTokens, clearTokens } from "@/lib/auth";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/components/ui/use-toast";

import { login, register } from "./api";

type ApiError = AxiosError<{ detail?: string | { msg?: string }[] }>;

function extractErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as ApiError;
  const detail = axiosError.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail[0]?.msg ?? fallback;
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
      toast({
        title: "Welcome!",
        description: "Tell us about your study habits in settings."
      });
      router.push("/dashboard");
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

