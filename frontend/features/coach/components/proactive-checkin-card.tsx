"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Sparkles, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useCoachChat, usePostCoachChatMessage } from "@/features/coach/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const CHECKIN_PROMPTS = [
  "How's your week going? Let's review your progress. Please look at my tasks, schedule, and completed sessions to give me personalized feedback.",
  "How are you feeling about your current workload? Please review my tasks, deadlines, and schedule to provide specific advice.",
  "What's been working well for you this week? Please consider my completed sessions, tasks, and progress when giving feedback.",
  "Any challenges you'd like help with? Please look at my current tasks, deadlines, and schedule to give me personalized guidance.",
];

const STORAGE_KEY = "ssc.lastCheckinDate";

export function ProactiveCheckinCard() {
  const [showCheckin, setShowCheckin] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const chatMutation = useCoachChat();
  const postMessageMutation = usePostCoachChatMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we should show a check-in (once per day)
    const lastCheckin = localStorage.getItem(STORAGE_KEY);
    const today = format(new Date(), "yyyy-MM-dd");
    
    // Show check-in if:
    // 1. Never shown before, OR
    // 2. Last check-in was not today, AND
    // 3. It's been at least 6 hours since last check-in (if exists)
    if (!lastCheckin || lastCheckin !== today) {
      // Randomly select a prompt
      const prompt = CHECKIN_PROMPTS[Math.floor(Math.random() * CHECKIN_PROMPTS.length)];
      setCurrentPrompt(prompt);
      setShowCheckin(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, format(new Date(), "yyyy-MM-dd"));
    setShowCheckin(false);
  };

  const handleStartCheckin = () => {
    // Save user message to history first
    postMessageMutation.mutate(
      {
        role: "user",
        content: currentPrompt,
      },
      {
        onSuccess: () => {
          // After user message is saved, send to coach
          chatMutation.mutate(currentPrompt, {
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
                    toast({
                      title: "Check-in started",
                      description: "Check the chat for your personalized feedback.",
                    });
                  },
                  onError: (error) => {
                    console.error("Failed to save assistant message:", error);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "Failed to save response. Please try again.",
                    });
                  },
                }
              );
              localStorage.setItem(STORAGE_KEY, format(new Date(), "yyyy-MM-dd"));
              setShowCheckin(false);
            },
            onError: (error: any) => {
              console.error("Failed to get coach response:", error);
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
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to start conversation. Please try again.",
          });
        },
      }
    );
  };

  if (!showCheckin) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="rounded-full bg-primary/10 p-2">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Daily Check-in</Badge>
              </div>
              <p className="text-sm font-medium text-foreground">
                {currentPrompt}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleStartCheckin}
                  disabled={chatMutation.isPending || postMessageMutation.isPending}
                  className="gap-2"
                >
                  {chatMutation.isPending || postMessageMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  Start Conversation
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-xs"
                >
                  Maybe later
                </Button>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

