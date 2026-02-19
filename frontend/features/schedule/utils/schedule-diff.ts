import type { StudySession } from "@/lib/types";
import { parseBackendDateTime } from "@/lib/utils";

export interface ScheduleDiff {
  moved: Array<{ session: StudySession; oldTime: string; newTime: string }>;
  added: StudySession[];
  removed: StudySession[];
  unchanged: StudySession[];
}

/**
 * Compare two schedules and identify changes.
 * Sessions are matched by task_id + date (within tolerance).
 * Pinned sessions are excluded from diff.
 */
export function compareSchedules(
  oldSessions: StudySession[],
  newSessions: StudySession[],
  timeToleranceMinutes: number = 30
): ScheduleDiff {
  const moved: ScheduleDiff["moved"] = [];
  const added: StudySession[] = [];
  const removed: StudySession[] = [];
  const unchanged: StudySession[] = [];

  // Filter out pinned sessions and completed sessions from comparison
  // (they shouldn't be considered "moved" or "removed")
  const oldUnpinned = oldSessions.filter(
    (s) => !s.is_pinned && s.status !== "completed" && s.status !== "partial"
  );
  const newUnpinned = newSessions.filter(
    (s) => !s.is_pinned && s.status !== "completed" && s.status !== "partial"
  );

  // Create a map of old sessions by task_id + date (ignoring time)
  const oldSessionsByTaskAndDate = new Map<string, StudySession>();
  oldUnpinned.forEach((session) => {
    if (session.task_id) {
      const date = parseBackendDateTime(session.start_time);
      const key = `${session.task_id}-${date.toISOString().split("T")[0]}`;
      if (!oldSessionsByTaskAndDate.has(key)) {
        oldSessionsByTaskAndDate.set(key, session);
      }
    }
  });

  // Track which old sessions have been matched
  const matchedOldSessions = new Set<string>();

  // Check new sessions
  newUnpinned.forEach((newSession) => {
    if (!newSession.task_id) {
      // No task_id means it's a new session (can't match to old)
      added.push(newSession);
      return;
    }

    const newDate = parseBackendDateTime(newSession.start_time);
    const key = `${newSession.task_id}-${newDate.toISOString().split("T")[0]}`;
    const oldSession = oldSessionsByTaskAndDate.get(key);

    if (!oldSession) {
      // No matching old session = new session
      added.push(newSession);
    } else {
      // Check if time changed significantly
      const oldTime = parseBackendDateTime(oldSession.start_time);
      const timeDiffMinutes = Math.abs(
        (newDate.getTime() - oldTime.getTime()) / (1000 * 60)
      );

      if (timeDiffMinutes > timeToleranceMinutes) {
        // Time changed significantly = moved
        moved.push({
          session: newSession,
          oldTime: oldSession.start_time,
          newTime: newSession.start_time,
        });
        matchedOldSessions.add(key);
      } else {
        // Time didn't change much = unchanged
        unchanged.push(newSession);
        matchedOldSessions.add(key);
      }
    }
  });

  // Find removed sessions (old sessions that weren't matched)
  oldUnpinned.forEach((oldSession) => {
    if (!oldSession.task_id) return;

    const oldDate = parseBackendDateTime(oldSession.start_time);
    const key = `${oldSession.task_id}-${oldDate.toISOString().split("T")[0]}`;

    if (!matchedOldSessions.has(key)) {
      removed.push(oldSession);
    }
  });

  return { moved, added, removed, unchanged };
}

/**
 * Get a summary message for schedule changes.
 */
export function getScheduleDiffSummary(diff: ScheduleDiff): string | null {
  const parts: string[] = [];

  if (diff.moved.length > 0) {
    parts.push(`${diff.moved.length} session${diff.moved.length === 1 ? "" : "s"} moved`);
  }
  if (diff.added.length > 0) {
    parts.push(`${diff.added.length} new session${diff.added.length === 1 ? "" : "s"}`);
  }
  if (diff.removed.length > 0) {
    parts.push(`${diff.removed.length} session${diff.removed.length === 1 ? "" : "s"} removed`);
  }

  if (parts.length === 0) {
    return null; // No changes
  }

  return parts.join(", ");
}

/**
 * Check if a session was moved (for visual indicator).
 */
export function isSessionMoved(
  session: StudySession,
  diff: ScheduleDiff | null
): boolean {
  if (!diff) return false;
  return diff.moved.some((m) => m.session.id === session.id);
}

/**
 * Check if a session is new (for visual indicator).
 */
export function isSessionNew(
  session: StudySession,
  diff: ScheduleDiff | null
): boolean {
  if (!diff) return false;
  return diff.added.some((a) => a.id === session.id);
}

