"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip
} from "chart.js";
import { Line } from "react-chartjs-2";
import { format, parseISO } from "date-fns";
import { Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface TrendChartProps {
  readonly data: { day: string; completed_minutes: number; scheduled_minutes: number }[];
}

// Helper function to format minutes as hours and minutes when > 60
function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function ProductivityTrendChart({ data }: TrendChartProps) {
  const labels = data.map((point) => format(parseISO(point.day), "EEE"));

  return (
    <div className="rounded-2xl border border-border/60 bg-white/80 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Productivity Trend</p>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>What this shows:</strong> Daily comparison of scheduled vs. completed study time.<br />
                  <br />
                  <strong>How to interpret:</strong><br />
                  • Blue line = Time you actually completed<br />
                  • Purple line = Time you scheduled<br />
                  • When lines are close = Good planning and execution<br />
                  • Large gaps = You're either over-scheduling or under-performing<br />
                  <br />
                  <strong>Action tip:</strong> If there's a consistent gap, adjust your schedule to be more realistic.
                  Better to schedule less and complete it than schedule more and miss it.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-muted-foreground">Completed vs scheduled minutes</p>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Execute a few sessions to see your momentum line.
        </p>
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                label: "Completed",
                data: data.map((point) => point.completed_minutes),
                borderColor: "#0EA5E9",
                backgroundColor: "rgba(14, 165, 233, 0.2)",
                tension: 0.4,
                fill: true
              },
              {
                label: "Scheduled",
                data: data.map((point) => point.scheduled_minutes),
                borderColor: "#6366F1",
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                tension: 0.4,
                fill: true
              }
            ]
          }}
          options={{
            responsive: true,
            plugins: {
              legend: {
                position: "bottom"
              },
              tooltip: {
                callbacks: {
                  label: function(context: any) {
                    const label = context.dataset.label || '';
                    const value = context.parsed.y;
                    return `${label}: ${formatMinutes(value)}`;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 60, // 1 hour intervals
                  callback: function(value: any) {
                    return formatMinutes(value);
                  }
                }
              }
            }
          }}
        />
      )}
    </div>
  );
}

