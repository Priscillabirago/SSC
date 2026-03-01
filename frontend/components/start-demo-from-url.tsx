"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDemoMode } from "@/contexts/demo-mode-context";

export function StartDemoFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { startDemo } = useDemoMode();

  useEffect(() => {
    if (searchParams.get("startDemo") === "1" && pathname) {
      router.replace(pathname);
      startDemo();
    }
  }, [searchParams, router, pathname, startDemo]);

  return null;
}
