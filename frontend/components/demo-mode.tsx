"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronRight, ChevronLeft, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DemoStep {
  id: string;
  route: string;
  title: string;
  description: string;
  highlight?: string; // CSS selector to highlight
  position: "center" | "top" | "bottom" | "left" | "right";
  duration: number; // seconds before auto-advance (0 = manual)
}

const DEMO_STEPS: DemoStep[] = [
  // INTRO
  {
    id: "intro",
    route: "/dashboard",
    title: "Welcome to SSC - Smart Study Companion",
    description: "SSC is an AI-powered study companion that helps students plan, track, and optimize their study sessions. Unlike basic to-do apps, SSC understands your workload, respects your energy levels, and provides personalized guidance. Let's explore what makes it different.",
    position: "center",
    duration: 8,
  },
  
  // DASHBOARD
  {
    id: "dashboard-overview",
    route: "/dashboard",
    title: "Dashboard - Your Study Command Center",
    description: "The dashboard gives you an instant overview of your academic life. At a glance, you see your progress, upcoming work, and AI-generated insights. This reduces the cognitive load of figuring out 'what should I study today?' - the app tells you.",
    position: "top",
    duration: 7,
  },
  {
    id: "dashboard-streak",
    route: "/dashboard",
    title: "Streak & Gamification",
    description: "The streak counter tracks consecutive days with 30+ minutes of study. Research shows gamification increases motivation and habit formation. This simple feature encourages daily consistency - the #1 predictor of academic success.",
    position: "top",
    duration: 6,
  },
  {
    id: "dashboard-weekly-progress",
    route: "/dashboard",
    title: "Weekly Progress Tracking",
    description: "See how many hours you've studied this week vs. your goal. This creates accountability without judgment. Students can adjust their targets based on exam periods or lighter weeks.",
    position: "top",
    duration: 6,
  },
  {
    id: "dashboard-productivity",
    route: "/dashboard",
    title: "Productivity Trend Chart",
    description: "Visual representation of your last 7 days. You can see patterns - maybe you study more on weekends, or Wednesdays are always slow. This self-awareness helps you plan better.",
    position: "bottom",
    duration: 6,
  },
  {
    id: "dashboard-today",
    route: "/dashboard",
    title: "Today's Plan",
    description: "Your schedule for today, pulled from the AI-generated weekly plan. One click to see what's next. No more decision fatigue about what to study.",
    position: "bottom",
    duration: 5,
  },
  {
    id: "dashboard-energy",
    route: "/dashboard",
    title: "Energy Level (Top Bar)",
    description: "Set your daily energy: Low, Medium, or High. The scheduler uses this to plan lighter or more demanding sessions. Lower energy → shorter blocks and more breaks. Higher energy → longer focus sessions. Set it each morning for better plans.",
    position: "top",
    duration: 6,
  },
  {
    id: "dashboard-share-recap",
    route: "/dashboard",
    title: "Share Your Accomplishments",
    description: "The Weekly Recap card lets you share your study stats as an image—hours studied, adherence, streak. Perfect for accountability with parents, study groups, or mentors. Download or use the native share sheet.",
    position: "center",
    duration: 6,
  },
  
  // TASKS
  {
    id: "tasks-intro",
    route: "/tasks",
    title: "Tasks - Smart Task Management",
    description: "This isn't just a to-do list. Tasks in SSC have priorities (low to critical), time estimates, deadlines, and can be linked to subjects. The scheduler uses all this metadata to create an optimal study plan.",
    position: "center",
    duration: 7,
  },
  {
    id: "tasks-priority",
    route: "/tasks",
    title: "Priority-Based Scheduling",
    description: "Critical tasks get scheduled first and earlier in the week. The algorithm ensures you never miss a deadline because a low-priority task took up all your time. This is deadline-aware scheduling.",
    position: "top",
    duration: 6,
  },
  {
    id: "tasks-time-tracking",
    route: "/tasks",
    title: "Built-in Time Tracking",
    description: "Each task shows estimated time vs. actual time spent. You can start a quick timer directly on any task. This data feeds into analytics and helps the AI learn how long things actually take you.",
    position: "top",
    duration: 6,
  },
  {
    id: "tasks-subtasks",
    route: "/tasks",
    title: "Subtasks & AI Generation",
    description: "Break down complex tasks into subtasks. The AI can automatically generate subtasks for you - just click the sparkle icon. For example, 'Write essay' becomes: research, outline, draft, revise, proofread.",
    position: "center",
    duration: 6,
  },
  {
    id: "tasks-recurring",
    route: "/tasks",
    title: "Recurring Tasks",
    description: "For regular study commitments like 'Review lecture notes' or 'Practice problems', set up recurring tasks. They automatically regenerate based on your pattern—daily, weekly, or custom. Use the Recurring series section to manage any series, even before instances appear.",
    position: "center",
    duration: 6,
  },
  
  // SCHEDULE
  {
    id: "schedule-intro",
    route: "/schedule",
    title: "Schedule - AI-Generated Study Plan",
    description: "This is where SSC shines. Click 'Generate Schedule' and the AI creates a personalized 7-day study plan. It considers your tasks, deadlines, priorities, preferred study times, and available hours.",
    position: "center",
    duration: 7,
  },
  {
    id: "schedule-algorithm",
    route: "/schedule",
    title: "Smart Scheduling Algorithm",
    description: "The algorithm prioritizes by: 1) Deadline urgency, 2) Task priority, 3) Subject difficulty, 4) Exam dates. Critical tasks with close deadlines are scheduled first. It also respects your energy - harder subjects in your peak hours.",
    position: "top",
    duration: 8,
  },
  {
    id: "schedule-sessions",
    route: "/schedule",
    title: "Study Sessions",
    description: "Each block is a study session with a specific task/subject, start time, and end time. Sessions respect your constraints - it won't schedule during your classes or blocked times.",
    position: "center",
    duration: 6,
  },
  {
    id: "schedule-micro-plan",
    route: "/schedule",
    title: "Micro Planning",
    description: "Have 30 minutes right now? The micro-plan feature instantly creates a focused plan for short time windows. Perfect for studying between classes or when you have unexpected free time.",
    position: "right",
    duration: 6,
  },
  {
    id: "schedule-session-actions",
    route: "/schedule",
    title: "Session Management",
    description: "Mark sessions as completed, partially done, or skipped. This feedback improves future scheduling and updates your analytics. The app learns from your actual behavior.",
    position: "center",
    duration: 6,
  },
  {
    id: "schedule-warnings",
    route: "/schedule",
    title: "Workload Warnings",
    description: "Before generating, SSC analyzes your workload and warns you about potential issues: too many tasks, deadline clusters, insufficient time. This prevents burnout and unrealistic planning.",
    position: "left",
    duration: 6,
  },
  {
    id: "schedule-share-export",
    route: "/schedule",
    title: "Share & Export",
    description: "Share your schedule with a read-only link—parents, friends, or mentors can view your week without logging in. Or export to Google Calendar, Apple Calendar, or Outlook via iCal feed. Your plan, your way.",
    position: "right",
    duration: 6,
  },
  {
    id: "schedule-focus-mode",
    route: "/schedule",
    title: "Focus Mode",
    description: "Click any session to enter Focus Mode—a distraction-free timer with session prep, encouragement, and the option to adjust or finish early. See how many students are studying now for a sense of community.",
    position: "center",
    duration: 6,
  },
  
  // ANALYTICS
  {
    id: "analytics-intro",
    route: "/analytics",
    title: "Analytics - Data-Driven Insights",
    description: "Transform your study data into actionable insights. See patterns you'd never notice manually: your most productive days, which subjects take longer, how your energy affects performance.",
    position: "center",
    duration: 7,
  },
  {
    id: "analytics-adherence",
    route: "/analytics",
    title: "Schedule Adherence",
    description: "Track what percentage of planned sessions you actually complete. This metric reveals if you're overplanning or if your schedules are realistic. Aim for 70-85% - too high means you're not challenging yourself.",
    position: "top",
    duration: 6,
  },
  {
    id: "analytics-time-dist",
    route: "/analytics",
    title: "Time Distribution by Subject",
    description: "Visual breakdown of where your study time goes. Spot imbalances instantly - maybe you're over-preparing for one subject while neglecting another. Data doesn't lie.",
    position: "center",
    duration: 6,
  },
  {
    id: "analytics-day-adherence",
    route: "/analytics",
    title: "Day-by-Day Analysis",
    description: "See which days of the week you're most productive. Maybe Mondays are always slow, or you crush it on Saturdays. Use this to schedule important work on your best days.",
    position: "bottom",
    duration: 6,
  },
  {
    id: "analytics-subject-perf",
    route: "/analytics",
    title: "Subject Performance",
    description: "Detailed metrics per subject: total time, sessions completed, average session length. Identify which subjects need more attention based on actual data, not feelings.",
    position: "bottom",
    duration: 6,
  },
  {
    id: "analytics-energy",
    route: "/analytics",
    title: "Energy & Productivity",
    description: "See how your energy levels (low, medium, high) correlate with session completion. Research shows aligning study times with your natural energy patterns improves performance. Use this to schedule important work during your peak hours.",
    position: "bottom",
    duration: 6,
  },
  
  // COACH
  {
    id: "coach-intro",
    route: "/coach",
    title: "AI Study Coach - Your Personal Advisor",
    description: "The coach is an AI that knows YOUR context: your tasks, schedule, progress, energy levels, and past conversations. It's not generic advice - it's personalized guidance based on your actual situation.",
    position: "center",
    duration: 7,
  },
  {
    id: "coach-chat",
    route: "/coach",
    title: "Conversational Assistance",
    description: "Ask anything: 'What should I focus on today?', 'I'm feeling overwhelmed', 'Help me prepare for my exam'. The AI responds with actionable advice tailored to your current workload and deadlines.",
    position: "left",
    duration: 7,
  },
  {
    id: "coach-memory",
    route: "/coach",
    title: "Context-Aware Memory",
    description: "The coach remembers your conversations. If you mentioned struggling with a subject last week, it factors that in. This continuity makes it feel like a real advisor, not a stateless chatbot.",
    position: "left",
    duration: 6,
  },
  {
    id: "coach-sidebar",
    route: "/coach",
    title: "Quick Actions Sidebar",
    description: "The sidebar provides quick access to: Plan Adjustments (AI schedule suggestions), Study Strategies (technique recommendations), Troubleshooting (when you're stuck), and Daily Reflection.",
    position: "right",
    duration: 6,
  },
  {
    id: "coach-reflection",
    route: "/coach",
    title: "Daily Reflection",
    description: "End each day by noting what worked and what was challenging. The AI summarizes your insights and uses them to improve tomorrow's suggestions. This metacognition loop accelerates learning.",
    position: "right",
    duration: 6,
  },
  
  // SETTINGS & CUSTOMIZATION
  {
    id: "settings-intro",
    route: "/settings",
    title: "Personalization & Settings",
    description: "SSC adapts to YOU. Set your weekly study hour goals, preferred session lengths, break durations, and study time windows (morning person vs. night owl). The scheduler respects all these preferences.",
    position: "center",
    duration: 6,
  },
  {
    id: "settings-windows",
    route: "/settings",
    title: "Study Time Windows",
    description: "Define when you're available to study: morning, afternoon, evening, or custom time ranges. The AI only schedules sessions within these windows, respecting your life outside academics.",
    position: "center",
    duration: 6,
  },
  {
    id: "settings-subjects",
    route: "/settings",
    title: "Subjects & Difficulty",
    description: "Add your subjects with difficulty ratings and exam dates. Harder subjects get weighted higher in scheduling. Upcoming exams trigger increased priority for related tasks.",
    position: "center",
    duration: 6,
  },
  
  // CONCLUSION
  {
    id: "conclusion",
    route: "/dashboard",
    title: "Why SSC Matters",
    description: "Students struggle with planning, not capability. SSC removes the friction of 'what should I study?' and 'when?'. It's a system that grows smarter with use, turning chaotic studying into structured progress. Thank you for watching.",
    position: "center",
    duration: 10,
  },
];

