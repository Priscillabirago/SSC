"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSessions } from "@/features/schedule/hooks";
import type { StudySession } from "@/lib/types";

const STORAGE_KEY = "ssc.notificationsEnabled";
const NOTIFIED_KEY = "ssc.notifiedSessions";
const LEAD_TIME_MS = 5 * 60 * 1000; // 5 minutes before session
const POLL_INTERVAL_MS = 30 * 1000; // check every 30 seconds
const TAB_LOCK_KEY = "ssc.notifTabLock";
const TAB_LOCK_TTL_MS = 45 * 1000;

export function getNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function getNotifiedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markNotified(key: string): void {
  const set = getNotifiedSet();
  set.add(key);
  sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
}

function acquireTabLock(): boolean {
  const now = Date.now();
  const existing = localStorage.getItem(TAB_LOCK_KEY);
  if (existing) {
    const ts = parseInt(existing, 10);
    if (now - ts < TAB_LOCK_TTL_MS) return false;
  }
  localStorage.setItem(TAB_LOCK_KEY, String(now));
  return true;
}

function refreshTabLock(): void {
  localStorage.setItem(TAB_LOCK_KEY, String(Date.now()));
}

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function checkAndNotify(sessions: StudySession[]): void {
  if (!getNotificationsEnabled()) return;
  if (Notification.permission !== "granted") return;
  if (!acquireTabLock()) {
    // Another tab owns notifications
    return;
  }
  refreshTabLock();

  const now = Date.now();
  const notified = getNotifiedSet();

  for (const session of sessions) {
    if (session.status !== "planned") continue;

    const startMs = new Date(session.start_time).getTime();
    const diff = startMs - now;

    // Within the notification window: between 0 and LEAD_TIME_MS before start
    if (diff > 0 && diff <= LEAD_TIME_MS) {
      const key = `${session.id}-${session.start_time}`;
      if (notified.has(key)) continue;

      const title = session.focus || "Study Session";
      const minutesAway = Math.ceil(diff / 60000);
      const body = `Starting in ${minutesAway} minute${minutesAway === 1 ? "" : "s"} (${formatSessionTime(session.start_time)})`;

      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: `ssc-session-${session.id}`,
          requireInteraction: false,
        });
      } catch {
        // Notification constructor can fail in some contexts
      }

      markNotified(key);
    }
  }
}

export function useSessionNotifications(): void {
  const { data: sessions } = useSessions();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(() => {
    if (!sessions || sessions.length === 0) return;
    if (!isNotificationSupported()) return;
    if (!getNotificationsEnabled()) return;
    checkAndNotify(sessions);
  }, [sessions]);

  useEffect(() => {
    // Initial check
    check();

    // Poll
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [check]);
}
