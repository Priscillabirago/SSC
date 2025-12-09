"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  useCoachChatHistory,
  usePostCoachChatMessage,
  useCoachChat,
  useDeleteAllCoachChatHistory,
} from "@/features/coach/hooks";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { parseBackendDateTime } from "@/lib/utils";

interface CoachMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function CoachChat() {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history, isLoading: historyLoading } = useCoachChatHistory();
  const chatMutation = useCoachChat();
  const postMessageMutation = usePostCoachChatMessage();
  const deleteAllMutation = useDeleteAllCoachChatHistory();

  // Auto-scroll to bottom when new messages arrive or when sending
  useEffect(() => {
    if (history && history.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [history, isSending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    const messageText = message.trim();
    setMessage("");

    // Save user message to history
    try {
      await postMessageMutation.mutateAsync({
        role: "user",
        content: messageText,
      });
    } catch (error) {
      console.error("Failed to save user message:", error);
    }

    // Send to coach and get response
    setIsSending(true);
    try {
      const response = await chatMutation.mutateAsync(messageText);
      
      // Save assistant response to history
      await postMessageMutation.mutateAsync({
        role: "assistant",
        content: response.reply,
      });

      // Invalidate history to refresh
      queryClient.invalidateQueries({ queryKey: ["coach", "history"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to get response",
        description: error?.response?.data?.detail || "An error occurred",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all chat history?")) return;

    try {
      await deleteAllMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ["coach", "history"] });
      toast({
        title: "Chat history cleared",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to clear history",
        description: error?.response?.data?.detail || "An error occurred",
      });
    }
  };

  const messages: CoachMessage[] = history || [];

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-primary" />
            Chat with Coach
          </CardTitle>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              disabled={deleteAllMutation.isPending}
              className="h-7 text-xs"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 py-4">
            {(() => {
              if (historyLoading) {
                return (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full ml-auto w-3/4" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                );
              }
              if (messages.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium text-foreground mb-1">
                      Start a conversation
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Ask me anything about your studies, get help with strategies, or discuss your progress.
                    </p>
                  </div>
                );
              }
              return messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                    {msg.created_at && (
                      <p
                        className={
                          msg.role === "user"
                            ? "text-xs mt-1 text-primary-foreground/70"
                            : "text-xs mt-1 text-muted-foreground"
                        }
                      >
                        {format(parseBackendDateTime(msg.created_at), "h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
              ));
            })()}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <form onSubmit={handleSend} className="flex-shrink-0 p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask me anything..."
              disabled={isSending}
              className="flex-1"
            />
            <Button type="submit" disabled={!message.trim() || isSending}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

