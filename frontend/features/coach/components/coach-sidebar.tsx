"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, Eye, Lightbulb, BookOpen, Wrench, FileText, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ContextVisibilityCard } from "@/features/coach/components/context-visibility-card";
import { PlanSuggestionCard } from "@/features/coach/components/plan-suggestion-card";
import { StudyStrategyCard } from "@/features/coach/components/study-strategy-card";
import { TroubleshootingCard } from "@/features/coach/components/troubleshooting-card";
import { ReflectionForm } from "@/features/reflection/components/reflection-form";

interface SidebarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color: string;
  component: React.ComponentType;
}

const sidebarItems: SidebarItem[] = [
  { 
    id: "context", 
    icon: Eye, 
    label: "Context Visibility", 
    description: "See what data the AI uses",
    color: "bg-blue-50/70 border-blue-200/50 text-blue-700 hover:bg-blue-50 hover:border-blue-300",
    component: ContextVisibilityCard 
  },
  { 
    id: "plan", 
    icon: Lightbulb, 
    label: "Plan Adjustments", 
    description: "AI-powered schedule suggestions",
    color: "bg-amber-50/70 border-amber-200/50 text-amber-700 hover:bg-amber-50 hover:border-amber-300",
    component: PlanSuggestionCard 
  },
  { 
    id: "strategy", 
    icon: BookOpen, 
    label: "Study Strategies", 
    description: "Research-backed techniques",
    color: "bg-purple-50/70 border-purple-200/50 text-purple-700 hover:bg-purple-50 hover:border-purple-300",
    component: StudyStrategyCard 
  },
  { 
    id: "troubleshooting", 
    icon: Wrench, 
    label: "Troubleshooting", 
    description: "Solve study challenges",
    color: "bg-green-50/70 border-green-200/50 text-green-700 hover:bg-green-50 hover:border-green-300",
    component: TroubleshootingCard 
  },
  { 
    id: "reflection", 
    icon: FileText, 
    label: "Daily Reflection", 
    description: "End-of-day review & feedback",
    color: "bg-indigo-50/70 border-indigo-200/50 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300",
    component: ReflectionForm 
  },
];

export function CoachSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setExpandedItem(null);
    }
  };

  const handleItemClick = (itemId: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setExpandedItem(itemId);
    } else {
      setExpandedItem(expandedItem === itemId ? null : itemId);
    }
  };

  return (
    <div className="relative hidden lg:block flex-shrink-0">
      <Card className={cn(
        "transition-all duration-300 ease-in-out h-[600px] sm:h-[700px] shadow-lg",
        isCollapsed ? "w-56" : expandedItem ? "w-[420px]" : "w-72"
      )}>
        <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/10">
          {/* Header with collapse button */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background/50 backdrop-blur-sm">
            {!isCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-foreground leading-tight">Coach Tools</h3>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Quick access</p>
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="flex items-center justify-center w-full">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="h-7 w-7 ml-auto"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Collapsed state - preview cards */}
          {isCollapsed ? (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition-all duration-200 hover:shadow-md group active:scale-[0.98]",
                      item.color,
                      expandedItem === item.id && "ring-1 ring-primary/40 shadow-sm"
                    )}
                    aria-label={item.label}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn(
                        "rounded-md p-1.5 bg-white/80 backdrop-blur-sm group-hover:bg-white transition-all",
                        expandedItem === item.id && "bg-white"
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-0.5 leading-tight">{item.label}</p>
                        <p className="text-[10px] leading-snug opacity-85 line-clamp-2">{item.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Expanded state - accordion style with previews */
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const Component = item.component;
                const isExpanded = expandedItem === item.id;

                return (
                  <div key={item.id} className="space-y-2">
                    <button
                      onClick={() => handleItemClick(item.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all duration-200 hover:shadow-md group active:scale-[0.99]",
                        isExpanded 
                          ? "bg-primary/5 border-primary/30 shadow-sm" 
                          : `${item.color} hover:shadow-sm`
                      )}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <div className={cn(
                            "rounded-md p-2 bg-white/80 backdrop-blur-sm group-hover:bg-white transition-all flex-shrink-0",
                            isExpanded && "bg-primary/10"
                          )}>
                            <Icon className={cn(
                              "h-4 w-4 transition-colors",
                              isExpanded ? "text-primary" : ""
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-xs font-semibold mb-1 leading-tight",
                              isExpanded ? "text-foreground" : ""
                            )}>
                              {item.label}
                            </p>
                            <p className={cn(
                              "text-[11px] leading-snug",
                              isExpanded ? "text-muted-foreground" : "opacity-85"
                            )}>
                              {item.description}
                            </p>
                          </div>
                        </div>
                        {isExpanded && (
                          <X className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5 hover:text-foreground transition-colors" />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="pl-1 animate-in slide-in-from-top-2 duration-200">
                        <Component />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
