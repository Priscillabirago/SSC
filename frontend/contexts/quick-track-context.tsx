"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

interface QuickTrackState {
  activeTimers: Map<number, number>; // taskId -> startTime timestamp
  elapsedTimes: Map<number, number>; // taskId -> elapsed minutes
}

interface QuickTrackContextType {
  state: QuickTrackState;
  startQuickTrack: (taskId: number) => void;
  stopQuickTrack: (taskId: number, saveTime: boolean) => number; // Returns elapsed minutes
  isActive: (taskId: number) => boolean;
  getElapsedTime: (taskId: number) => number; // Returns elapsed minutes
  getStartTime: (taskId: number) => number | null; // Returns start time timestamp or null
}

const QuickTrackContext = createContext<QuickTrackContextType | undefined>(undefined);

export function QuickTrackProvider({ children }: { readonly children: React.ReactNode }) {
  const [activeTimers, setActiveTimers] = useState<Map<number, number>>(() => {
    // Load from localStorage on mount
    if (globalThis.window !== undefined) {
      const saved = globalThis.window.localStorage.getItem("activeTaskTimers");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const map = new Map<number, number>();
          Object.entries(parsed).forEach(([taskId, startTime]) => {
            map.set(Number(taskId), Number(startTime));
          });
          return map;
        } catch {
          return new Map();
        }
      }
    }
    return new Map();
  });

  const [elapsedTimes, setElapsedTimes] = useState<Map<number, number>>(new Map());

  // Update elapsed times every second for active timers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newElapsed = new Map<number, number>();

      activeTimers.forEach((startTime, taskId) => {
        const elapsed = Math.floor((now - startTime) / 1000 / 60); // minutes
        newElapsed.set(taskId, elapsed);
      });

      setElapsedTimes(newElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimers]);

  // Save active timers to localStorage whenever they change
  useEffect(() => {
    if (globalThis.window !== undefined) {
      if (activeTimers.size > 0) {
        const obj: Record<string, number> = {};
        activeTimers.forEach((startTime, taskId) => {
          obj[String(taskId)] = startTime;
        });
        globalThis.window.localStorage.setItem("activeTaskTimers", JSON.stringify(obj));
      } else {
        globalThis.window.localStorage.removeItem("activeTaskTimers");
      }
    }
  }, [activeTimers]);

  const startQuickTrack = useCallback((taskId: number) => {
    setActiveTimers((prev) => {
      const next = new Map(prev);
      next.set(taskId, Date.now());
      return next;
    });
  }, []);

  const stopQuickTrack = useCallback((taskId: number, saveTime: boolean = true): number => {
    const startTime = activeTimers.get(taskId);
    if (!startTime) return 0;

    const elapsedMinutes = Math.floor((Date.now() - startTime) / 1000 / 60);

    setActiveTimers((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });

    setElapsedTimes((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });

    return elapsedMinutes;
  }, [activeTimers]);

  const isActive = useCallback((taskId: number): boolean => {
    return activeTimers.has(taskId);
  }, [activeTimers]);

  const getElapsedTime = useCallback((taskId: number): number => {
    return elapsedTimes.get(taskId) || 0;
  }, [elapsedTimes]);

  const getStartTime = useCallback((taskId: number): number | null => {
    return activeTimers.get(taskId) || null;
  }, [activeTimers]);

  const contextValue = useMemo(
    () => ({
      state: { activeTimers, elapsedTimes },
      startQuickTrack,
      stopQuickTrack,
      isActive,
      getElapsedTime,
      getStartTime,
    }),
    [activeTimers, elapsedTimes, startQuickTrack, stopQuickTrack, isActive, getElapsedTime, getStartTime]
  );

  return (
    <QuickTrackContext.Provider value={contextValue}>
      {children}
    </QuickTrackContext.Provider>
  );
}

export function useQuickTrack() {
  const context = useContext(QuickTrackContext);
  if (context === undefined) {
    throw new Error("useQuickTrack must be used within a QuickTrackProvider");
  }
  return context;
}
