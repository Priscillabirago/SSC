"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/features/auth/components/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-5xl grid gap-6 sm:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-white/70 p-6 sm:p-8 lg:p-10 shadow-lg backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">
            Smart Study Companion
          </p>
          <h1 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight text-slate-900">
            Build consistent study habits with an AI coach.
          </h1>
          <ul className="mt-6 sm:mt-8 space-y-2 sm:space-y-3 text-sm text-muted-foreground">
            <li>• Capture subjects, tasks, and constraints in one place</li>
            <li>• Generate adaptive plans for the next week or the next hour</li>
            <li>• Reflect consistently to reinforce what works</li>
          </ul>
        </div>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Get started with personalized study planning in just a minute.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

