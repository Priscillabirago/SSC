"use client";

import { Coffee, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type StartingUpPageProps = Readonly<{
  onRetry: () => void;
  isRetrying?: boolean;
}>;

export function StartingUpPage({ onRetry, isRetrying = false }: StartingUpPageProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-slate-100">
      {/* Subtle animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-amber-200/20 blur-3xl animate-pulse" />
        <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-orange-200/15 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-yellow-100/30 blur-2xl animate-pulse" style={{ animationDelay: "0.5s" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm ring-1 ring-amber-200/50">
          <Coffee className="h-10 w-10 text-amber-600" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-slate-800 sm:text-3xl">
          Waking up your study space
        </h1>
        <p className="mt-3 max-w-sm text-sm text-slate-500 sm:text-base">
          First load can take 15–30 seconds. Our servers are spinning up — grab a drink while we get ready.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-md"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Try again"
            )}
          </Button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Usually ready in under 30 seconds
        </p>
      </div>
    </div>
  );
}
