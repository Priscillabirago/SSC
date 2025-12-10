"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMicroPlan } from "@/features/schedule/hooks";
import { formatTime } from "@/lib/utils";

export function MicroPlanWidget() {
  const [minutes, setMinutes] = useState(60);
  const microPlan = useMicroPlan();

  const plan = microPlan.data ?? [];

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Micro-planning</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Micro-Planning</p>
                <p className="text-xs">
                  Create a quick, focused study plan for the next 1-2 hours. Perfect when you have a short window and want to know exactly what to work on.
                </p>
                <p className="text-xs mt-2 text-muted-foreground">
                  Different from the weekly schedule - this is for immediate, short-term planning.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>Design a focused sprint for the next 1–2 hours.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="number"
              min={15}
              max={180}
              step={5}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              placeholder="60"
              className="h-9"
            />
          </div>
          <Button
            onClick={() => microPlan.mutate(minutes)}
            disabled={microPlan.isPending || minutes < 15}
            className="h-9"
          >
            {microPlan.isPending ? "Planning..." : "Plan sprint"}
          </Button>
        </div>
        <div className="space-y-2.5">
          {plan.map((session) => (
            <div
              key={session.id}
              className="rounded-lg border border-border/50 bg-white/60 px-3.5 py-2.5 hover:bg-white/80 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-foreground">{session.generated_by}</p>
                <Badge variant="outline" className="text-xs h-5 px-2">
                  {formatTime(session.start_time)} – {formatTime(session.end_time)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{session.focus}</p>
            </div>
          ))}
          {plan.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Launch a micro plan when you&apos;re ready to focus.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

