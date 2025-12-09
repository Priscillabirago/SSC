"use client";

import { useState } from "react";
import { BookOpen, Lightbulb, ChevronRight, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useSubjects } from "@/features/subjects/hooks";
import { useCoachChat, usePostCoachChatMessage } from "@/features/coach/hooks";
import { useQueryClient } from "@tanstack/react-query";

const STUDY_STRATEGIES = [
  {
    id: "active-recall",
    name: "Active Recall",
    description: "Test yourself without looking at notes",
    prompt: "How can I use active recall to study more effectively? Please tailor your advice to my current tasks, subjects, and schedule.",
  },
  {
    id: "spaced-repetition",
    name: "Spaced Repetition",
    description: "Review material at increasing intervals",
    prompt: "Explain spaced repetition and how I can apply it to my current studies. Consider my tasks, deadlines, and subjects when giving specific recommendations.",
  },
  {
    id: "pomodoro",
    name: "Pomodoro Technique",
    description: "Work in focused 25-minute blocks",
    prompt: "How should I use the Pomodoro technique for my study sessions? Please suggest how to apply it to my current workload and schedule.",
  },
  {
    id: "interleaving",
    name: "Interleaving",
    description: "Mix different topics in one session",
    prompt: "What is interleaving and how can it help me learn better? Show me how to apply it to my current subjects and tasks.",
  },
  {
    id: "elaboration",
    name: "Elaboration",
    description: "Connect new info to what you know",
    prompt: "How can I use elaboration to understand concepts deeper? Give me specific examples based on my current subjects and tasks.",
  },
  {
    id: "dual-coding",
    name: "Dual Coding",
    description: "Combine words and visuals",
    prompt: "Explain dual coding and give me specific examples for my subjects. Show me how to apply it to my current tasks.",
  },
];

export function StudyStrategyCard() {
  const { data: subjects } = useSubjects();
  const chatMutation = useCoachChat();
  const postMessageMutation = usePostCoachChatMessage();
  const queryClient = useQueryClient();
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null);
  const { toast } = useToast();

  const handleStrategyClick = (strategy: typeof STUDY_STRATEGIES[0]) => {
    const prompt = strategy.prompt;
    setLoadingStrategy(strategy.id);
    
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
                    setLoadingStrategy(null);
                    toast({
                      title: "Response received",
                      description: "Check the chat for your personalized strategy advice.",
                    });
                  },
                  onError: (error) => {
                    console.error("Failed to save assistant message:", error);
                    setLoadingStrategy(null);
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
              setLoadingStrategy(null);
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
          setLoadingStrategy(null);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to start conversation. Please try again.",
          });
        },
      }
    );
  };

  const handleSubjectStrategy = (subjectName: string) => {
    const prompt = `What's the best study strategy for ${subjectName}? Please consider my current tasks, deadlines, and schedule when giving recommendations.`;
    setLoadingStrategy(`subject-${subjectName}`);
    
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
                    setLoadingStrategy(null);
                    toast({
                      title: "Response received",
                      description: "Check the chat for personalized strategy advice.",
                    });
                  },
                  onError: (error) => {
                    console.error("Failed to save assistant message:", error);
                    setLoadingStrategy(null);
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
              setLoadingStrategy(null);
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
          setLoadingStrategy(null);
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            Study Strategies
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Research-backed learning techniques. Click any strategy to learn how to apply it to your studies.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subject-specific strategies */}
        {subjects && subjects.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              For Your Subjects
            </p>
            <div className="flex flex-wrap gap-2">
              {subjects.slice(0, 3).map((subject) => (
                <Button
                  key={subject.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handleSubjectStrategy(subject.name)}
                  disabled={loadingStrategy === `subject-${subject.name}` || chatMutation.isPending}
                >
                  {loadingStrategy === `subject-${subject.name}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Lightbulb className="h-3 w-3" />
                  )}
                  {subject.name} strategy
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Research-backed strategies */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Research-Backed Techniques
          </p>
          <div className="space-y-2">
            {STUDY_STRATEGIES.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                className="group w-full rounded-lg border border-border/60 bg-white/70 p-3 hover:bg-white/90 transition-colors cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleStrategyClick(strategy)}
                disabled={loadingStrategy === strategy.id || chatMutation.isPending}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-xs font-semibold text-foreground">
                        {strategy.name}
                      </h4>
                      <Badge variant="outline" className="text-[10px] h-4">
                        Evidence-based
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {strategy.description}
                    </p>
                  </div>
                  {loadingStrategy === strategy.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

