from __future__ import annotations

import os
from typing import Any, Dict

from app.coach.context_utils import build_context_lines
from app.coach.adapter import CoachAdapter
from app.models.user import User

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional dependency
    OpenAI = None  # type: ignore[assignment]


SYSTEM_PROMPT = (
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
    "\nWhenever the user requests a change (add, edit, delete, update schedule or tasks), even INDIRECTLY, always append a <<memory:{...}>> block describing the exact proposal(s).\n"
    "Even if the user asks in conversational or indirect language, always infer their intent and take appropriate action.\n"
    "If you have more than one action to propose, include a separate <<memory:{...}>> block for each.\n"
    "IMPORTANT: The <<memory:...>> blocks are for internal processing only. They will be automatically removed before the user sees your response.\n"
    "\nExamples:\n"
    "Q: Can you help me organize a study session for Math on Wednesday?\n"
    "A: I can help you schedule a Math study session for Wednesday. Let me set that up for you.\n<<memory:{\"type\":\"schedule_change\",\"action\":\"add\",\"details\":{\"focus\":\"Math\",\"start_time\":\"2025-12-06T18:00\",\"end_time\":\"2025-12-06T19:00\"}}>>\n\n"
    "Q: I need to finish my biology homework, can you set it to complete after this session?\n"
    "A: I'll mark your biology homework as completed after this session.\n<<memory:{\"type\":\"task_update\",\"action\":\"edit\",\"details\":{\"title\":\"Biology homework\",\"is_completed\":true}}>>\n\n"
    "Q: Block out time for a Chemistry review the day after tomorrow.\n"
    "A: I'll block out time for your Chemistry review.\n<<memory:{\"type\":\"schedule_change\",\"action\":\"add\",\"details\":{\"focus\":\"Chemistry review\",\"start_time\":\"2025-12-08T14:00\",\"end_time\":\"2025-12-08T15:00\"}}>>\n\n"
    "Always append such blocks after your main reply, even for combined or casual requests.\n"
    "\nReply structure (write naturally, no markdown):\n"
    "1. Start with a brief, friendly opening that addresses the user's question or situation.\n"
    "2. If relevant, mention what's working well (completed sessions, progress made). Be accurate: mention completed sessions, not completed tasks unless explicitly in 'Completed today'.\n"
    "3. If there are obstacles or challenges, address them naturally in your response.\n"
    "4. Provide actionable, evidence-based recommendations. Explain why each suggestion is effective.\n"
    "5. If you have a proposed change, append as <<memory:{...}>> (this will be removed automatically).\n"
    "6. End with a brief, encouraging check-in question.\n"
    "\nRemember: Write naturally and conversationally. No markdown, no formatting symbols, just clear, friendly communication.\n"
)


