"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { StudySession, Task, Subject } from "@/lib/types";
import { startSession as startSessionApi } from "@/features/schedule/api";

interface FocusSessionState {
  session: StudySession | null;
  task: Task | null;
  subject: Subject | null;
  isActive: boolean;
  isPaused: boolean;
  startTime: number | null; // timestamp when session actually started
  pausedTime: number | null; // timestamp when paused
  sessionDurationMs: number; // total session duration in milliseconds (end_time - start_time)
  remainingSeconds: number; // calculated remaining time for main session
  quickTrackTimeMs: number; // time from Quick Track before conversion (to preserve continuity)
  pomodoroEnabled: boolean;
  pomodoroMode: "work" | "break" | null;
  pomodoroCount: number; // current pomodoro number (1-4)
  pomodoroStartTime: number | null; // timestamp when current pomodoro cycle started
  pomodoroDurationMs: number; // duration of current pomodoro cycle (25 min work or 5 min break)
  pomodoroRemainingSeconds: number; // remaining time for current pomodoro cycle
}

interface FocusSessionContextType {
  state: FocusSessionState;
  startSession: (session: StudySession, task: Task | null, subject: Subject | null, quickTrackTimeMs?: number, quickTrackStartTime?: number | null) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: () => void;
  extendSession: (minutes: number) => void;
  skipSession: () => void;
  togglePomodoro: () => void;
  pauseOnNavigate: () => void;
  resumeOnReturn: () => void;
}

const FocusSessionContext = createContext<FocusSessionContextType | undefined>(undefined);

