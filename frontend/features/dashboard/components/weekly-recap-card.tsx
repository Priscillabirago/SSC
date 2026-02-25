"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWeeklyRecap } from "@/features/dashboard/hooks";
import type { WeeklyRecapData } from "@/features/dashboard/api";

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  e.setDate(e.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

const toneConfig = {
  celebratory: {
    border: "border-green-200",
    bg: "from-green-50/60 to-white",
    accent: "text-green-700",
    badge: "bg-green-100 text-green-700",
    icon: Sparkles,
  },
  encouraging: {
    border: "border-blue-200",
    bg: "from-blue-50/60 to-white",
    accent: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    icon: TrendingUp,
  },
  honest: {
    border: "border-amber-200",
    bg: "from-amber-50/60 to-white",
    accent: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    icon: Target,
  },
};

function StatPill({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  readonly icon: typeof Clock;
  readonly label: string;
  readonly value: string;
  readonly colorClass: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function RecapContent({ data }: { readonly data: WeeklyRecapData }) {
  const [expanded, setExpanded] = useState(false);
  const tone = data.tone && data.tone in toneConfig ? data.tone : "encouraging";
  const config = toneConfig[tone];
  const ToneIcon = config.icon;
  const stats = data.stats;
  const adherencePercent = stats?.adherence ?? 0;
  const hoursPercent = stats && stats.hours_target > 0
    ? Math.min(100, Math.round((stats.hours_studied / stats.hours_target) * 100))
    : 0;

  return (
    <Card className={`${config.border} bg-gradient-to-r ${config.bg} overflow-hidden`}>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className={`mt-0.5 rounded-lg p-1.5 ${config.badge}`}>
              <ToneIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">Weekly Recap</h3>
                <span className="text-xs text-muted-foreground">
                  {formatWeekRange(data.week_start, data.week_end)}
                </span>
              </div>
              <p className="text-sm text-foreground/85 mt-1.5 leading-relaxed">
                {data.recap}
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        {stats && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-9">
            <StatPill
              icon={CheckCircle2}
              label="Sessions"
              value={`${stats.sessions_completed}/${stats.sessions_total}`}
              colorClass="text-green-600"
            />
            <StatPill
              icon={Clock}
              label="Hours"
              value={`${stats.hours_studied}/${stats.hours_target}h`}
              colorClass="text-blue-600"
            />
            {stats.tasks_completed > 0 && (
              <StatPill
                icon={Target}
                label="Tasks done"
                value={String(stats.tasks_completed)}
                colorClass="text-purple-600"
              />
            )}
            {stats.streak > 0 && (
              <StatPill
                icon={Flame}
                label="Streak"
                value={`${stats.streak}d`}
                colorClass="text-orange-500"
              />
            )}
          </div>
        )}

        {/* Progress bars */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 pl-9">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Adherence</span>
                <span className="font-medium">{adherencePercent}%</span>
              </div>
              <Progress value={adherencePercent} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Hours</span>
                <span className="font-medium">{hoursPercent}%</span>
              </div>
              <Progress value={hoursPercent} className="h-1.5" />
            </div>
          </div>
        )}

        {/* Highlight */}
        {data.highlight && (
          <div className="flex items-start gap-2 pl-9 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <span className="text-foreground/80">{data.highlight}</span>
          </div>
        )}

        {/* Expandable details */}
        {(data.concern || (data.actions && data.actions.length > 0)) && (
          <div className="pl-9">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Show less" : "Actions for this week"}
            </button>

            {expanded && (
              <div className="mt-3 space-y-3">
                {data.concern && (
                  <div className="flex items-start gap-2 text-xs">
                    <Calendar className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <span className="text-foreground/80">{data.concern}</span>
                  </div>
                )}
                {data.actions && data.actions.length > 0 && (
                  <div className="space-y-2">
                    {data.actions.map((action) => (
                      <div key={action} className="flex items-start gap-2 text-xs">
                        <Lightbulb className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                        <span className="text-foreground/80">{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RECAP_DISMISS_KEY = "ssc.weeklyRecapDismissed";

function getWeekKey(weekStart: string): string {
  return weekStart.slice(0, 10);
}

export function WeeklyRecapCard() {
  const { data, isLoading } = useWeeklyRecap();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!data?.week_start) return;
    const savedWeek = localStorage.getItem(RECAP_DISMISS_KEY);
    const currentWeek = getWeekKey(data.week_start);
    setDismissed(savedWeek === currentWeek);
  }, [data]);

  const handleDismiss = () => {
    if (data?.week_start) {
      localStorage.setItem(RECAP_DISMISS_KEY, getWeekKey(data.week_start));
    }
    setDismissed(true);
  };

  if (isLoading || !data || !data.has_data || dismissed) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 z-10 opacity-60 hover:opacity-100"
        onClick={handleDismiss}
        aria-label="Dismiss weekly recap"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <RecapContent data={data} />
    </div>
  );
}
