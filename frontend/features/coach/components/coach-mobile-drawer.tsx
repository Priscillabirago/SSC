"use client";

import { useState } from "react";
import { Menu, Eye, Lightbulb, BookOpen, Wrench, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ContextVisibilityCard } from "@/features/coach/components/context-visibility-card";
import { PlanSuggestionCard } from "@/features/coach/components/plan-suggestion-card";
import { StudyStrategyCard } from "@/features/coach/components/study-strategy-card";
import { TroubleshootingCard } from "@/features/coach/components/troubleshooting-card";
import { ReflectionForm } from "@/features/reflection/components/reflection-form";

interface DrawerItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  component: React.ComponentType;
}

const drawerItems: DrawerItem[] = [
  { id: "context", icon: Eye, label: "Context Visibility", component: ContextVisibilityCard },
  { id: "plan", icon: Lightbulb, label: "Plan Adjustments", component: PlanSuggestionCard },
  { id: "strategy", icon: BookOpen, label: "Study Strategies", component: StudyStrategyCard },
  { id: "troubleshooting", icon: Wrench, label: "Troubleshooting", component: TroubleshootingCard },
  { id: "reflection", icon: FileText, label: "Daily Reflection", component: ReflectionForm },
];

export function CoachMobileDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="default"
          size="icon"
          className="lg:hidden fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
          aria-label="Open tools menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] sm:w-[400px] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Coach Tools</SheetTitle>
          <SheetDescription>
            Access planning, strategies, and reflection tools
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {drawerItems.map((item) => {
              const Component = item.component;
              return (
                <div key={item.id}>
                  <Component />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
