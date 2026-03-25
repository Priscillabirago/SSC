import { useQuery } from "@tanstack/react-query";
import { fetchStudyJournal } from "./api";

export function useStudyJournal() {
  return useQuery({
    queryKey: ["analytics", "study-journal"],
    queryFn: fetchStudyJournal,
    staleTime: 1000 * 60 * 5,
  });
}
