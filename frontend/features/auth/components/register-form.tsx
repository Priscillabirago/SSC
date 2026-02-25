"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRegister } from "@/features/auth/hooks";

const timezones = [
  { value: "UTC", label: "UTC" },
  // Americas
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "America/Chicago", label: "America/Chicago (CT)" },
  { value: "America/Denver", label: "America/Denver (MT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "America/Phoenix", label: "America/Phoenix (MST)" },
  { value: "America/Anchorage", label: "America/Anchorage (AKT)" },
  { value: "America/Toronto", label: "America/Toronto (ET)" },
  { value: "America/Vancouver", label: "America/Vancouver (PT)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (CST)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (BRT)" },
  { value: "America/Buenos_Aires", label: "America/Buenos_Aires (ART)" },
  // Europe
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Europe/Rome", label: "Europe/Rome (CET)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (CET)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (CET)" },
  { value: "Europe/Stockholm", label: "Europe/Stockholm (CET)" },
  { value: "Europe/Zurich", label: "Europe/Zurich (CET)" },
  { value: "Europe/Vienna", label: "Europe/Vienna (CET)" },
  { value: "Europe/Dublin", label: "Europe/Dublin (GMT/IST)" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon (WET)" },
  { value: "Europe/Athens", label: "Europe/Athens (EET)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (MSK)" },
  // Asia
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (BST)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (ICT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (HKT)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (KST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Manila", label: "Asia/Manila (PHT)" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
  // Oceania
  { value: "Australia/Sydney", label: "Australia/Sydney (AET)" },
  { value: "Australia/Melbourne", label: "Australia/Melbourne (AET)" },
  { value: "Australia/Brisbane", label: "Australia/Brisbane (AET)" },
  { value: "Australia/Perth", label: "Australia/Perth (AWST)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST)" },
  // Africa
  { value: "Africa/Cairo", label: "Africa/Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
];

const timezoneAliases: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "America/Argentina/Buenos_Aires": "America/Buenos_Aires",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  "Etc/GMT+0": "UTC",
  "Etc/GMT-0": "UTC",
  "Etc/Greenwich": "UTC",
  GMT: "UTC",
};

function normalizeTimezone(tz?: string): string | null {
  if (!tz) return null;
  return timezoneAliases[tz] ?? tz;
}

function isInTimezoneList(tz: string): boolean {
  return timezones.some((t) => t.value === tz);
}

type PasswordStrength = "weak" | "medium" | "strong" | "";

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "";
  if (password.length < 8) return "weak";
  
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  
  const criteriaCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  
  if (criteriaCount <= 2) return "weak";
  if (criteriaCount === 3) return "medium";
  return "strong";
}

function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "bg-red-500";
    case "medium":
      return "bg-yellow-500";
    case "strong":
      return "bg-green-500";
    default:
      return "bg-muted";
  }
}

function getPasswordStrengthText(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "Weak";
    case "medium":
      return "Medium";
    case "strong":
      return "Strong";
    default:
      return "";
  }
}

// Validation functions
function validateEmailValue(value: string): string {
  if (!value) return "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) ? "" : "Please enter a valid email address";
}

function validateFullNameValue(value: string): string {
  if (!value) return "";
  return value.trim().length >= 2 ? "" : "Name must be at least 2 characters";
}

function validatePasswordValue(value: string): string {
  if (!value) return "";
  return value.length >= 8 ? "" : "Password must be at least 8 characters";
}

// Hook for form state and validation
function useRegisterFormState() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const fullNameInputRef = useRef<HTMLInputElement>(null);

  const setEmailErrorState = (error: string) => setEmailError(error);
  const setFullNameErrorState = (error: string) => setFullNameError(error);
  const setPasswordErrorState = (error: string) => setPasswordError(error);

  // Auto-focus on full name input
  useEffect(() => {
    fullNameInputRef.current?.focus();
  }, []);

  // Auto-detect timezone - use any valid IANA zone from the browser
  useEffect(() => {
    try {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const normalized = normalizeTimezone(detectedTimezone) ?? detectedTimezone;
      // Use detected zone if it looks like a valid IANA identifier (Region/City)
      if (normalized && /^[A-Za-z]+\/[A-Za-z_]+/.test(normalized)) {
        setTimezone(normalized);
      } else if (normalized === "UTC") {
        setTimezone("UTC");
      }
    } catch (error) {
      console.debug("Timezone detection failed, using UTC default", error);
    }
  }, []);

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEmail(value);
    setEmailError(value ? validateEmailValue(value) : "");
  };

  const handleFullNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFullName(value);
    setFullNameError(value ? validateFullNameValue(value) : "");
  };

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPassword(value);
    setPasswordError(validatePasswordValue(value));
  };

  const validateAll = () => {
    const emailErr = validateEmailValue(email);
    const fullNameErr = validateFullNameValue(fullName);
    const passwordErr = validatePasswordValue(password);
    
    setEmailError(emailErr);
    setFullNameError(fullNameErr);
    setPasswordError(passwordErr);

    return {
      isValid: !emailErr && !fullNameErr && !passwordErr,
      emailErr,
      fullNameErr,
      passwordErr
    };
  };

  // Build options so current timezone is always present (fixes Radix placeholder when value not in list)
  const timezoneOptions = useMemo(() => {
    if (!timezone || isInTimezoneList(timezone)) return timezones;
    return [{ value: timezone, label: `${timezone} (detected)` }, ...timezones];
  }, [timezone]);

  return {
    email,
    fullName,
    password,
    timezone,
    timezoneOptions,
    showPassword,
    emailError,
    fullNameError,
    passwordError,
    fullNameInputRef,
    setTimezone,
    setShowPassword,
    setEmailErrorState,
    setFullNameErrorState,
    setPasswordErrorState,
    handleEmailChange,
    handleFullNameChange,
    handlePasswordChange,
    validateAll
  };
}

