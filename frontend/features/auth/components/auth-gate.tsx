"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getAccessToken } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getAccessToken();
    const isPublicRoute = pathname === "/" || pathname?.startsWith("/login") || pathname?.startsWith("/register")
      || pathname?.startsWith("/forgot-password") || pathname?.startsWith("/reset-password")
      || pathname?.startsWith("/share");
    const isAuthOnlyRoute = pathname?.startsWith("/login") || pathname?.startsWith("/register")
      || pathname?.startsWith("/forgot-password") || pathname?.startsWith("/reset-password");
    if (!token && !isPublicRoute) {
      router.replace("/login");
    }
    if (token && isAuthOnlyRoute) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  return <>{children}</>;
}

