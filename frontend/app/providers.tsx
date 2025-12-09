"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

import { queryClient as sharedClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(sharedClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