export function RegisterForm() {
  const register = useRegister();
  const formState = useRegisterFormState();
  const {
    email,
    fullName,
    password,
    timezone,
    timezoneOptions,
    showPassword,
    emailError,
    fullNameError,
    passwordError,
    fullNameInputRef,
    setTimezone,
    setShowPassword,
    setEmailErrorState,
    setFullNameErrorState,
    setPasswordErrorState,
    handleEmailChange,
    handleFullNameChange,
    handlePasswordChange,
    validateAll
  } = formState;

  const handleEmailBlur = () => {
    setEmailErrorState(validateEmailValue(email));
  };

  const handleFullNameBlur = () => {
    setFullNameErrorState(validateFullNameValue(fullName));
  };

  const handlePasswordBlur = () => {
    setPasswordErrorState(validatePasswordValue(password));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const validation = validateAll();
    if (!validation.isValid) {
      if (validation.emailErr) {
        document.getElementById("email")?.focus();
      } else if (validation.fullNameErr) {
        fullNameInputRef.current?.focus();
      } else if (validation.passwordErr) {
        document.getElementById("password")?.focus();
      }
      return;
    }

    register.mutate({ email, password, full_name: fullName, timezone });
  };

  const passwordStrength = getPasswordStrength(password);
  const isSubmitting = register.isPending;

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          ref={fullNameInputRef}
          id="full-name"
          value={fullName}
          onChange={handleFullNameChange}
          onBlur={handleFullNameBlur}
          placeholder="Alex Morgan"
          autoComplete="name"
          disabled={isSubmitting}
          aria-invalid={!!fullNameError}
          aria-describedby={fullNameError ? "full-name-error" : undefined}
          className={fullNameError ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {fullNameError && (
          <p id="full-name-error" className="text-xs text-destructive" role="alert">
            {fullNameError}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
          required
          disabled={isSubmitting}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? "email-error" : undefined}
          className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {emailError && (
          <p id="email-error" className="text-xs text-destructive" role="alert">
            {emailError}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            minLength={8}
            required
            disabled={isSubmitting}
            aria-invalid={!!passwordError}
            aria-describedby={(() => {
              if (passwordError) return "password-error";
              if (password) return "password-strength";
              return undefined;
            })()}
            className={passwordError ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {password && (
          <div id="password-strength" className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getPasswordStrengthColor(passwordStrength)}`}
                  style={{
                    width: (() => {
                      if (passwordStrength === "weak") return "33%";
                      if (passwordStrength === "medium") return "66%";
                      return "100%";
                    })()
                  }}
                />
              </div>
              {passwordStrength && (() => {
                let strengthColor: string;
                if (passwordStrength === "weak") {
                  strengthColor = "text-red-600";
                } else if (passwordStrength === "medium") {
                  strengthColor = "text-yellow-600";
                } else {
                  strengthColor = "text-green-600";
                }
                return (
                  <span className={`text-xs font-medium ${strengthColor}`}>
                    {getPasswordStrengthText(passwordStrength)}
                  </span>
                );
              })()}
            </div>
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Mix of letters, numbers, and symbols recommended for strength.
            </p>
          </div>
        )}
        {passwordError && (
          <p id="password-error" className="text-xs text-destructive" role="alert">
            {passwordError}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Default timezone</Label>
        <Select value={timezone || "UTC"} onValueChange={setTimezone} disabled={isSubmitting}>
          <SelectTrigger id="timezone">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>
                {zone.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          We'll use this to schedule your study sessions at the right times.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
