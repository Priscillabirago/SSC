import { getCoachChatHistory, postCoachChatMessage, coachChat, coachMicroPlan, coachReflect, coachSuggestPlan, coachApplyProposal, deleteCoachChatMessage, deleteAllCoachChatHistory } from "./api";
import { useQuery, useMutation } from "@tanstack/react-query";

export function useCoachChat() {
  return useMutation({
    mutationFn: (message: string) => coachChat(message)
  });
}

export function useCoachPlanSuggestion() {
  return useMutation({
    mutationFn: coachSuggestPlan
  });
}

export function useCoachReflection() {
  return useMutation({
    mutationFn: coachReflect
  });
}

export function useCoachMicroPlan() {
  return useMutation({
    mutationFn: (minutes: number) => coachMicroPlan(minutes)
  });
}

export function useCoachApplyProposal() {
  return useMutation({
    mutationFn: coachApplyProposal
  });
}

export function useCoachChatHistory() {
  return useQuery({
    queryKey: ["coach", "history"],
    queryFn: getCoachChatHistory,
  });
}

export function usePostCoachChatMessage() {
  return useMutation({
    mutationFn: postCoachChatMessage,
  });
}

export function useDeleteCoachChatMessage() {
  return useMutation({
    mutationFn: deleteCoachChatMessage,
  });
}

export function useDeleteAllCoachChatHistory() {
  return useMutation({
    mutationFn: deleteAllCoachChatHistory,
  });
}

