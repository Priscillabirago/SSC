import type { JournalEntry } from "@/features/journal/api";

export type JournalTypeFilter = "all" | "session_note" | "reflection";

/** Collect unique subject names from entries (session notes may have a subject). */
export function collectJournalSubjects(entries: JournalEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.subject) set.add(e.subject);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Apply type + subject filters used by the journal page. */
export function filterJournalEntries(
  entries: JournalEntry[],
  typeFilter: JournalTypeFilter,
  subjectFilter: string,
): JournalEntry[] {
  return entries.filter((e) => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (subjectFilter !== "all" && e.subject !== subjectFilter) return false;
    return true;
  });
}
