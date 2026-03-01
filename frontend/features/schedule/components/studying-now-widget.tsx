"use client";

import { Users } from "lucide-react";
import { useStudyingNow } from "@/features/dashboard/hooks";

export function StudyingNowWidget() {
  const { data } = useStudyingNow();

  if (!data || data.count === 0) return null;

  return (
    <span className="flex items-center gap-1.5">
      <Users className="h-3 w-3" />
      <span>
        {data.count} {data.count === 1 ? "student" : "students"} studying now
      </span>
    </span>
  );
}
