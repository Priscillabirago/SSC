"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorBannerProps {
  readonly message?: string;
  readonly onRetry?: () => void;
}

export function QueryErrorBanner({
  message = "Something went wrong loading this page.",
  onRetry,
}: QueryErrorBannerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}