interface DemoModeProps {
  readonly onClose: () => void;
}

export function DemoMode({ onClose }: DemoModeProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const step = DEMO_STEPS[currentStep];
  const totalSteps = DEMO_STEPS.length;

  // Navigate to the route for current step
  useEffect(() => {
    if (step?.route) {
      router.push(step.route);
    }
  }, [step?.route, router]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || step.duration === 0) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + (100 / step.duration / 10);
        if (newProgress >= 100) {
          // Auto advance to next step
          if (currentStep < totalSteps - 1) {
            setCurrentStep((s) => s + 1);
            return 0;
          } else {
            // Demo complete
            onClose();
            return 100;
          }
        }
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [currentStep, isPaused, step.duration, totalSteps, onClose]);

  // Reset progress when step changes
  useEffect(() => {
    setProgress(0);
  }, [currentStep]);

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onClose();
    }
  }, [currentStep, totalSteps, onClose]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const togglePause = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "p") togglePause();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev, togglePause]);

  const positionClasses = {
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    top: "top-24 left-1/2 -translate-x-1/2",
    bottom: "bottom-24 left-1/2 -translate-x-1/2",
    left: "top-1/2 left-8 -translate-y-1/2",
    right: "top-1/2 right-8 -translate-y-1/2",
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-[9998] pointer-events-none" />
      
      {/* Demo Card */}
      <div
        className={cn(
          "fixed z-[9999] w-[500px] max-w-[90vw] bg-card border border-border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-300",
          positionClasses[step.position]
        )}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step counter */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-medium">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-foreground mb-3">
          {step.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          {step.description}
        </p>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goPrev}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={togglePause}
            >
              {isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isPaused ? "Paused" : `${Math.ceil(step.duration - (progress / 100) * step.duration)}s`}
            </span>
            <Button
              size="sm"
              onClick={goNext}
            >
              {currentStep === totalSteps - 1 ? "Finish" : "Next"}
              {currentStep < totalSteps - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">→</kbd> or <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Space</kbd> for next • <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">←</kbd> for back • <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">P</kbd> to pause • <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to exit
          </p>
        </div>
      </div>
    </>
  );
}
