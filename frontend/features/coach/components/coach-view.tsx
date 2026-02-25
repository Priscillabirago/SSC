"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";

import { CoachChat } from "@/features/coach/components/coach-chat";
import { ProactiveCheckinCard } from "@/features/coach/components/proactive-checkin-card";
import { CoachSidebar } from "@/features/coach/components/coach-sidebar";
import { CoachMobileDrawer } from "@/features/coach/components/coach-mobile-drawer";
import { ReflectionForm } from "@/features/reflection/components/reflection-form";

export function CoachView() {
  const [showReflection, setShowReflection] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">AI Study Coach</h1>
          <p className="text-sm text-muted-foreground">
            Your personalized academic companion. Get help with planning, study strategies, motivation, and staying on track.
          </p>
        </div>
        <button
          onClick={() => setShowReflection(!showReflection)}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/80 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Daily Reflection</span>
          <span className="sm:hidden">Reflect</span>
          {showReflection ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      
      {/* Daily Reflection - collapsible */}
      {showReflection && <ReflectionForm />}
      
      {/* Proactive Check-in */}
      <ProactiveCheckinCard />
      
      {/* Main content area */}
      <div className="flex gap-6 items-start">
        {/* Chat - expands when sidebar is collapsed */}
        <div className="flex-1 min-w-0 lg:max-w-none">
          <CoachChat />
        </div>
        
        {/* Desktop Sidebar - hidden on mobile */}
        <CoachSidebar />
      </div>
      
      {/* Mobile Drawer - floating button */}
      <CoachMobileDrawer />
    </div>
  );
}

