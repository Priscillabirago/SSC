"use client";

import {
  Flame,
  Calendar,
  Target,
  Brain,
  Zap,
  Clock,
  Trophy,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectVisibleBadges } from "@/lib/badge-visibility";
import { useBadges } from "../hooks";
import type { Badge } from "../api";

const BADGE_ICONS: Record<string, typeof Flame> = {
  steady_start: Zap,
  week_warrior: Flame,
  unstoppable: Star,
  first_plan: Calendar,
  planner_pro: Calendar,
  deep_focus: Target,
  century: Clock,
  self_aware: Brain,
};

const BADGE_COLORS: Record<string, { earned: string; muted: string }> = {
  consistency: {
    earned: "text-orange-500 bg-orange-100 dark:bg-orange-950/40",
    muted: "text-muted-foreground/40 bg-muted",
  },
  planning: {
    earned: "text-blue-500 bg-blue-100 dark:bg-blue-950/40",
    muted: "text-muted-foreground/40 bg-muted",
  },
  focus: {
    earned: "text-emerald-500 bg-emerald-100 dark:bg-emerald-950/40",
    muted: "text-muted-foreground/40 bg-muted",
  },
  reflection: {
    earned: "text-purple-500 bg-purple-100 dark:bg-purple-950/40",
    muted: "text-muted-foreground/40 bg-muted",
  },
};

function BadgeItem({ badge }: Readonly<{ badge: Badge }>) {
  const Icon = BADGE_ICONS[badge.id] ?? Trophy;
  const colors = BADGE_COLORS[badge.category] ?? BADGE_COLORS.consistency;
  const colorClass = badge.earned ? colors.earned : colors.muted;
  const progressPct = Math.round((badge.progress / badge.threshold) * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center gap-1.5 min-w-0">
            <div
              className={`rounded-xl p-2.5 transition-colors ${colorClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <span
              className={`text-[11px] font-medium leading-tight text-center truncate w-full ${
                badge.earned
                  ? "text-foreground"
                  : "text-muted-foreground/60"
              }`}
            >
              {badge.name}
            </span>
            {!badge.earned && (
              <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/40 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px] text-center">
          <p className="font-medium text-sm">{badge.name}</p>
          <p className="text-xs text-muted-foreground">{badge.description}</p>
          {!badge.earned && (
            <p className="text-xs text-muted-foreground mt-1">
              {badge.progress}/{badge.threshold}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BadgesCard() {
  const { data, isLoading } = useBadges();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {["sk-1", "sk-2", "sk-3"].map((key) => (
              <Skeleton key={key} className="h-16 w-16 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { badges, earned_count, total_count } = data;
  const visible = selectVisibleBadges(badges);

  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Milestones
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {earned_count}/{total_count} earned
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {visible.map((badge) => (
            <BadgeItem key={badge.id} badge={badge} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
