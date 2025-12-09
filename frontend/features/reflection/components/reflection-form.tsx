"use client";

import { useState } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCoachReflection } from "@/features/coach/hooks";
import { toast } from "@/components/ui/use-toast";

export function ReflectionForm() {
  const [worked, setWorked] = useState("");
  const [challenging, setChallenging] = useState("");
  const reflection = useCoachReflection();

  const handleSubmit = () => {
    reflection.mutate(
      { worked, challenging },
      {
        onSuccess: (data) => {
          toast({
            title: "Reflection saved",
            description: data.suggestion ?? "We'll factor this into tomorrow's plan."
          });
          setWorked("");
          setChallenging("");
        }
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily reflection</CardTitle>
        <CardDescription>
          Capture insights from {format(new Date(), "EEEE, MMM d")} to help the coach adjust tomorrow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">What worked well today?</p>
          <Textarea
            value={worked}
            onChange={(event) => setWorked(event.target.value)}
            placeholder="e.g. Morning review helped me remember formulas..."
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">What felt challenging?</p>
          <Textarea
            value={challenging}
            onChange={(event) => setChallenging(event.target.value)}
            placeholder="e.g. Evening session slipped because I was tired..."
          />
        </div>
        <Button onClick={handleSubmit} disabled={reflection.isPending || !worked || !challenging}>
          {reflection.isPending ? "Summarizing..." : "Save reflection"}
        </Button>
      </CardContent>
    </Card>
  );
}

