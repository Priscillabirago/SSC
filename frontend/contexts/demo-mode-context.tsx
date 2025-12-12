"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { DemoMode } from "@/components/demo-mode";

interface DemoModeContextType {
  isActive: boolean;
  startDemo: () => void;
  stopDemo: () => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { readonly children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);

  const startDemo = useCallback(() => {
    setIsActive(true);
  }, []);

  const stopDemo = useCallback(() => {
    setIsActive(false);
  }, []);

  const contextValue = useMemo(
    () => ({
      isActive,
      startDemo,
      stopDemo,
    }),
    [isActive, startDemo, stopDemo]
  );

  return (
    <DemoModeContext.Provider value={contextValue}>
      {children}
      {isActive && <DemoMode onClose={stopDemo} />}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error("useDemoMode must be used within a DemoModeProvider");
  }
  return context;
}
