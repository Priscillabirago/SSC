"use client";

import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip
} from "chart.js";
import { Pie } from "react-chartjs-2";
import { Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

ChartJS.register(ArcElement, Tooltip, Legend);

interface TimeDistributionProps {
  readonly data: Record<string, number>;
}

export function TimeDistributionChart({ data }: TimeDistributionProps) {
  const subjectNames = Object.keys(data);
  const minutes = Object.values(data);
  const colors = ["#6366F1", "#0EA5E9", "#F97316", "#10B981", "#F43F5E", "#8B5CF6"];

  const totalMinutes = minutes.reduce((sum, m) => sum + m, 0);

  return (
    <div className="rounded-2xl border border-border/60 bg-white/80 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Time by Subject</p>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>What this shows:</strong> How you're allocating study time across subjects.<br />
                  <br />
                  <strong>How to interpret:</strong><br />
                  • Larger slices = More time spent<br />
                  • Compare with your Subject Performance table to see if time matches priorities<br />
                  • "General" = Tasks not assigned to a specific subject<br />
                  <br />
                  <strong>Action tip:</strong> If a subject needs more attention (low completion rate in the table),
                  consider allocating more time to it. Research shows balanced time allocation improves overall performance.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-muted-foreground">
          {totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m total` : "Last 7 days"}
        </p>
      </div>
      {subjectNames.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Schedule study sessions to populate this chart.
        </p>
      ) : (
        <Pie
          data={{
            labels: subjectNames,
            datasets: [
              {
                label: "Minutes",
                data: minutes,
                backgroundColor: subjectNames.map((_, index) => colors[index % colors.length])
              }
            ]
          }}
          options={{
            plugins: {
              legend: {
                position: "bottom"
              }
            }
          }}
        />
      )}
    </div>
  );
}

