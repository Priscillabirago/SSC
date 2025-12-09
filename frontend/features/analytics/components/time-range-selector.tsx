"use client";

import { useState } from "react";
import { Calendar, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays } from "date-fns";

type TimeRange = "week" | "month" | "custom";

interface TimeRangeSelectorProps {
  readonly onRangeChange: (startDate: string, endDate: string) => void;
}

export function TimeRangeSelector({ onRangeChange }: TimeRangeSelectorProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("week");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const handlePresetChange = (range: TimeRange) => {
    setSelectedRange(range);
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (range) {
      case "week":
        start = subDays(today, 7);
        break;
      case "month":
        start = subDays(today, 30);
        break;
      default:
        return; // Custom handled separately
    }

    onRangeChange(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onRangeChange(customStart, customEnd);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Time Range:</span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant={selectedRange === "week" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSelectedRange("week");
            handlePresetChange("week");
          }}
        >
          Last 7 Days
        </Button>
        <Button
          variant={selectedRange === "month" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSelectedRange("month");
            handlePresetChange("month");
          }}
        >
          Last 30 Days
        </Button>
        <Button
          variant={selectedRange === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedRange("custom")}
        >
          Custom
        </Button>
      </div>

      {selectedRange === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button size="sm" onClick={handleCustomApply} disabled={!customStart || !customEnd}>
            Apply
          </Button>
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              Select a time range to analyze your study patterns. This helps identify trends and optimize your schedule.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

