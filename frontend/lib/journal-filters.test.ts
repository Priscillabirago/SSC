import { describe, expect, it } from "vitest";

import type { JournalEntry } from "@/features/journal/api";

import { collectJournalSubjects, filterJournalEntries } from "./journal-filters";

const sample: JournalEntry[] = [
  {
    type: "session_note",
    date: "2026-06-01",
    timestamp: "2026-06-01T14:00:00Z",
    subject: "Math",
    duration_minutes: 30,
    energy_level: "medium",
    content: "Note A",
  },
  {
    type: "reflection",
    date: "2026-06-01",
    timestamp: "2026-06-01T20:00:00Z",
    subject: null,
    duration_minutes: null,
    energy_level: null,
    content: null,
    worked: "x",
    challenging: "y",
    summary: "s",
    suggestion: null,
  },
  {
    type: "session_note",
    date: "2026-06-02",
    timestamp: "2026-06-02T10:00:00Z",
    subject: "Physics",
    duration_minutes: 20,
    energy_level: "low",
    content: "Note B",
  },
];

describe("collectJournalSubjects", () => {
  it("returns sorted unique subjects", () => {
    expect(collectJournalSubjects(sample)).toEqual(["Math", "Physics"]);
  });
});

describe("filterJournalEntries", () => {
  it("filters by session_note only", () => {
    const out = filterJournalEntries(sample, "session_note", "all");
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.type === "session_note")).toBe(true);
  });

  it("filters by reflection only", () => {
    const out = filterJournalEntries(sample, "reflection", "all");
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("reflection");
  });

  it("filters by subject", () => {
    const out = filterJournalEntries(sample, "all", "Math");
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe("Math");
  });

  it("combines type and subject", () => {
    const out = filterJournalEntries(sample, "session_note", "Physics");
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("Note B");
  });
});
