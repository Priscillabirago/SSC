"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Info, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DayAdherence } from "../api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface DayAdherenceChartProps {
  readonly data: DayAdherence[];
}

export function DayAdherenceChart({ data }: DayAdherenceChartProps) {
  const hasData = data.some(d => d.sessions_scheduled > 0);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Weekly Pattern
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    See which days of the week you're most consistent with completing sessions.
                    This helps you plan heavy work on your most productive days.
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No session data available for the selected time range.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = {
    labels: data.map(d => d.day_name.slice(0, 3)), // Mon, Tue, Wed, etc.
    datasets: [
      {
        label: "Adherence Rate",
        data: data.map(d => d.adherence_rate * 100),
        backgroundColor: data.map(d => {
          const rate = d.adherence_rate;
          if (rate >= 0.7) return "rgba(34, 197, 94, 0.7)"; // green
          if (rate >= 0.5) return "rgba(245, 158, 11, 0.7)"; // amber
          return "rgba(239, 68, 68, 0.7)"; // red
        }),
        borderColor: data.map(d => {
          const rate = d.adherence_rate;
          if (rate >= 0.7) return "rgb(34, 197, 94)";
          if (rate >= 0.5) return "rgb(245, 158, 11)";
          return "rgb(239, 68, 68)";
        }),
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const index = context.dataIndex;
            const dayData = data[index];
            return [
              `Adherence: ${Math.round(dayData.adherence_rate * 100)}%`,
              `${dayData.sessions_completed} of ${dayData.sessions_scheduled} sessions completed`,
            ];
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + "%";
          },
        },
        title: {
          display: true,
          text: "Adherence Rate (%)",
        },
      },
      x: {
        title: {
          display: true,
          text: "Day of Week",
        },
      },
    },
  };

  // Find best and worst days
  const bestDay = data.reduce((best, current) => 
    current.adherence_rate > best.adherence_rate ? current : best
  );
  const worstDay = data.reduce((worst, current) => 
    current.adherence_rate < worst.adherence_rate ? current : worst
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          Weekly Pattern
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>What this shows:</strong> Your session completion rate by day of the week.<br />
                  <br />
                  <strong>How to interpret:</strong><br />
                  • Green bars (70%+) = Your most consistent days<br />
                  • Amber bars (50-70%) = Moderate consistency<br />
                  • Red bars (&lt;50%) = Days that need attention<br />
                  <br />
                  <strong>Action tip:</strong> Schedule important or challenging work on your high-adherence days.
                  Use low-adherence days for lighter review or catch-up tasks.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 mb-4">
          <Bar data={chartData} options={options} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg bg-green-50 p-3 border border-green-200">
            <p className="font-medium text-green-900 mb-1">Best Day</p>
            <p className="text-green-700">
              {bestDay.day_name}: {Math.round(bestDay.adherence_rate * 100)}% adherence
            </p>
            <p className="text-green-600 mt-1">
              {bestDay.sessions_completed}/{bestDay.sessions_scheduled} sessions
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 border border-red-200">
            <p className="font-medium text-red-900 mb-1">Needs Attention</p>
            <p className="text-red-700">
              {worstDay.day_name}: {Math.round(worstDay.adherence_rate * 100)}% adherence
            </p>
            <p className="text-red-600 mt-1">
              {worstDay.sessions_completed}/{worstDay.sessions_scheduled} sessions
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

