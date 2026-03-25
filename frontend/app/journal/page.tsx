import { AppShell } from "@/components/layout/app-shell";
import { JournalView } from "@/features/journal/components/journal-view";

export default function JournalPage() {
  return (
    <AppShell>
      <JournalView />
    </AppShell>
  );
}
