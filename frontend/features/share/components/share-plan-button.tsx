"use client";

import { Share2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { createShareToken } from "@/features/share/api";

export function SharePlanButton() {
  const createShare = useMutation({
    mutationFn: createShareToken,
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.url);
        toast({
          title: "Link copied",
          description: "Share with parents, friends, or mentors so they can check your schedule.",
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Failed to copy",
          description: "Here's your link: " + data.url,
        });
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Failed to create link",
        description: "Please try again.",
      });
    },
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => createShare.mutate()}
            disabled={createShare.isPending}
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share my week</span>
            <span className="sm:hidden">Share</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Create a read-only link others can use to view your schedule
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
