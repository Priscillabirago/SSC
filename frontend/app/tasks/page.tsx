import { AppShell } from "@/components/layout/app-shell";
import { TasksView } from "@/features/tasks/components/tasks-view";

export default function TasksPage() {
  return (
    <AppShell>
      <TasksView />
    </AppShell>
  );
}

