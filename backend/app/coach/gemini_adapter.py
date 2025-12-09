from __future__ import annotations

import os
from typing import Any, Dict

from app.coach.context_utils import build_context_lines
from app.coach.adapter import CoachAdapter
from app.models.user import User

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - optional dependency
    genai = None  # type: ignore[assignment]


class GeminiCoachAdapter(CoachAdapter):
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
            # Handle both old format (list of strings) and new format (list of dicts)
            window_strings = []
            for window in user.preferred_study_windows:
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
        prompt = "Audit the plan and propose two concise adjustments."
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
            f"given wins: {worked}, blockers: {challenging}."
        )
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        return {"summary": result.text, "suggestion": "Reflect tomorrow morning before working."}

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
        prompt = f"Design a {minutes}-minute focused plan using current energy levels."
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        return {"reply": result.text, "plan_adjusted": False}
    
    def prepare_session(
        self, user: User, session_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Provide research-backed preparation suggestions for a study session."""
        task_title = session_context.get("task_title", "this task")
        task_description = session_context.get("task_description", "")
        subtasks = session_context.get("subtasks", [])
        subject_name = session_context.get("subject_name", "")
        subject_difficulty = session_context.get("subject_difficulty", "")
        duration_minutes = session_context.get("duration_minutes", 60)
        time_of_day = session_context.get("time_of_day", "")
        deadline_proximity = session_context.get("deadline_proximity", "")
        priority = session_context.get("priority", "medium")
        is_academic = session_context.get("is_academic", False)
        
        # Determine task type for appropriate tips
        task_type_instruction = ""
        if is_academic:
            task_type_instruction = "This is an ACADEMIC/STUDY task. Provide research-backed study strategies (active recall, spaced repetition, Pomodoro, etc.)."
        else:
            task_lower = (task_title + " " + (task_description or "")).lower()
            if any(word in task_lower for word in ["write", "essay", "paper", "report", "presentation", "prepare", "review", "read", "analyze", "research"]):
                task_type_instruction = "This is a GENERAL but COMPLEX task. Provide productivity tips for execution, time management, or workflow (not study strategies)."
            elif any(word in task_lower for word in ["melt", "cook", "buy", "pick", "simple", "quick"]):
                task_type_instruction = "This appears to be a SIMPLE task. Only provide tips if genuinely helpful, otherwise return empty tips."
            else:
                task_type_instruction = "This is a GENERAL task. Provide productivity tips if relevant, otherwise minimal tips."
        
        prompt = f"""Provide 3-5 actionable tips for this session. {task_type_instruction}

Task: {task_title}
{f"Description: {task_description}" if task_description else ""}
{f"Subject: {subject_name} ({subject_difficulty} difficulty)" if subject_name else ""}
Duration: {duration_minutes} minutes
Time: {time_of_day}
{f"Deadline: {deadline_proximity}" if deadline_proximity else ""}
Priority: {priority}
{f"Subtasks: {', '.join([st.get('title', '') for st in subtasks[:5]])}" if subtasks else ""}

Requirements:
1. {"For academic: Base tips on proven cognitive science methods (active recall, spaced repetition, interleaving, Pomodoro, etc.)" if is_academic else "For general: Provide practical productivity, execution, or workflow tips if relevant"}
2. Be specific and actionable (not generic)
3. Consider the task type, duration, and context
4. {"Recommend ONE primary study strategy" if is_academic else "Recommend a productivity approach if applicable"}
5. Keep tips concise (one sentence each)
6. {"If task is too simple, return empty tips and explain why" if not is_academic else ""}
7. Format response as JSON: {{"tips": ["tip1", "tip2", ...], "strategy": "strategy name", "rationale": "why this works"}}"""

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
        
        try:
            import json
            import re
            # Extract JSON from response (Gemini might add extra text)
            json_match = re.search(r'\{.*\}', reply, re.DOTALL)
            if json_match:
                result_data = json.loads(json_match.group(0))
                return {
                    "tips": result_data.get("tips", []),
                    "strategy": result_data.get("strategy", "Active Recall"),
                    "rationale": result_data.get("rationale", "Evidence-based study methods improve retention and efficiency.")
                }
        except (json.JSONDecodeError, KeyError, AttributeError):
            pass
        
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
        
        prompt = f"""You are a supportive, insightful academic coach analyzing a student's dashboard data. Provide personalized feedback, motivation, and actionable recommendations.

Student Context:
- Weekly study goal: {weekly_hours} hours
- Current adherence rate: {adherence:.0%} (vs previous: {prev_adherence:.0%}, change: {adherence_change:+.0%})
- Focus streak: {streak} days
- Tasks: {completed_tasks}/{total_tasks} completed, {upcoming_count} upcoming
- Time distribution: {', '.join([f"{subj}: {mins//60}h {mins%60}m" for subj, mins in list(subject_time.items())[:5]]) if subject_time else "No data yet"}

Your role:
1. Be a personal companion: supportive, honest, and motivational
2. Celebrate wins genuinely (don't overdo it)
3. Identify patterns and provide constructive feedback
4. Give 2-4 specific, actionable insights
5. Include one motivational message that feels personal

Insight types:
- "celebration": Genuine wins (e.g., "You've completed 5 days in a row!")
- "warning": Areas needing attention (e.g., "Your Monday completion rate is 30%")
- "recommendation": Actionable advice (e.g., "Try shorter 30-min sessions on Mondays")
- "observation": Interesting patterns (e.g., "You're most productive in the morning")

Requirements:
- Be specific and data-driven
- Use a warm, encouraging tone
- Balance critique with motivation
- Make insights actionable
- Keep each insight concise (1-2 sentences)

Return JSON format:
{{
  "insights": [
    {{"type": "celebration|warning|recommendation|observation", "title": "Short title", "message": "Detailed message", "action": "Optional actionable step"}},
    ...
  ],
  "motivational_message": "A personal, encouraging message (1-2 sentences)",
  "overall_tone": "positive|neutral|needs_attention"
}}"""

        if not self.model:
            return self._fallback_dashboard_insights(adherence, streak, adherence_change)
        
        result = self.model.generate_content(self._prepare_prompt(user, prompt, context))
        reply = result.text
        
        try:
            import json
            import re
            json_match = re.search(r'\{.*\}', reply, re.DOTALL)
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
        
        prompt = f"""Review this weekly study schedule and suggest optimizations for real-world efficiency.

Current Schedule:
{schedule_summary}

Tasks Overview:
{tasks_summary}

Constraints:
{constraints_summary}

User Preferences:
- Weekly goal: {user.weekly_study_hours} hours
- Max session length: {user.max_session_length} minutes
- Break duration: {user.break_duration} minutes
- Preferred study windows: {', '.join([str(w) for w in (user.preferred_study_windows or [])])}

Historical Patterns (learned from past behavior):
{self._format_historical_patterns(schedule_context.get("historical_patterns", {})) or "No historical data yet - will learn from your patterns over time"}

Focus on making the schedule MORE REALISTIC for everyday student life, using historical patterns to inform suggestions:
1. **Workload Balancing**: Ensure study hours are distributed evenly across days (avoid overloaded days)
2. **Circadian Matching**: Match difficult tasks to high-energy times (morning for most people)
3. **Buffer Time**: Suggest adding 5-10 minute buffers between sessions for transitions
4. **Realistic Pacing**: Avoid back-to-back intense sessions; mix light and heavy work
5. **Deadline Pressure**: Prioritize urgent tasks but don't create burnout days
6. **Subject Variety**: Ensure good interleaving to prevent monotony

Return a JSON object with:
{{
  "optimizations": [
    {{
      "type": "workload_balance" | "circadian_match" | "buffer_time" | "pacing" | "deadline" | "variety",
      "day": "Monday" | "Tuesday" | ... | null (if applies to multiple days),
      "description": "Specific, actionable explanation with concrete examples (e.g., 'Monday has 6.5 hours while Tuesday has 1.5 hours - this creates burnout risk')",
      "sessions_to_adjust": [session_index1, session_index2, ...] (optional, 0-indexed),
      "suggested_changes": {{
        "move_to_day": "Tuesday" (optional),
        "move_to_time": "14:00" (optional, HH:MM format),
        "add_buffer_before": true (optional),
        "split_into_sessions": [duration1, duration2] (optional, in minutes)
      }}
    }}
  ],
  "explanation": "Detailed, specific explanation (2-4 sentences) that includes: 1) Concrete metrics (e.g., 'Monday has 6.5h vs Tuesday's 1.5h'), 2) Specific task examples (e.g., 'Math homework at 7 AM is too early'), 3) Actionable insights (e.g., 'Moving 2 hours from Monday to Tuesday would balance workload'). Be specific with numbers, task names, and times.",
  "overall_impact": "positive" | "neutral" | "needs_attention"
}}

Requirements for explanation:
- Include specific numbers (hours, session counts, time differences)
- Mention specific tasks or subjects when relevant
- Explain WHY each optimization matters for real student life
- Be actionable - tell the user what was optimized and why it helps

Be practical and realistic. Only suggest changes that genuinely improve everyday usability.
If the schedule is already well-optimized, provide a specific positive explanation with metrics (e.g., 'Your schedule is well-balanced: average 3.2h/day with only 0.8h variation')."""

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

