import api from "@/lib/api-client";

export interface JournalEntry {
  type: "session_note" | "reflection";
  date: string;
  timestamp: string;
  subject: string | null;
  duration_minutes: number | null;
  energy_level: string | null;
  content: string | null;
  worked?: string | null;
  challenging?: string | null;
  summary?: string | null;
  suggestion?: string | null;
}

export interface StudyJournalResponse {
  entries: JournalEntry[];
  total: number;
}

export async function fetchStudyJournal(): Promise<StudyJournalResponse> {
  const { data } = await api.get<StudyJournalResponse>("/analytics/study-journal");
  return data;
}