export function FocusSessionProvider({ children }: { readonly children: React.ReactNode }) {
  const [state, setState] = useState<FocusSessionState>({
    session: null,
    task: null,
    subject: null,
    isActive: false,
    isPaused: false,
    startTime: null,
    pausedTime: null,
    sessionDurationMs: 0,
    remainingSeconds: 0,
    quickTrackTimeMs: 0,
    pomodoroEnabled: false,
    pomodoroMode: null,
    pomodoroCount: 0,
    pomodoroStartTime: null,
    pomodoroDurationMs: 0,
    pomodoroRemainingSeconds: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate remaining time based on session duration and elapsed time
  const calculateRemainingSeconds = useCallback((sessionDurationMs: number, startTime: number | null, pausedAt: number | null): number => {
    if (!startTime || sessionDurationMs <= 0) return 0;
    
    const now = Date.now();
    
    // If paused, calculate elapsed time up to when it was paused
    // If not paused, calculate elapsed time up to now
    const elapsed = pausedAt ? (pausedAt - startTime) : (now - startTime);
    const remaining = Math.max(0, Math.floor((sessionDurationMs - elapsed) / 1000));
    return remaining;
  }, []);

  // Update timer every second
  useEffect(() => {
    if (state.isActive && !state.isPaused && state.startTime && state.sessionDurationMs > 0) {
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          // Update main session timer
          const remaining = calculateRemainingSeconds(prev.sessionDurationMs, prev.startTime, prev.pausedTime);
          
          // Update Pomodoro timer if enabled
          let pomodoroRemaining = prev.pomodoroRemainingSeconds;
          if (prev.pomodoroEnabled && prev.pomodoroStartTime && prev.pomodoroDurationMs > 0) {
            pomodoroRemaining = calculateRemainingSeconds(prev.pomodoroDurationMs, prev.pomodoroStartTime, prev.pausedTime);
          }
          
          if (remaining <= 0) {
            // Main timer ended
            return { ...prev, isActive: false, remainingSeconds: 0, pomodoroRemainingSeconds: pomodoroRemaining };
          }
          return { ...prev, remainingSeconds: remaining, pomodoroRemainingSeconds: pomodoroRemaining };
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isActive, state.isPaused, state.startTime, state.sessionDurationMs, state.pomodoroEnabled, state.pomodoroStartTime, state.pomodoroDurationMs, calculateRemainingSeconds]);

  const startSession = useCallback((session: StudySession, task: Task | null, subject: Subject | null, quickTrackTimeMs: number = 0, quickTrackStartTime: number | null = null) => {
    const startTime = Date.now();
    // Calculate session duration from start_time to end_time
    const sessionStart = new Date(session.start_time).getTime();
    const sessionEnd = new Date(session.end_time).getTime();
    let sessionDurationMs = sessionEnd - sessionStart;
    
    // Only reduce session duration if Quick Track was started within the session's time window
    // This prevents Quick Track time from Tasks page (started hours ago or for different sessions)
    // from incorrectly reducing the current session's duration
    if (quickTrackTimeMs > 0 && quickTrackStartTime !== null) {
      // Only reduce if Quick Track started at or after the session's scheduled start time
      // This means the Quick Track time overlaps with the session's time window
      if (quickTrackStartTime >= sessionStart) {
        sessionDurationMs = Math.max(0, sessionDurationMs - quickTrackTimeMs);
      }
      // If Quick Track started before session start, don't reduce duration
      // (Quick Track time is already saved to timer_minutes_spent separately)
    }
    
    const remainingSeconds = calculateRemainingSeconds(sessionDurationMs, startTime, null);

    // Optimistically start the session locally (don't block UI)
    setState({
      session,
      task,
      subject,
      isActive: true,
      isPaused: false,
      startTime,
      pausedTime: null,
      sessionDurationMs,
      remainingSeconds,
      quickTrackTimeMs,
      pomodoroEnabled: false,
      pomodoroMode: null,
      pomodoroCount: 0,
      pomodoroStartTime: null,
      pomodoroDurationMs: 0,
      pomodoroRemainingSeconds: 0,
    });

    // Mark session as IN_PROGRESS in background (protects from deletion on regeneration)
    // Only call API for real sessions (positive IDs from database)
    if (session.id > 0) {
      startSessionApi(session.id).catch((error) => {
        // Non-blocking: log error but don't interrupt user's focus session
        // Session will still work locally, just won't be protected on regeneration
        console.warn("Failed to mark session as in_progress:", error);
      });
    }
  }, [calculateRemainingSeconds]);

  const pauseSession = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive || prev.isPaused || !prev.startTime) return prev;
      
      const now = Date.now();
      // Store when we paused (this is the timestamp when pause was clicked)
      return {
        ...prev,
        isPaused: true,
        pausedTime: now, // Store pause timestamp
      };
    });
  }, []);

  const resumeSession = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive || !prev.isPaused || !prev.startTime || !prev.pausedTime) return prev;
      
      // Calculate how long we were paused
      const pauseDuration = Date.now() - prev.pausedTime;
      // Adjust start time to account for the pause
      const newStartTime = prev.startTime + pauseDuration;
      
      // Also adjust Pomodoro start time if Pomodoro is enabled
      const newPomodoroStartTime = prev.pomodoroEnabled && prev.pomodoroStartTime
        ? prev.pomodoroStartTime + pauseDuration
        : prev.pomodoroStartTime;

      return {
        ...prev,
        isPaused: false,
        startTime: newStartTime,
        pausedTime: null,
        pomodoroStartTime: newPomodoroStartTime,
      };
    });
  }, []);

  const stopSession = useCallback(() => {
    setState({
      session: null,
      task: null,
      subject: null,
      isActive: false,
      isPaused: false,
      startTime: null,
      pausedTime: null,
      sessionDurationMs: 0,
      remainingSeconds: 0,
      quickTrackTimeMs: 0,
      pomodoroEnabled: false,
      pomodoroMode: null,
      pomodoroCount: 0,
      pomodoroStartTime: null,
      pomodoroDurationMs: 0,
      pomodoroRemainingSeconds: 0,
    });
  }, []);

  const togglePomodoro = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive) return prev;
      
      const newEnabled = !prev.pomodoroEnabled;
      if (newEnabled && !prev.pomodoroMode) {
        // Starting Pomodoro - enter work mode (25 minutes)
        const workDurationMs = 25 * 60 * 1000;
        return {
          ...prev,
          pomodoroEnabled: true,
          pomodoroMode: "work",
          pomodoroCount: 1,
          pomodoroStartTime: Date.now(),
          pomodoroDurationMs: workDurationMs,
          pomodoroRemainingSeconds: 25 * 60,
        };
      } else if (!newEnabled) {
        // Disabling Pomodoro
        return {
          ...prev,
          pomodoroEnabled: false,
          pomodoroMode: null,
          pomodoroStartTime: null,
          pomodoroDurationMs: 0,
          pomodoroRemainingSeconds: 0,
        };
      }
      return prev;
    });
  }, []);

  const pauseOnNavigate = useCallback(() => {
    setState((prev) => {
      if (prev.isActive && !prev.isPaused) {
        return {
          ...prev,
          isPaused: true,
          pausedTime: Date.now(),
        };
      }
      return prev;
    });
  }, []);

  const resumeOnReturn = useCallback(() => {
    setState((prev) => {
      if (prev.isActive && prev.isPaused && prev.startTime && prev.pausedTime) {
        const pauseDuration = Date.now() - prev.pausedTime;
        const newStartTime = prev.startTime + pauseDuration;
        return {
          ...prev,
          isPaused: false,
          startTime: newStartTime,
          pausedTime: null,
        };
      }
      return prev;
    });
  }, []);

  const extendSession = useCallback((minutes: number) => {
    setState((prev) => {
      if (!prev.isActive || !prev.session) return prev;
      
      const additionalMs = minutes * 60 * 1000;
      const newRemainingSeconds = prev.remainingSeconds + (minutes * 60);

      return {
        ...prev,
        sessionDurationMs: prev.sessionDurationMs + additionalMs,
        remainingSeconds: newRemainingSeconds,
      };
    });
  }, []);

  const skipSession = useCallback(() => {
    stopSession();
  }, [stopSession]);

  // Handle Pomodoro mode switching
  useEffect(() => {
    if (state.pomodoroEnabled && state.isActive && !state.isPaused && state.pomodoroRemainingSeconds <= 0 && state.pomodoroStartTime) {
      if (state.pomodoroMode === "work") {
        // Work session ended - switch to break (5 minutes)
        const breakDurationMs = 5 * 60 * 1000;
        setState((prev) => ({
          ...prev,
          pomodoroMode: "break",
          pomodoroStartTime: Date.now(),
          pomodoroDurationMs: breakDurationMs,
          pomodoroRemainingSeconds: 5 * 60,
        }));
      } else if (state.pomodoroMode === "break") {
        // Break ended - switch to next work session or complete
        if (state.pomodoroCount < 4) {
          const workDurationMs = 25 * 60 * 1000;
          setState((prev) => ({
            ...prev,
            pomodoroMode: "work",
            pomodoroCount: prev.pomodoroCount + 1,
            pomodoroStartTime: Date.now(),
            pomodoroDurationMs: workDurationMs,
            pomodoroRemainingSeconds: 25 * 60,
          }));
        } else {
          // All 4 pomodoros done
          stopSession();
        }
      }
    }
  }, [state.pomodoroEnabled, state.isActive, state.isPaused, state.pomodoroRemainingSeconds, state.pomodoroMode, state.pomodoroCount, state.pomodoroStartTime, stopSession]);

  const contextValue = useMemo(
    () => ({
      state,
      startSession,
      pauseSession,
      resumeSession,
      stopSession,
      extendSession,
      skipSession,
      togglePomodoro,
      pauseOnNavigate,
      resumeOnReturn,
    }),
    [state, startSession, pauseSession, resumeSession, stopSession, extendSession, skipSession, togglePomodoro, pauseOnNavigate, resumeOnReturn]
  );

  return (
    <FocusSessionContext.Provider value={contextValue}>
      {children}
    </FocusSessionContext.Provider>
  );
}

export function useFocusSession() {
  const context = useContext(FocusSessionContext);
  if (context === undefined) {
    throw new Error("useFocusSession must be used within a FocusSessionProvider");
  }
  return context;
}
