"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

import { queryClient as sharedClient } from "@/lib/query-client";
import { FocusSessionProvider } from "@/contexts/focus-session-context";
import { QuickTrackProvider } from "@/contexts/quick-track-context";

export function Providers({ children }: { readonly children: ReactNode }) {
  const [client] = useState(sharedClient);

  return (
    <QueryClientProvider client={client}>
      <QuickTrackProvider>
        <FocusSessionProvider>{children}</FocusSessionProvider>
      </QuickTrackProvider>
    </QueryClientProvider>
  );
}

