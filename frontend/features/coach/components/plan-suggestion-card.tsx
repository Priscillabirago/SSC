"use client";

import { Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoachPlanSuggestion } from "@/features/coach/hooks";
import { toast } from "@/components/ui/use-toast";

export function PlanSuggestionCard() {
  const suggestion = useCoachPlanSuggestion();

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4 text-primary" />
          Plan adjustments
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            suggestion.mutate(undefined, {
              onError: () =>
                toast({
                  variant: "destructive",
                  title: "Coach unavailable",
                  description: "Try again shortly."
                })
            })
          }
          disabled={suggestion.isPending}
        >
          {suggestion.isPending ? "Thinking..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {suggestion.data ? (
          <>
            <p className="font-medium text-foreground">{suggestion.data.summary}</p>
            {suggestion.data.highlights && suggestion.data.highlights.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {suggestion.data.highlights.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Ask the coach to review your schedule for targeted adjustments.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

