"use client";

import { useEffect } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useProfile } from "@/features/profile/hooks";
import { getAccessToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-slate-100 via-white to-slate-50">
      <Sidebar />
      <div className="flex w-full flex-1 flex-col">
        <Topbar />
        <ScrollArea className="h-[calc(100vh-72px)]">
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 lg:px-8">
            {isLoading && !profile ? (
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
    </div>
  );
}

