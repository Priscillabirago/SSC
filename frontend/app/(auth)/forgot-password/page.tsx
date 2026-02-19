"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4 py-8 sm:px-6">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Password Reset Unavailable</CardTitle>
          <CardDescription>
            Password reset via email is currently disabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you are already logged in, you can change your password from the Settings page.
            If you need help accessing your account, please contact support.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/login">
              <Button variant="default" className="w-full">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