class OpenAICoachAdapter(CoachAdapter):
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=self.api_key) if (OpenAI and self.api_key) else None

    def _fallback_response(self, headline: str, details: list[str]) -> Dict[str, Any]:
        return {
            "reply": f"{headline}\n" + "\n".join(f"- {item}" for item in details),
            "plan_adjusted": False,
        }

    def _parse_window_strings(self, preferred_windows: list) -> list[str]:
        """Parse preferred study windows into string representations."""
        window_strings = []
        for window in preferred_windows:
            if isinstance(window, str):
                window_strings.append(window)
            elif isinstance(window, dict):
                window_type = window.get("type")
                value = window.get("value")
                if window_type == "preset" and isinstance(value, str):
                    window_strings.append(value)
                elif window_type == "custom" and isinstance(value, dict):
                    start = value.get("start", "")
                    end = value.get("end", "")
                    window_strings.append(f"{start}-{end}")
        return window_strings

    def _build_messages(
        self, user: User, prompt: str, context: dict[str, Any]
    ) -> list[dict[str, str]]:
        summary_lines = [
            f"Timezone: {user.timezone}",
            f"Weekly goal: {user.weekly_study_hours}h",
        ]
        if context.get("subject_names"):
            summary_lines.append(
                "Current subjects: " + ", ".join(context["subject_names"]) + "."
            )
        if context.get("task_titles"):
            summary_lines.append(
                "Active tasks: " + ", ".join(context["task_titles"]) + "."
            )
        if user.preferred_study_windows:
            window_strings = self._parse_window_strings(user.preferred_study_windows)
            if window_strings:
                summary_lines.append(
                    "Preferred windows: " + ", ".join(window_strings)
                )
        summary_lines.extend(build_context_lines(context))
        system_context = SYSTEM_PROMPT + "\nContext:\n" + "\n".join(summary_lines)
        return [
            {"role": "system", "content": system_context},
            {"role": "user", "content": prompt},
        ]

    def chat(self, user: User, message: str, context: dict[str, Any]) -> Dict[str, Any]:
        if not self.client:
            return self._fallback_response(
                "Here is a quick plan:",
                [
                    "Prioritize one high-impact task.",
                    "Schedule a short review block.",
                    "Check in after 45 minutes.",
                ],
            )
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=self._build_messages(user, message, context),
            temperature=0.4,
        )
        reply = completion.choices[0].message.content
        return {"reply": reply, "plan_adjusted": False}

    def suggest_plan(self, user: User, context: dict[str, Any]) -> Dict[str, Any]:
        prompt = "Review the schedule and suggest one improvement for pacing and one for focus."
        messages = self._build_messages(user, prompt, context)
        if not self.client:
            return self._fallback_response(
                "Plan tweak:",
                [
                    "Move a challenging task earlier in the day.",
                    "Add a 10-minute reflection break tonight.",
                ],
            )
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
        )
        reply = completion.choices[0].message.content
        return {"reply": reply, "plan_adjusted": True}

    def reflect_day(
        self, user: User, worked: str, challenging: str, context: dict[str, Any]
    ) -> Dict[str, Any]:
        prompt = (
            "Generate a short nightly reflection summary with three bullets: wins, blockers, tip. "
            f"Wins input: {worked}\nBlockers input: {challenging}"
        )
        messages = self._build_messages(user, prompt, context)
        if not self.client:
            return {
                "summary": "Wins: stayed consistent. Blocker: low energy evening. Tip: prep materials earlier.",
                "suggestion": "Schedule review during higher energy slot tomorrow.",
            }
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.3,
        )
        reply = completion.choices[0].message.content
        return {"summary": reply, "suggestion": "Keep the next day light for the first block."}

    def micro_plan(
        self, user: User, minutes: int, context: dict[str, Any]
    ) -> Dict[str, Any]:
        prompt = f"Create a micro plan for the next {minutes} minutes using urgent tasks and energy cues."
        messages = self._build_messages(user, prompt, context)
        if not self.client:
            return self._fallback_response(
                "Micro plan:",
                [
                    "10 min: quick setup and review notes.",
                    "25 min: focus on the most urgent task chunk.",
                    "5 min: recap and log progress.",
                ],
            )
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
        )
        reply = completion.choices[0].message.content
        return {"reply": reply, "plan_adjusted": False}
    
    def _determine_task_type_instruction(
        self, task_title: str, task_description: str, is_academic: bool
    ) -> str:
        """Determine the task type instruction for the prompt."""
        if is_academic:
            return "This is an ACADEMIC/STUDY task. Provide research-backed study strategies (active recall, spaced repetition, Pomodoro, etc.)."
        
        task_lower = (task_title + " " + (task_description or "")).lower()
        complex_words = ["write", "essay", "paper", "report", "presentation", "prepare", "review", "read", "analyze", "research"]
        simple_words = ["melt", "cook", "buy", "pick", "simple", "quick"]
        
        if any(word in task_lower for word in complex_words):
            return "This is a GENERAL but COMPLEX task that could benefit from productivity tips. Provide actionable tips for execution, time management, or workflow (not study strategies)."
        if any(word in task_lower for word in simple_words):
            return "This appears to be a SIMPLE task. Only provide tips if they would genuinely help (e.g., time-saving shortcuts, preparation steps). If not helpful, return empty tips."
        return "This is a GENERAL task. Provide productivity or execution tips if relevant, otherwise return minimal or no tips."

    def _build_preparation_prompt(
        self, session_context: dict[str, Any], task_type_instruction: str
    ) -> str:
        """Build the prompt for session preparation."""
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
        
        return f"""Provide 3-5 actionable tips for this session. {task_type_instruction}

Task: {task_title}
{f"Description: {task_description}" if task_description else ""}
{f"Subject: {subject_name} ({subject_difficulty} difficulty)" if subject_name else ""}
Duration: {duration_minutes} minutes
Time: {time_of_day}
{f"Deadline: {deadline_proximity}" if deadline_proximity else ""}
Priority: {priority}
{f"Subtasks: {', '.join([st.get('title', '') for st in subtasks[:5]])}" if subtasks else ""}

Requirements:
1. {"For academic tasks: Base tips on proven cognitive science methods (active recall, spaced repetition, interleaving, Pomodoro, etc.)" if is_academic else "For general tasks: Provide practical productivity, execution, or workflow tips if relevant"}
2. Be specific and actionable (not generic)
3. Consider the task type, duration, and context
4. {"Recommend ONE primary study strategy and explain why it's effective" if is_academic else "Recommend a productivity approach if applicable"}
5. Keep tips concise (one sentence each)
6. {"If the task is too simple (e.g., 'melt butter'), return empty tips array and explain why in rationale" if not is_academic else ""}
7. Format response as JSON: {{"tips": ["tip1", "tip2", ...], "strategy": "strategy name", "rationale": "why this works"}}

Example formats:
Academic: {{"tips": ["Start with active recall: quiz yourself on key concepts before reading", "Use Pomodoro: 25-min focused blocks with 5-min breaks"], "strategy": "Active Recall + Pomodoro", "rationale": "Active recall improves retention by 50%. Pomodoro maintains focus."}}
General (complex): {{"tips": ["Break into 3 clear steps: outline, draft, revise", "Set a timer for each phase to stay on track"], "strategy": "Structured Workflow", "rationale": "Breaking complex tasks into phases improves completion rates."}}
Simple task: {{"tips": [], "strategy": "Quick Task", "rationale": "This is a straightforward task that doesn't require special preparation tips."}}"""

    def _parse_preparation_response(self, reply: str) -> Dict[str, Any]:
        """Parse the AI response into structured format."""
        import json
        try:
            result = json.loads(reply)
            return {
                "tips": result.get("tips", []),
                "strategy": result.get("strategy", "Active Recall"),
                "rationale": result.get("rationale", "Evidence-based study methods improve retention and efficiency.")
            }
        except (json.JSONDecodeError, KeyError):
            tips = [line.strip("-• ") for line in reply.splitlines() if line.strip() and not line.strip().startswith("{")]
            return {
                "tips": tips[:5] if tips else ["Focus on active recall", "Take strategic breaks", "Review key concepts"],
                "strategy": "Active Recall",
                "rationale": "Active recall is one of the most effective study methods according to cognitive science."
            }

    def prepare_session(
        self, user: User, session_context: dict[str, Any], context: dict[str, Any]
    ) -> Dict[str, Any]:
        """Provide research-backed preparation suggestions for a study session."""
        task_title = session_context.get("task_title", "this task")
        task_description = session_context.get("task_description", "")
        duration_minutes = session_context.get("duration_minutes", 60)
        is_academic = session_context.get("is_academic", False)
        
        task_type_instruction = self._determine_task_type_instruction(
            task_title, task_description, is_academic
        )
        prompt = self._build_preparation_prompt(session_context, task_type_instruction)
        messages = self._build_messages(user, prompt, context)
        
        if not self.client:
            return {
                "tips": [
                    "Start with active recall: quiz yourself on key concepts",
                    f"Use Pomodoro: {min(25, duration_minutes // 2)}-min focused blocks",
                    "Take a 5-min break at the midpoint"
                ],
                "strategy": "Active Recall + Pomodoro",
                "rationale": "Active recall improves retention significantly. Pomodoro maintains focus during longer sessions."
            }
        
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
            response_format={"type": "json_object"}
        )
        reply = completion.choices[0].message.content
        return self._parse_preparation_response(reply)
    
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

        messages = self._build_messages(user, prompt, context)
        
        if not self.client:
            return self._fallback_dashboard_insights(adherence, streak, adherence_change)
        
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,  # Slightly higher for more natural, varied insights
            response_format={"type": "json_object"}
        )
        reply = completion.choices[0].message.content
        return self._parse_dashboard_insights(reply, adherence, streak)
    
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
    
    def _parse_dashboard_insights(self, reply: str, adherence: float, streak: int) -> Dict[str, Any]:
        """Parse the AI response into structured insights."""
        import json
        try:
            result = json.loads(reply)
            # Ensure required fields
            insights = result.get("insights", [])
            for insight in insights:
                if "type" not in insight:
                    insight["type"] = "observation"
                if "action" not in insight:
                    insight["action"] = None
            return {
                "insights": insights,
                "motivational_message": result.get("motivational_message", "Keep up the great work!"),
                "overall_tone": result.get("overall_tone", "positive")
            }
        except (json.JSONDecodeError, KeyError):
            return self._fallback_dashboard_insights(adherence, streak, 0.0)
    
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

        messages = self._build_messages(user, prompt, context)
        
        if not self.client:
            return {
                "optimizations": [],
                "explanation": "Schedule looks good! The algorithm has created a balanced plan.",
                "overall_impact": "positive"
            }
        
        try:
            completion = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.3,  # Lower temperature for more consistent, practical suggestions
                response_format={"type": "json_object"}
            )
            reply = completion.choices[0].message.content
            result = json.loads(reply)
            return {
                "optimizations": result.get("optimizations", []),
                "explanation": result.get("explanation", "Schedule optimized for better real-world efficiency."),
                "overall_impact": result.get("overall_impact", "positive")
            }
        except (json.JSONDecodeError, KeyError):
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
        
        prompt = f"""Generate a brief, encouraging end-of-day summary for a student. Be specific, warm, and actionable.

Today's Activity:
- Completed {sessions_count} study session(s) ({hours:.1f} hours total)
- Finished {tasks_count} task(s)
- Energy level: {energy_level}
- Upcoming tomorrow: {len(tasks_tomorrow)} task(s) due

Your role:
1. Celebrate what was accomplished (be genuine, not overdone)
2. Note any patterns (e.g., "You were most productive in the morning")
3. Provide one specific tip for tomorrow based on today's performance
4. Keep it concise (2-3 sentences for summary, 1 sentence for tomorrow's tip)

Return JSON format:
{{
  "summary": "Brief narrative summary of the day (2-3 sentences)",
  "tomorrow_tip": "One actionable tip for tomorrow based on today's patterns",
  "tone": "positive|neutral|encouraging"
}}"""

        messages = self._build_messages(user, prompt, context)
        
        if not self.client:
            return {
                "summary": f"You completed {sessions_count} session(s) today totaling {hours:.1f} hours. {'Great work staying consistent!' if sessions_count > 0 else 'Consider scheduling some study time tomorrow.'}",
                "tomorrow_tip": f"You have {len(tasks_tomorrow)} task(s) coming up - start with the most urgent one tomorrow morning when your energy is highest.",
                "tone": "positive" if sessions_count > 0 else "encouraging"
            }
        
        completion = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.6,
            response_format={"type": "json_object"}
        )
        reply = completion.choices[0].message.content
        
        try:
            import json
            parsed = json.loads(reply)
            return {
                "summary": parsed.get("summary", ""),
                "tomorrow_tip": parsed.get("tomorrow_tip", ""),
                "tone": parsed.get("tone", "positive")
            }
        except Exception:
            return {
                "summary": f"You completed {sessions_count} session(s) today totaling {hours:.1f} hours. Keep up the momentum!",
                "tomorrow_tip": f"Focus on your {len(tasks_tomorrow)} upcoming task(s) tomorrow - start with the most important one.",
                "tone": "positive"
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

        messages = self._build_messages(user, prompt, context)

        if not self.client:
            if milestone == "almost_done":
                return {"message": f"You're almost there! Just {remaining_minutes} minutes left. You've got this!", "tone": "motivational"}
            elif milestone == "halfway":
                return {"message": "You're halfway through! Keep that momentum going.", "tone": "supportive"}
            elif milestone == "quarter":
                return {"message": "Great start! You're making solid progress.", "tone": "motivational"}
            else:
                return {"message": "Stay focused! Every minute counts toward your goal.", "tone": "supportive"}

        try:
            completion = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            reply = completion.choices[0].message.content
            if reply:
                import json
                reply_dict = json.loads(reply)
                return {
                    "message": reply_dict.get("message", "Keep going! You're doing great."),
                    "tone": reply_dict.get("tone", "motivational")
                }
        except Exception:
            pass

        return {"message": "Stay focused! You're making progress.", "tone": "supportive"}

