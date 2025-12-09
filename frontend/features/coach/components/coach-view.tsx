"use client";

import { CoachChat } from "@/features/coach/components/coach-chat";
import { PlanSuggestionCard } from "@/features/coach/components/plan-suggestion-card";
import { ReflectionForm } from "@/features/reflection/components/reflection-form";
import { ContextVisibilityCard } from "@/features/coach/components/context-visibility-card";
import { ProactiveCheckinCard } from "@/features/coach/components/proactive-checkin-card";
import { StudyStrategyCard } from "@/features/coach/components/study-strategy-card";
import { TroubleshootingCard } from "@/features/coach/components/troubleshooting-card";

export function CoachView() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AI Study Coach</h1>
          <p className="text-sm text-muted-foreground">
            Your personalized academic companion. Get help with planning, study strategies, motivation, and staying on track.
          </p>
        </div>
      </div>
      
      {/* Proactive Check-in */}
      <ProactiveCheckinCard />
      
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <CoachChat />
        <div className="space-y-6">
          <ContextVisibilityCard />
          <PlanSuggestionCard />
          <StudyStrategyCard />
          <TroubleshootingCard />
          <ReflectionForm />
        </div>
      </div>
    </div>
  );
}

