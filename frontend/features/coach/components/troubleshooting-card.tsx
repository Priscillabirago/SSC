"use client";

import { useState } from "react";
import { AlertCircle, Clock, TrendingDown, Zap, HelpCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useCoachChat, usePostCoachChatMessage } from "@/features/coach/hooks";
import { useQueryClient } from "@tanstack/react-query";

const TROUBLESHOOTING_ISSUES = [
  {
    id: "procrastination",
    name: "Procrastination",
    icon: Clock,
    prompt: "I keep procrastinating. How can I overcome this? Please look at my current tasks, deadlines, and schedule to give me personalized advice.",
    color: "text-amber-600",
  },
  {
    id: "overwhelmed",
    name: "Feeling Overwhelmed",
    icon: AlertCircle,
    prompt: "I'm feeling overwhelmed with my workload. What should I do? Please review my tasks, deadlines, and schedule to help me prioritize and manage better.",
    color: "text-red-600",
  },
  {
    id: "burnout",
    name: "Burnout",
    icon: TrendingDown,
    prompt: "I'm feeling burned out. How can I recover and prevent this? Consider my current workload, schedule, and energy levels when giving advice.",
    color: "text-orange-600",
  },
  {
    id: "motivation",
    name: "Lack of Motivation",
    icon: Zap,
    prompt: "I'm struggling to stay motivated. What strategies can help? Please consider my current tasks, progress, and goals when suggesting solutions.",
    color: "text-blue-600",
  },
  {
    id: "time-management",
    name: "Time Management",
    icon: Clock,
    prompt: "I'm having trouble managing my time effectively. Can you help? Please review my tasks, deadlines, and schedule to give me specific, actionable advice.",
    color: "text-purple-600",
  },
  {
    id: "focus",
    name: "Difficulty Focusing",
    icon: HelpCircle,
    prompt: "I can't seem to focus during study sessions. What can I do? Consider my current tasks, subjects, and schedule when suggesting focus strategies.",
    color: "text-green-600",
  },
];

export function TroubleshootingCard() {
  const chatMutation = useCoachChat();
  const postMessageMutation = usePostCoachChatMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loadingIssue, setLoadingIssue] = useState<string | null>(null);

  const handleIssueClick = (issueId: string, prompt: string) => {
    setLoadingIssue(issueId);
    
    // Save user message to history first
    postMessageMutation.mutate(
      {
        role: "user",
        content: prompt,
      },
      {
        onSuccess: () => {
          // After user message is saved, send to coach
          chatMutation.mutate(prompt, {
            onSuccess: (response) => {
              // Save assistant response to history
              postMessageMutation.mutate(
                {
                  role: "assistant",
                  content: response.reply,
                },
                {
                  onSuccess: () => {
                    // Refresh chat history - use refetch to ensure immediate update
                    queryClient.invalidateQueries({ queryKey: ["coach", "history"] });
                    queryClient.refetchQueries({ queryKey: ["coach", "history"] });
                    setLoadingIssue(null);
                    toast({
                      title: "Response received",
                      description: "Check the chat for personalized advice.",
                    });
                  },
                  onError: (error) => {
                    console.error("Failed to save assistant message:", error);
                    setLoadingIssue(null);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "Failed to save response. Please try again.",
                    });
                  },
                }
              );
            },
            onError: (error: any) => {
              console.error("Failed to get coach response:", error);
              setLoadingIssue(null);
              toast({
                variant: "destructive",
                title: "Failed to get response",
                description: error?.response?.data?.detail || "The coach is unavailable. Please try again.",
              });
            },
          });
        },
        onError: (error) => {
          console.error("Failed to save user message:", error);
          setLoadingIssue(null);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to start conversation. Please try again.",
          });
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="h-4 w-4 text-primary" />
          Quick Help
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Common challenges students face. Click to get personalized advice.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TROUBLESHOOTING_ISSUES.map((issue) => {
            const Icon = issue.icon;
            return (
              <TooltipProvider key={issue.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-auto py-2.5 px-3 text-xs gap-2 justify-start hover:bg-primary/5 hover:border-primary/30"
                      onClick={() => handleIssueClick(issue.id, issue.prompt)}
                      disabled={loadingIssue === issue.id || chatMutation.isPending}
                    >
                      {loadingIssue === issue.id ? (
                        <Loader2 className={`h-3.5 w-3.5 animate-spin ${issue.color}`} />
                      ) : (
                        <Icon className={`h-3.5 w-3.5 ${issue.color}`} />
                      )}
                      <span className="truncate">{issue.name}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Get help with: {issue.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

