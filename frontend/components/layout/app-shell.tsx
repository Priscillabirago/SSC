"use client";

import { useEffect, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useProfile } from "@/features/profile/hooks";
import { getAccessToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusSessionView } from "@/features/schedule/components/focus-session-view";

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!getAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  // Prevent hydration mismatch by not showing loading state until mounted
  const showLoading = mounted && isLoading && !profile;

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-slate-100 via-white to-slate-50">
      <Sidebar />
      <div className="flex w-full flex-1 flex-col min-w-0">
        <Topbar />
        <ScrollArea className="h-[calc(100vh-72px)] sm:h-[calc(100vh-80px)]">
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 sm:gap-8 px-4 sm:px-6 py-6 sm:py-8 lg:px-8">
            {showLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              children
            )}
          </main>
        </ScrollArea>
      </div>
      <FocusSessionView />
    </div>
  );
}

