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
import { Info, Battery, BatteryLow, BatteryMedium } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { EnergyProductivity } from "../api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface EnergyProductivityChartProps {
  readonly data: EnergyProductivity[];
}

export function EnergyProductivityChart({ data }: EnergyProductivityChartProps) {
  const hasData = data.some(d => d.sessions_count > 0);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Battery className="h-5 w-5 text-purple-500" />
            Energy & Productivity
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    See how your energy levels affect study session completion.
                    Research shows aligning study times with your natural energy patterns improves performance.
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No energy data available. Log your energy levels to see correlations with productivity.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = {
    labels: data.map(d => d.energy_level.charAt(0).toUpperCase() + d.energy_level.slice(1)),
    datasets: [
      {
        label: "Completion Rate",
        data: data.map(d => d.completion_rate * 100),
        backgroundColor: [
          "rgba(239, 68, 68, 0.7)",   // red for low
          "rgba(245, 158, 11, 0.7)",  // amber for medium
          "rgba(34, 197, 94, 0.7)",   // green for high
        ],
        borderColor: [
          "rgb(239, 68, 68)",
          "rgb(245, 158, 11)",
          "rgb(34, 197, 94)",
        ],
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
            const energyData = data[index];
            return [
              `Completion: ${Math.round(energyData.completion_rate * 100)}%`,
              `Sessions: ${energyData.sessions_count} (${energyData.completed_count} completed)`,
              `Avg Duration: ${Math.round(energyData.average_duration_minutes)} min`,
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
          text: "Completion Rate (%)",
        },
      },
      x: {
        title: {
          display: true,
          text: "Energy Level",
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Battery className="h-5 w-5 text-purple-500" />
          Energy & Productivity
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>What this shows:</strong> How well you complete sessions at different energy levels.<br />
                  <br />
                  <strong>Research insight:</strong> Chronotype studies show students perform better when study times align with natural energy patterns.
                  Use this to schedule important work during your high-energy periods.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <Bar data={chartData} options={options} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
          {data.map((energy) => (
            <div key={energy.energy_level} className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {energy.energy_level === "low" && <BatteryLow className="h-4 w-4 text-red-600" />}
                {energy.energy_level === "medium" && <BatteryMedium className="h-4 w-4 text-amber-600" />}
                {energy.energy_level === "high" && <Battery className="h-4 w-4 text-green-600" />}
                <span className="font-medium capitalize">{energy.energy_level}</span>
              </div>
              <p className="text-muted-foreground">
                {energy.sessions_count} sessions
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

