"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Settings, BookOpen, ListTodo, Calendar, X, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useProfile } from "@/features/profile/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { useSessions } from "@/features/schedule/hooks";

const STORAGE_KEY = "ssc.getting-started-dismissed";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  checkFn: () => boolean;
}

export function GettingStartedGuide() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: subjects } = useSubjects();
  const { data: tasks } = useTasks();
  const { data: sessions } = useSessions();
  const [dismissed, setDismissed] = useState(() => {
    if (globalThis.window === undefined) return false;
    return globalThis.window.localStorage.getItem(STORAGE_KEY) === "true";
  });

  // Check if user has completed setup
  const hasConfiguredSettings = Boolean(profile && (
    profile.timezone !== "UTC" || 
    profile.weekly_study_hours !== 10 ||
    (profile.preferred_study_windows && Object.keys(profile.preferred_study_windows).length > 0)
  ));
  const hasSubjects = (subjects?.length ?? 0) > 0;
  const hasTasks = tasks?.some(t => !t.is_completed && !t.is_recurring_template) ?? false;
  const hasSchedule = (sessions?.length ?? 0) > 0;

  const steps: Step[] = [
    {
      id: "settings",
      title: "Configure your preferences",
      description: "Set your timezone, weekly study hours, and preferred study times",
      icon: Settings,
      href: "/settings",
      checkFn: () => hasConfiguredSettings || false,
    },
    {
      id: "subjects",
      title: "Add your subjects",
      description: "Create subjects to organize your studies (e.g., Math, Biology)",
      icon: BookOpen,
      href: "/tasks",
      checkFn: () => hasSubjects || false,
    },
    {
      id: "tasks",
      title: "Create your tasks",
      description: "Add tasks with deadlines and priorities for each subject",
      icon: ListTodo,
      href: "/tasks",
      checkFn: () => hasTasks || false,
    },
    {
      id: "schedule",
      title: "Generate your schedule",
      description: "Let the AI create your personalized weekly study plan",
      icon: Calendar,
      href: "/schedule",
      checkFn: () => hasSchedule || false,
    },
  ];

  const completedSteps = steps.filter(step => step.checkFn()).length;
  const allCompleted = completedSteps === steps.length;

  const handleDismiss = () => {
    if (globalThis.window) {
      globalThis.window.localStorage.setItem(STORAGE_KEY, "true");
    }
    setDismissed(true);
  };

  // Don't show if dismissed or all steps completed
  if (dismissed || allCompleted) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Circle className="h-5 w-5 text-primary" />
              Getting Started
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Complete these steps to set up your study companion ({completedSteps}/{steps.length} done)
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => {
          const completed = step.checkFn();
          const Icon = step.icon;
          
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => router.push(step.href)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                completed
                  ? "border-green-200 bg-green-50/50"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${completed ? "text-green-600" : "text-muted-foreground"}`}>
                  {completed ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-4 w-4 ${completed ? "text-green-600" : "text-primary"}`} />
                    <h4 className={`text-sm font-semibold ${completed ? "text-green-900" : "text-foreground"}`}>
                      {index + 1}. {step.title}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

