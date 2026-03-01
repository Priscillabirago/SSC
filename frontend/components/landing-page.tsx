"use client";

import Link from "next/link";
import { Calendar, Zap, BarChart3, MessageCircle, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Gradient orbs background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-violet-500/20 blur-[128px]" />
        <div className="absolute top-1/2 -left-40 w-72 h-72 rounded-full bg-cyan-500/15 blur-[100px]" />
        <div className="absolute -bottom-20 right-1/3 w-64 h-64 rounded-full bg-fuchsia-500/10 blur-[80px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-violet-400" />
          <span className="font-semibold text-lg tracking-tight">SSC</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-white/90 hover:text-white hover:bg-white/10">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button className="bg-violet-600 hover:bg-violet-500 text-white">
              Get started free
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-24 sm:px-8 lg:px-12 lg:pt-24 lg:pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-violet-400 font-medium text-sm uppercase tracking-widest mb-4">
            Stop guessing what to study
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Your study week, planned in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
              seconds
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-10">
            SSC builds your weekly schedule from your tasks, deadlines, and energy—so you can focus on studying instead of figuring out what to study.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register?startDemo=1">
              <Button size="lg" className="bg-violet-600 hover:bg-violet-500 text-white text-base px-8 h-12 gap-2">
                <Play className="h-5 w-5" />
                Try the guided demo
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white text-base px-8 h-12">
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Product preview - mock dashboard */}
      <section className="relative z-10 px-6 pb-24 sm:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-white/50 text-sm uppercase tracking-wider mb-6">
            See it in action
          </p>
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-6 overflow-hidden shadow-2xl shadow-black/20">
            <div className="flex gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
            </div>
            <div className="grid grid-cols-12 gap-3 sm:gap-4">
              {/* Mock streak + stats */}
              <div className="col-span-12 sm:col-span-4 flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-lg bg-violet-500/30 flex items-center justify-center text-2xl font-bold text-violet-300">
                  7
                </div>
                <div>
                  <p className="text-xs text-white/50">Streak</p>
                  <p className="font-semibold text-white/90">7 days in a row</p>
                </div>
              </div>
              <div className="col-span-6 sm:col-span-4 p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-white/50">This week</p>
                <p className="text-xl font-semibold text-white/90">12.5h</p>
                <p className="text-xs text-white/40">of 15h goal</p>
              </div>
              <div className="col-span-6 sm:col-span-4 p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-white/50">Today</p>
                <p className="text-xl font-semibold text-white/90">3 sessions</p>
                <p className="text-xs text-white/40">planned</p>
              </div>
              {/* Mock schedule */}
              <div className="col-span-12 rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-white/50 mb-3">Today&apos;s plan</p>
                <div className="space-y-2">
                  {[
                    { time: "9:00", task: "Review Biology ch.5", subject: "Bio", done: true },
                    { time: "11:00", task: "Calc problem set", subject: "Math", done: true },
                    { time: "2:00", task: "Essay draft", subject: "Eng", done: false },
                  ].map((s) => (
                    <div key={`${s.time}-${s.task}`} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/5">
                      <span className="text-xs text-white/50 w-12">{s.time}</span>
                      <span className={`flex-1 text-sm ${s.done ? "text-white/50 line-through" : "text-white/90"}`}>
                        {s.task}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">{s.subject}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="relative z-10 px-6 py-24 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-4">
            Not just another to-do app
          </h2>
          <p className="text-center text-white/60 max-w-xl mx-auto mb-16">
            SSC actually plans your week—and adapts when your energy dips or life gets in the way.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Zap,
                title: "Energy-aware scheduling",
                desc: "Set your energy each morning. Lighter days get shorter sessions and more breaks.",
              },
              {
                icon: Calendar,
                title: "AI-generated plans",
                desc: "One click builds your week from tasks, deadlines, and your actual availability.",
              },
              {
                icon: BarChart3,
                title: "See what works",
                desc: "Analytics show when you're most productive and which subjects need more time.",
              },
              {
                icon: MessageCircle,
                title: "Study coach",
                desc: "Personalized strategies, break-down help, and reflections that stick.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors"
              >
                <item.icon className="h-8 w-8 text-violet-400 mb-4" />
                <h3 className="font-semibold text-white/95 mb-2">{item.title}</h3>
                <p className="text-sm text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24 sm:px-8 lg:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to study smarter?
          </h2>
          <p className="text-white/60 mb-8">
            Free to start. No credit card. Takes under a minute.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-violet-600 hover:bg-violet-500 text-white text-base px-8 h-12">
                Create free account
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                I already have an account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-white/40 text-sm">© SSC · Smart Study Companion</span>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link href="/login" className="hover:text-white/80 transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-white/80 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
