"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/features/auth/components/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4">
      <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-white/70 p-10 shadow-lg backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">
            Smart Study Companion
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-900">
            Build consistent study habits with an AI partner.
          </h1>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li>• Capture subjects, tasks, and constraints in one place</li>
            <li>• Generate adaptive plans for the next week or the next hour</li>
            <li>• Reflect nightly to reinforce what works</li>
          </ul>
          <p className="mt-10 text-sm text-muted-foreground">
            Already a member?{" "}
            <Link href="/login" className="font-semibold text-primary">
              Sign in
            </Link>
          </p>
        </div>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Answer a few quick questions to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

