"use client";

import { CoachChat } from "@/features/coach/components/coach-chat";
import { ProactiveCheckinCard } from "@/features/coach/components/proactive-checkin-card";
import { CoachSidebar } from "@/features/coach/components/coach-sidebar";
import { CoachMobileDrawer } from "@/features/coach/components/coach-mobile-drawer";

export function CoachView() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">AI Study Coach</h1>
          <p className="text-sm text-muted-foreground">
            Your personalized academic companion. Get help with planning, study strategies, motivation, and staying on track.
          </p>
        </div>
      </div>
      
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

