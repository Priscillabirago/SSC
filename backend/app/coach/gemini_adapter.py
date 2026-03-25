from __future__ import annotations

import os
from typing import Any, Dict, Optional

from app.coach.context_utils import build_context_lines
from app.coach.adapter import CoachAdapter
from app.models.user import User

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - optional dependency
    genai = None  # type: ignore[assignment]


class GeminiCoachAdapter(CoachAdapter):
    # Regex pattern to extract JSON from model responses
    JSON_EXTRACTION_PATTERN = r'\{.*\}'
    
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if genai and self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-1.5-flash")
        else:
            self.model = None

    def _fallback(self, headline: str, details: list[str]) -> Dict[str, Any]:
        return {
            "reply": f"{headline}\n" + "\n".join(f"- {item}" for item in details),
            "plan_adjusted": False,
        }
    
    def _determine_task_type_instruction(self, is_academic: bool, task_title: str, task_description: str) -> str:
        """Determine the task type instruction based on task characteristics."""
        if is_academic:
            return "This is an ACADEMIC/STUDY task. Provide research-backed study strategies (active recall, spaced repetition, Pomodoro, etc.)."
        
        task_lower = (task_title + " " + (task_description or "")).lower()
        complex_keywords = ["write", "essay", "paper", "report", "presentation", "prepare", "review", "read", "analyze", "research"]
        simple_keywords = ["melt", "cook", "buy", "pick", "simple", "quick"]
        
        if any(word in task_lower for word in complex_keywords):
            return "This is a GENERAL but COMPLEX task. Provide productivity tips for execution, time management, or workflow (not study strategies)."
        elif any(word in task_lower for word in simple_keywords):
            return "This appears to be a SIMPLE task. Only provide tips if genuinely helpful, otherwise return empty tips."
        else:
            return "This is a GENERAL task. Provide productivity tips if relevant, otherwise minimal tips."
    
    def _build_preparation_prompt(
        self, task_title: str, task_description: str, task_notes: str, subject_name: str, 
        subject_difficulty: str, duration_minutes: int, time_of_day: str,
        deadline_proximity: str, priority: str, subtasks: list, is_academic: bool,
        task_type_instruction: str
    ) -> str:
        """Build the prompt for session preparation."""
        description_line = f"Description: {task_description}" if task_description else ""
        notes_line = f"Notes: {task_notes}" if task_notes else ""
        subject_line = f"Subject: {subject_name} ({subject_difficulty} difficulty)" if subject_name else ""
        deadline_line = f"Deadline: {deadline_proximity}" if deadline_proximity else ""
        subtasks_line = f"Subtasks: {', '.join([st.get('title', '') for st in subtasks[:5]])}" if subtasks else ""
        
        requirement_1 = "For academic: Base tips on proven cognitive science methods (active recall, spaced repetition, interleaving, Pomodoro, etc.)" if is_academic else "For general: Provide practical productivity, execution, or workflow tips if relevant"
        requirement_4 = "Recommend ONE primary study strategy" if is_academic else "Recommend a productivity approach if applicable"
        requirement_6 = "If task is too simple, return empty tips and explain why" if not is_academic else ""
        
        return f"""Provide 3-5 actionable tips for this session. {task_type_instruction}

Task: {task_title}
{description_line}
{notes_line}
{subject_line}
Duration: {duration_minutes} minutes
Time: {time_of_day}
{deadline_line}
Priority: {priority}
{subtasks_line}

Requirements:
1. {requirement_1}
2. Be specific and actionable (not generic)
3. Consider the task type, duration, and context
4. {requirement_4}
5. Keep tips concise (one sentence each)
6. {requirement_6}
7. Format response as JSON: {{"tips": ["tip1", "tip2", ...], "strategy": "strategy name", "rationale": "why this works"}}"""
    
    def _parse_preparation_response(self, reply: str) -> Optional[Dict[str, Any]]:
        """Parse the JSON response from the model, returning None if parsing fails."""
        try:
            import json
            import re
            json_match = re.search(self.JSON_EXTRACTION_PATTERN, reply, re.DOTALL)
            if json_match:
                result_data = json.loads(json_match.group(0))
                return {
                    "tips": result_data.get("tips", []),
                    "strategy": result_data.get("strategy", "Active Recall"),
                    "rationale": result_data.get("rationale", "Evidence-based study methods improve retention and efficiency.")
                }
        except (json.JSONDecodeError, KeyError, AttributeError):
            pass
        return None

    def _format_study_windows(self, preferred_study_windows: list) -> list[str]:
        """Format study windows from various formats into string representations."""
        window_strings = []
        for window in preferred_study_windows:
            if isinstance(window, str):
                # Old format: just the preset name
                window_strings.append(window)
            elif isinstance(window, dict):
                # New format: {"type": "preset", "value": "morning"} or {"type": "custom", "value": {"start": "13:00", "end": "17:00"}}
                window_type = window.get("type")
                value = window.get("value")
                if window_type == "preset" and isinstance(value, str):
                    window_strings.append(value)
                elif window_type == "custom" and isinstance(value, dict):
                    start = value.get("start", "")
                    end = value.get("end", "")
                    window_strings.append(f"{start}-{end}")
        return window_strings

    def _prepare_prompt(self, user: User, request: str, context: dict[str, Any]) -> str:
        preamble = (
            "You are Smart Study Companion, a proactive, science-driven academic coach and mentor.\n"
            "Base ALL advice and plans on proven methods from cognitive science and educational psychology: spaced repetition, active recall, interleaving, Pomodoro, self-testing, regular reflection, minimizing multitasking, and evidence-based time management.\n"
            "Whenever you recommend something, explain briefly why it's effective (cite the method, e.g., 'retrieval practice improves retention per learning science').\n"
            "Always tailor recommendations to the user's deadlines, priorities, current tasks, study sessions, and energy. \n"
            "If falling behind, be candid, and assign focused, high-impact tasks.\n"
            "\nCRITICAL: Distinguish between completed SESSIONS and completed TASKS:\n"
            "- A 'completed session' means the user worked on a task during a scheduled study session. This does NOT mean the task itself is finished.\n"
            "- A 'completed task' (shown in 'Completed today') means the task is marked as fully done/finished.\n"
            "- NEVER claim a task is completed unless it appears in 'Completed today'. Only mention that work was done on it via completed sessions.\n"
            "- When mentioning progress, say 'You completed X sessions for [task]' NOT 'You completed [task]' unless the task is in 'Completed today'.\n"
            "\nFORMATTING RULES - CRITICAL:\n"
            "- Write in plain, natural language. NO markdown formatting (no ### headers, no **bold**, no *italics*, no bullet points with dashes or asterisks).\n"
            "- Write conversationally, as if speaking directly to the user. Use simple paragraphs and natural flow.\n"
            "- If you need to organize information, use natural transitions like 'Here's what's working well' or 'A few things to consider' instead of headers.\n"
            "- Never use markdown syntax. Just write naturally.\n"
            "\nYou are permitted to proactively propose changes to the user's schedule or task list when asked for a plan or specific advice.\n"
            "If you propose a concrete action (add/edit/delete a session or task), append a block in this format after your reply: <<memory:{\"type\":\"schedule_change\"|\"task_update\",\"action\":\"add\"|\"edit\"|\"delete\",\"details\":{...}}>>. \n"
            "IMPORTANT: The <<memory:...>> blocks are for internal processing only. They will be automatically removed before the user sees your response.\n"
            "Always finish with a short coaching check-in or metacognitive question.\n"
            "\nRemember: Write naturally and conversationally. No markdown, no formatting symbols, just clear, friendly communication.\n"
        )
        summary = []
        summary.append(f"Timezone: {user.timezone}")
        summary.append(f"Weekly goal: {user.weekly_study_hours}h")
        if user.preferred_study_windows:
            window_strings = self._format_study_windows(user.preferred_study_windows)
            if window_strings:
                summary.append(
                    "Preferred windows: " + ", ".join(window_strings)
                )
        summary.extend(build_context_lines(context))
        prompt_context = "Context:\n" + "\n".join(summary)
        return preamble + prompt_context + "\n\nRequest:\n" + request

    def chat(self, user: User, message: str, context: dict[str, Any]) -> Dict[str, Any]:
        if not self.model:
            return self._fallback(
                "Try this now:",
                [
                    "Pick one priority task chunk.",
                    "Work in a focused 25-minute sprint.",
                    "Note blockers for tomorrow's coach check-in.",
                ],
            )
        result = self.model.generate_content(self._prepare_prompt(user, message, context))
        return {"reply": result.text, "plan_adjusted": False}

    def suggest_plan(self, user: User, context: dict[str, Any]) -> Dict[str, Any]:
        if not self.model:
            return self._fallback(
                "Plan updates:",
                [
                    "Shift heavy work toward your high-energy window.",
                    "Reserve last slot for spaced repetition.",
                ],
            )
        prompt = (
            "Give the student a quick plan check-up — 2-3 bullet-point adjustments they can act on right now.\n\n"
            "This is a quick-glance suggestion card, NOT a conversation. Be concise.\n\n"
            "For each adjustment:\n"
            "- Name a specific task or session (e.g., 'Your CS130 assignment due Thursday')\n"
            "- Say exactly what to change (e.g., 'Move it from Friday 8 PM to Wednesday 2 PM')\n"
            "- Say why in under 10 words (e.g., 'only 1 day buffer before deadline')\n\n"
            "DO NOT give general study advice, motivational pep talks, or tips about habits.\n"
            "DO NOT repeat what Workload Warnings already flag (overloaded days, deadline risks).\n"
            "Focus on sequencing and timing adjustments the student can make right now.\n\n"
            "Write in plain language, no markdown. Each suggestion should be 1-2 sentences max."
        )
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        return {"reply": result.text, "plan_adjusted": True}

    def reflect_day(
        self, user: User, worked: str, challenging: str, context: dict[str, Any]
    ) -> Dict[str, Any]:
        if not self.model:
            return {
                "summary": "Wins: kept momentum on priority task. Blocker: evening fatigue. Tip: start earlier tomorrow.",
                "suggestion": "Book a lighter review block before dinner.",
            }
        prompt = (
            "Summarize the day in three lines (wins, blockers, suggestion) "
            f"given wins: {worked}, blockers: {challenging}.\n"
            "Then provide ONE specific, actionable suggestion for tomorrow based on what worked and what was challenging today."
        )
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        reply = result.text
        lines = [line.strip() for line in reply.strip().splitlines() if line.strip()]
        if len(lines) >= 2:
            summary = "\n".join(lines[:-1])
            suggestion = lines[-1]
        elif len(lines) == 1:
            summary = lines[0]
            suggestion = "Plan your first task tonight so you can start fresh tomorrow."
        else:
            summary = reply.strip()
            suggestion = "Plan your first task tonight so you can start fresh tomorrow."
        return {"summary": summary, "suggestion": suggestion}

    def micro_plan(
        self, user: User, minutes: int, context: dict[str, Any]
    ) -> Dict[str, Any]:
        if not self.model:
            return self._fallback(
                "Micro sprint:",
                [
                    f"{minutes - 10} min focus block on urgent task.",
                    "Final 10 min: document progress and prep next step.",
                ],
            )
        prompt = (
            f"The student has {minutes} minutes available right now. "
            "Based on their current tasks, energy level, and priorities, give a brief motivational rationale "
            "for how to best use this time.\n\n"
            "- Name the specific task(s) they should focus on and why\n"
            "- Suggest one concrete technique (e.g., active recall, Pomodoro, outline-first)\n"
            "- Keep it to 3-4 sentences, plain language, no markdown"
        )
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        return {"reply": result.text, "plan_adjusted": False}
    
    def prepare_session(
        self, user: User, session_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Provide research-backed preparation suggestions for a study session."""
        task_title = session_context.get("task_title", "this task")
        task_description = session_context.get("task_description", "")
        task_notes = session_context.get("task_notes", "")
        subtasks = session_context.get("subtasks", [])
        subject_name = session_context.get("subject_name", "")
        subject_difficulty = session_context.get("subject_difficulty", "")
        duration_minutes = session_context.get("duration_minutes", 60)
        time_of_day = session_context.get("time_of_day", "")
        deadline_proximity = session_context.get("deadline_proximity", "")
        priority = session_context.get("priority", "medium")
        is_academic = session_context.get("is_academic", False)
        
        task_type_instruction = self._determine_task_type_instruction(is_academic, task_title, task_description)
        prompt = self._build_preparation_prompt(
            task_title, task_description, task_notes, subject_name, subject_difficulty,
            duration_minutes, time_of_day, deadline_proximity, priority,
            subtasks, is_academic, task_type_instruction
        )

        if not self.model:
            return {
                "tips": [
                    "Start with active recall: quiz yourself on key concepts",
                    f"Use Pomodoro: {min(25, duration_minutes // 2)}-min focused blocks",
                    "Take a 5-min break at the midpoint"
                ],
                "strategy": "Active Recall + Pomodoro",
                "rationale": "Active recall improves retention significantly. Pomodoro maintains focus during longer sessions."
            }
        
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        reply = result.text
        
        parsed_result = self._parse_preparation_response(reply)
        if parsed_result:
            return parsed_result
        
        # Fallback if JSON parsing fails
        tips = [line.strip("-• ") for line in reply.splitlines() if line.strip() and not line.strip().startswith("{")]
        return {
            "tips": tips[:5] if tips else ["Focus on active recall", "Take strategic breaks", "Review key concepts"],
            "strategy": "Active Recall",
            "rationale": "Active recall is one of the most effective study methods according to cognitive science."
        }
    
    def generate_dashboard_insights(
        self, user: User, analytics_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate personalized insights, feedback, and recommendations for the dashboard."""
        adherence = analytics_context.get("adherence_rate", 0.0)
        prev_adherence = analytics_context.get("previous_adherence", 0.0)
        adherence_change = analytics_context.get("adherence_change", 0.0)
        streak = analytics_context.get("streak", 0)
        subject_time = analytics_context.get("subject_time_distribution", {})
        total_tasks = analytics_context.get("total_tasks", 0)
        completed_tasks = analytics_context.get("completed_tasks", 0)
        upcoming_count = analytics_context.get("upcoming_tasks_count", 0)
        weekly_hours = analytics_context.get("user_weekly_hours", 10)
        
        prompt = f"""You are analyzing a student's dashboard to surface trends and patterns they might miss on their own.

Student Data:
- Weekly study goal: {weekly_hours} hours
- Adherence: {adherence:.0%} (previous: {prev_adherence:.0%}, change: {adherence_change:+.0%})
- Focus streak: {streak} days
- Tasks: {completed_tasks}/{total_tasks} completed, {upcoming_count} upcoming
- Time by subject: {', '.join([f"{subj}: {mins//60}h {mins%60}m" for subj, mins in list(subject_time.items())[:5]]) if subject_time else "No data yet"}

YOUR SCOPE — focus on multi-day trends, habit patterns, and subject balance:
- Which subjects are getting too much or too little time relative to each other?
- Is their streak building or did it recently break? What does that signal?
- Is adherence trending up, down, or flat? What's driving the change?
- Are upcoming tasks front-loaded or spread out?

DO NOT cover these (other features handle them):
- Do NOT summarize today's sessions or give a daily recap (the Daily Summary does that)
- Do NOT give a weekly total or week-by-week comparison (the Weekly Recap does that)
- Do NOT flag overloaded days or deadline risks (Workload Warnings does that)

Give 2-4 insights. Each must reference a specific number, subject, or pattern from the data above.

Insight types:
- "celebration": A genuine win backed by data (e.g., "Your CS130 time doubled this week — that consistency is paying off")
- "warning": Something that needs attention (e.g., "General tasks are eating 60% of your time while Math gets 10%")
- "recommendation": One concrete action (e.g., "Swap one General session for Math tomorrow to rebalance")
- "observation": A pattern (e.g., "Your adherence jumps 20% on weeks you study before noon")

Return JSON:
{{
  "insights": [
    {{"type": "celebration|warning|recommendation|observation", "title": "Short title", "message": "Specific message with data", "action": "One concrete step or null"}},
    ...
  ],
  "motivational_message": "One personal, encouraging sentence that references their actual data",
  "overall_tone": "positive|neutral|needs_attention"
}}"""

        if not self.model:
            return self._fallback_dashboard_insights(adherence, streak, adherence_change)
        
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        reply = result.text
        
        try:
            import json
            import re
            json_match = re.search(self.JSON_EXTRACTION_PATTERN, reply, re.DOTALL)
            if json_match:
                result_data = json.loads(json_match.group(0))
                insights = result_data.get("insights", [])
                for insight in insights:
                    if "type" not in insight:
                        insight["type"] = "observation"
                    if "action" not in insight:
                        insight["action"] = None
                return {
                    "insights": insights,
                    "motivational_message": result_data.get("motivational_message", "Keep up the great work!"),
                    "overall_tone": result_data.get("overall_tone", "positive")
                }
        except (json.JSONDecodeError, KeyError, AttributeError):
            pass
        
        return self._fallback_dashboard_insights(adherence, streak, adherence_change)
    
    def _fallback_dashboard_insights(self, adherence: float, streak: int, change: float) -> Dict[str, Any]:
        """Fallback insights when AI is unavailable."""
        insights = []
        if adherence >= 0.8:
            insights.append({
                "type": "celebration",
                "title": "Excellent adherence!",
                "message": f"You're completing {adherence:.0%} of your scheduled sessions. Keep this momentum going!",
                "action": None
            })
        elif adherence < 0.5:
            insights.append({
                "type": "warning",
                "title": "Adherence needs attention",
                "message": f"Your completion rate is {adherence:.0%}. Consider shorter sessions or adjusting your schedule.",
                "action": "Review your schedule and identify what's blocking you"
            })
        
        if streak >= 7:
            insights.append({
                "type": "celebration",
                "title": "Impressive streak!",
                "message": f"{streak} days of focused work. You're building great habits!",
                "action": None
            })
        
        if change < -0.1:
            insights.append({
                "type": "warning",
                "title": "Recent dip",
                "message": "Your completion rate has dropped. Let's get back on track!",
                "action": "Try breaking tasks into smaller chunks"
            })
        
        return {
            "insights": insights if insights else [{
                "type": "recommendation",
                "title": "Keep going!",
                "message": "Track your progress and celebrate small wins.",
                "action": "Set a daily goal for completed sessions"
            }],
            "motivational_message": "Every session counts. You've got this!",
            "overall_tone": "positive" if adherence >= 0.7 else "neutral"
        }
    
    def _format_historical_patterns(self, patterns: dict[str, Any]) -> str:
        """Format historical patterns for AI prompt."""
        if not patterns or patterns.get("patterns") == "No historical data available yet":
            return ""
        
        lines = []
        if patterns.get("day_patterns"):
            lines.append("Day-of-week completion rates:")
            for day, data in patterns["day_patterns"].items():
                rate = data.get("completion_rate", 0)
                count = data.get("total_sessions", 0)
                lines.append(f"  - {day}: {rate:.0%} ({count} sessions)")
        
        if patterns.get("most_productive_hour") is not None:
            lines.append(f"Most productive time: {patterns['most_productive_hour']}:00")
        
        if patterns.get("average_completed_duration_minutes"):
            lines.append(f"Average completed session: {int(patterns['average_completed_duration_minutes'])} minutes")
        
        return "\n".join(lines) if lines else ""
    
    def optimize_schedule(
        self, user: User, schedule_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Review and optimize a generated schedule for better real-world efficiency."""
        import json
        
        schedule_summary = schedule_context.get("schedule_summary", "")
        tasks_summary = schedule_context.get("tasks_summary", "")
        constraints_summary = schedule_context.get("constraints_summary", "")
        
        prompt = f"""Review this study schedule and suggest optimizations the student wouldn't think of themselves.

Current Schedule:
{schedule_summary}

Tasks Overview:
{tasks_summary}

Constraints:
{constraints_summary}

Preferences:
- Weekly goal: {user.weekly_study_hours}h | Max session: {user.max_session_length}min | Break: {user.break_duration}min
- Study windows: {', '.join([str(w) for w in (user.preferred_study_windows or [])])}

Historical Patterns:
{self._format_historical_patterns(schedule_context.get("historical_patterns", {})) or "No historical data yet"}

IMPORTANT — The student already sees Workload Warnings that flag these issues:
- Overloaded days, unscheduled tasks, deadline risks, burnout risk, deadline clusters
DO NOT repeat any of those. They are already handled.

YOUR SCOPE — focus on things the warnings DON'T cover:
1. Session ordering: Is a hard subject scheduled right after another hard one? Should lighter work come first as a warm-up?
2. Circadian matching: Using historical patterns, are difficult tasks at the wrong time of day for this student?
3. Transitions: Are there back-to-back sessions with no break? Suggest specific buffer times.
4. Subject interleaving: Is the same subject crammed into one day? Spacing it across days improves retention.
5. Pacing within a day: 3 intense sessions in a row will cause fatigue — suggest alternating heavy and light.

For each optimization, name the specific session(s), day, and time. No vague advice.

Return JSON:
{{
  "optimizations": [
    {{
      "type": "session_order|circadian_match|buffer_time|pacing|interleaving",
      "day": "Monday" | null,
      "description": "Specific observation with names and times (e.g., 'Tuesday has CS130 at 9 AM followed by Math at 9:30 AM — both are high-difficulty. Insert a 10-min break or swap Math to the afternoon slot.')",
      "sessions_to_adjust": [0, 1],
      "suggested_changes": {{
        "move_to_day": "Tuesday",
        "move_to_time": "14:00",
        "add_buffer_before": true,
        "split_into_sessions": [30, 30]
      }}
    }}
  ],
  "explanation": "2-3 sentences summarizing the key improvements. Reference specific sessions, times, and subjects. Example: 'Your Wednesday has CS130, Math, and Physics back-to-back from 9-12 with no breaks — that is 3 hours of hard subjects in a row. Adding a 10-min buffer after CS130 and swapping Physics to Thursday afternoon would improve focus and retention.'",
  "overall_impact": "positive|neutral|needs_attention"
}}

If the schedule already has good pacing and variety, say so with specifics (e.g., "Sessions are well-spaced with 15-min gaps and subjects alternate between heavy and light")."""

        if not self.model:
            return {
                "optimizations": [],
                "explanation": "Schedule looks good! The algorithm has created a balanced plan.",
                "overall_impact": "positive"
            }
        
        try:
            full_prompt = self._prepare_prompt(user, prompt, context)
            result = self.model.generate_content(full_prompt)
            reply = result.text
            
            # Try to extract JSON from response
            json_start = reply.find("{")
            json_end = reply.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = reply[json_start:json_end]
                parsed = json.loads(json_str)
                return {
                    "optimizations": parsed.get("optimizations", []),
                    "explanation": parsed.get("explanation", "Schedule optimized for better real-world efficiency."),
                    "overall_impact": parsed.get("overall_impact", "positive")
                }
        except (json.JSONDecodeError, KeyError):
            pass
        
        # Fallback: return no optimizations if parsing fails
        return {
            "optimizations": [],
            "explanation": "Schedule review completed. The current schedule is well-structured.",
            "overall_impact": "positive"
        }
    
    def generate_daily_summary(
        self, user: User, daily_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate automatic end-of-day summary and feedback based on the day's activity."""
        completed_sessions = daily_context.get("completed_sessions", [])
        completed_tasks = daily_context.get("completed_tasks", [])
        total_minutes = daily_context.get("total_minutes", 0)
        energy_level = daily_context.get("energy_level", "medium")
        tasks_tomorrow = daily_context.get("tasks_tomorrow", [])
        
        sessions_count = len(completed_sessions)
        tasks_count = len(completed_tasks)
        hours = total_minutes / 60
        
        prompt = f"""Write a quick end-of-day recap for a student. Focus ONLY on what happened today — no weekly totals, no adherence percentages, no streak mentions.

Today's Activity:
- Completed {sessions_count} study session(s) totaling {hours:.1f} hours
- Finished {tasks_count} task(s)
- Energy level: {energy_level}
- Tomorrow: {len(tasks_tomorrow)} task(s) due

YOUR SCOPE — today only:
1. What did they accomplish today? Name specific sessions or tasks if possible.
2. How did their energy level affect what they got done?
3. Give ONE specific, practical tip for tomorrow that connects to today's results.
   Good: "You finished 3 sessions before noon — try front-loading tomorrow too since you have {len(tasks_tomorrow)} tasks due."
   Bad: "Keep up the good work!" (too generic)
   Bad: "Your weekly adherence is 80%." (wrong scope — that's for Dashboard Insights)

Keep the summary to 2-3 sentences and the tip to 1 sentence. Be warm but specific.

Return JSON:
{{
  "summary": "What happened today in 2-3 specific sentences",
  "tomorrow_tip": "One concrete tip for tomorrow that references today's data",
  "tone": "positive|neutral|encouraging"
}}"""

        if not self.model:
            return {
                "summary": f"You completed {sessions_count} session(s) today totaling {hours:.1f} hours. {'Great work staying consistent!' if sessions_count > 0 else 'Consider scheduling some study time tomorrow.'}",
                "tomorrow_tip": f"You have {len(tasks_tomorrow)} task(s) coming up - start with the most urgent one tomorrow morning when your energy is highest.",
                "tone": "positive" if sessions_count > 0 else "encouraging"
            }
        
        try:
            import json
            import re
            full_prompt = self._prepare_prompt(user, prompt, context)
            result = self.model.generate_content(full_prompt)
            reply = result.text
            
            # Extract JSON from response
            json_match = re.search(self.JSON_EXTRACTION_PATTERN, reply, re.DOTALL)
            if json_match:
                result_data = json.loads(json_match.group(0))
                return {
                    "summary": result_data.get("summary", f"You completed {sessions_count} session(s) today totaling {hours:.1f} hours."),
                    "tomorrow_tip": result_data.get("tomorrow_tip", f"You have {len(tasks_tomorrow)} task(s) coming up - start with the most urgent one tomorrow morning."),
                    "tone": result_data.get("tone", "positive" if sessions_count > 0 else "encouraging")
                }
        except (json.JSONDecodeError, KeyError, AttributeError):
            pass
        
        # Fallback if parsing fails
        return {
            "summary": f"You completed {sessions_count} session(s) today totaling {hours:.1f} hours. {'Great work staying consistent!' if sessions_count > 0 else 'Consider scheduling some study time tomorrow.'}",
            "tomorrow_tip": f"You have {len(tasks_tomorrow)} task(s) coming up - start with the most urgent one tomorrow morning when your energy is highest.",
            "tone": "positive" if sessions_count > 0 else "encouraging"
        }
    
    def get_session_encouragement(
        self, user: User, session_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate encouraging, motivational messages during a focus session."""
        elapsed_minutes = session_context.get("elapsed_minutes", 0)
        remaining_minutes = session_context.get("remaining_minutes", 0)
        progress_percent = session_context.get("progress_percent", 0)
        task_title = session_context.get("task_title", "your work")
        is_paused = session_context.get("is_paused", False)
        pomodoro_count = session_context.get("pomodoro_count", 0)
        
        milestone = None
        if progress_percent >= 75:
            milestone = "almost_done"
        elif progress_percent >= 50:
            milestone = "halfway"
        elif progress_percent >= 25:
            milestone = "quarter"
        elif elapsed_minutes > 0:
            milestone = "started"
        
        prompt = f"""Generate a brief, encouraging message for a student during a focus session. Be warm, specific, and motivating.

Session Context:
- Task: {task_title}
- Elapsed: {elapsed_minutes} minutes
- Remaining: {remaining_minutes} minutes
- Progress: {progress_percent}%
- Status: {"Paused" if is_paused else "Active"}
- Pomodoro: {pomodoro_count}/4 (if applicable)

Milestone: {milestone}

Return JSON format:
{{
  "message": "Brief encouraging message (1-2 sentences)",
  "tone": "motivational|celebratory|supportive"
}}"""

        if not self.model:
            if milestone == "almost_done":
                return {"message": f"You're almost there! Just {remaining_minutes} minutes left. You've got this!", "tone": "motivational"}
            elif milestone == "halfway":
                return {"message": "You're halfway through! Keep that momentum going.", "tone": "supportive"}
            elif milestone == "quarter":
                return {"message": "Great start! You're making solid progress.", "tone": "motivational"}
            else:
                return {"message": "Stay focused! Every minute counts toward your goal.", "tone": "supportive"}

        try:
            result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
            reply = result.text
            import json
            import re
            json_match = re.search(self.JSON_EXTRACTION_PATTERN, reply, re.DOTALL)
            if json_match:
                reply_dict = json.loads(json_match.group())
                return {
                    "message": reply_dict.get("message", "Keep going! You're doing great."),
                    "tone": reply_dict.get("tone", "motivational")
                }
        except Exception:
            pass

        return {"message": "Stay focused! You're making progress.", "tone": "supportive"}

    def generate_weekly_recap(
        self, user: User, weekly_context: dict[str, Any], context: dict[str, Any]
    ) -> dict[str, Any]:
        """Generate a personalized weekly recap with specific, actionable feedback."""
        from app.coach.openai_adapter import _generate_weekly_recap_impl
        return _generate_weekly_recap_impl(self, user, weekly_context, context)

