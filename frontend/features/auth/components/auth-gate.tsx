"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getAccessToken } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getAccessToken();
    const isAuthRoute = pathname?.startsWith("/login") || pathname?.startsWith("/register")
      || pathname?.startsWith("/forgot-password") || pathname?.startsWith("/reset-password");
    if (!token && !isAuthRoute) {
      router.replace("/login");
    }
    if (token && isAuthRoute) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  return <>{children}</>;
}

