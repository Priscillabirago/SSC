"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Settings, BookOpen, ListTodo, Calendar, X, ArrowRight, Shield, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useProfile } from "@/features/profile/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTasks } from "@/features/tasks/hooks";
import { useSessions } from "@/features/schedule/hooks";
import { useConstraints } from "@/features/constraints/hooks";

const STORAGE_KEY = "ssc.getting-started-dismissed";
const VISITED_SETTINGS_KEY = "ssc.visited-settings";

interface Step {
  id: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  isComplete: boolean;
  isOptional?: boolean;
}

export function GettingStartedGuide() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: subjects } = useSubjects();
  const { data: tasks } = useTasks();
  const { data: sessions } = useSessions();
  const { data: constraints } = useConstraints();

  const [dismissed, setDismissed] = useState(() => {
    if (globalThis.window === undefined) return false;
    return globalThis.window.localStorage.getItem(STORAGE_KEY) === "true";
  });

  const [visitedSettings, setVisitedSettings] = useState(() => {
    if (globalThis.window === undefined) return false;
    return globalThis.window.localStorage.getItem(VISITED_SETTINGS_KEY) === "true";
  });

  useEffect(() => {
    if (globalThis.window === undefined) return;
    const stored = globalThis.window.localStorage.getItem(VISITED_SETTINGS_KEY) === "true";
    if (stored) setVisitedSettings(true);
  }, []);

  const hasConfiguredSettings = visitedSettings || Boolean(profile && (
    profile.timezone !== "UTC" ||
    profile.weekly_study_hours !== 10
  ));
  const hasSubjects = (subjects?.length ?? 0) > 0;
  const hasTasks = tasks?.some(t => !t.is_completed && !t.is_recurring_template) ?? false;
  const hasSchedule = (sessions?.length ?? 0) > 0;
  const hasConstraints = (constraints?.length ?? 0) > 0;

  const steps: Step[] = [
    {
      id: "settings",
      title: "Set your study preferences",
      hint: "Timezone, weekly hours, and when you like to study",
      icon: Settings,
      href: "/settings",
      isComplete: hasConfiguredSettings,
    },
    {
      id: "subjects",
      title: "Add your subjects",
      hint: "e.g. Math, Biology, English — so the scheduler knows what you study",
      icon: BookOpen,
      href: "/tasks",
      isComplete: hasSubjects,
    },
    {
      id: "tasks",
      title: "Create a few tasks",
      hint: "What do you need to work on? Add deadlines and priorities",
      icon: ListTodo,
      href: "/tasks",
      isComplete: hasTasks,
    },
    {
      id: "constraints",
      title: "Block your busy times",
      hint: "Classes, work, or anything the scheduler should avoid",
      icon: Shield,
      href: "/settings",
      isComplete: hasConstraints,
      isOptional: true,
    },
    {
      id: "schedule",
      title: "Generate your study plan",
      hint: "The AI builds a personalized weekly schedule from everything above",
      icon: Calendar,
      href: "/schedule",
      isComplete: hasSchedule,
    },
  ];

  const essentialSteps = steps.filter(s => !s.isOptional);
  const completedCount = steps.filter(s => s.isComplete).length;
  const allEssentialsDone = essentialSteps.every(s => s.isComplete);

  const handleDismiss = () => {
    if (globalThis.window !== undefined) {
      globalThis.window.localStorage.setItem(STORAGE_KEY, "true");
    }
    setDismissed(true);
  };

  const handleStepClick = (step: Step) => {
    if (step.id === "settings" && globalThis.window !== undefined) {
      globalThis.window.localStorage.setItem(VISITED_SETTINGS_KEY, "true");
    }
    router.push(step.href);
  };

  if (dismissed || allEssentialsDone) {
    return null;
  }

  const nextStep = steps.find(s => !s.isComplete);

  const getProgressText = (): string => {
    if (completedCount === 0) return "A few quick steps and you're ready to go";
    const suffix = allEssentialsDone ? "looking great!" : "almost there";
    return `${completedCount} of ${steps.length} done — ${suffix}`;
  };

  const getStepButtonClass = (isComplete: boolean, isNext: boolean): string => {
    if (isComplete) return "border-green-200/60 bg-green-50/40";
    if (isNext) return "border-primary/40 bg-primary/5 shadow-sm";
    return "border-border/50 hover:border-border hover:bg-muted/30";
  };

  const getIndicatorClass = (isComplete: boolean, isNext: boolean): string => {
    if (isComplete) return "text-green-500";
    if (isNext) return "text-primary";
    return "text-muted-foreground/50";
  };

  const getIconClass = (isComplete: boolean, isNext: boolean): string => {
    if (isComplete) return "text-green-600";
    if (isNext) return "text-primary";
    return "text-muted-foreground";
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Let&apos;s get you set up
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {getProgressText()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {steps.map((step) => {
          const Icon = step.icon;
          const isNext = step.id === nextStep?.id;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepClick(step)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${getStepButtonClass(step.isComplete, isNext)}`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 ${getIndicatorClass(step.isComplete, isNext)}`}>
                  {step.isComplete ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${getIconClass(step.isComplete, isNext)}`} />
                    <span className={`text-sm font-medium ${step.isComplete ? "text-green-800 line-through decoration-green-300" : "text-foreground"}`}>
                      {step.title}
                    </span>
                    {step.isOptional && !step.isComplete && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">optional</span>
                    )}
                  </div>
                  {!step.isComplete && (
                    <p className="text-xs text-muted-foreground mt-0.5 pl-5.5">{step.hint}</p>
                  )}
                </div>
                {!step.isComplete && (
                  <ArrowRight className={`h-3.5 w-3.5 flex-shrink-0 ${isNext ? "text-primary" : "text-muted-foreground/40"}`} />
                )}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
