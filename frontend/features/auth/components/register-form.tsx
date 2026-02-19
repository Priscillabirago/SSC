"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRegister } from "@/features/auth/hooks";

const timezones = [
  { value: "UTC", label: "UTC" },
  // Americas
  { value: "America/New_York", label: "ET" },
  { value: "America/Chicago", label: "CT" },
  { value: "America/Denver", label: "MT" },
  { value: "America/Los_Angeles", label: "PT" },
  { value: "America/Phoenix", label: "MST (AZ)" },
  { value: "America/Anchorage", label: "AKT" },
  { value: "America/Toronto", label: "ET (Toronto)" },
  { value: "America/Vancouver", label: "PT (Vancouver)" },
  { value: "America/Mexico_City", label: "CST (MX)" },
  { value: "America/Sao_Paulo", label: "BRT" },
  { value: "America/Buenos_Aires", label: "ART" },
  // Europe
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "Europe/Paris", label: "CET (Paris)" },
  { value: "Europe/Berlin", label: "CET (Berlin)" },
  { value: "Europe/Rome", label: "CET (Rome)" },
  { value: "Europe/Madrid", label: "CET (Madrid)" },
  { value: "Europe/Amsterdam", label: "CET (AMS)" },
  { value: "Europe/Stockholm", label: "CET (STO)" },
  { value: "Europe/Zurich", label: "CET (ZRH)" },
  { value: "Europe/Vienna", label: "CET (VIE)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET)" },
  { value: "Europe/Athens", label: "EET (Athens)" },
  { value: "Europe/Moscow", label: "MSK" },
  // Asia
  { value: "Asia/Dubai", label: "GST" },
  { value: "Asia/Karachi", label: "PKT" },
  { value: "Asia/Kolkata", label: "IST" },
  { value: "Asia/Dhaka", label: "BST" },
  { value: "Asia/Bangkok", label: "ICT" },
  { value: "Asia/Singapore", label: "SGT" },
  { value: "Asia/Hong_Kong", label: "HKT" },
  { value: "Asia/Shanghai", label: "CST (CN)" },
  { value: "Asia/Seoul", label: "KST" },
  { value: "Asia/Tokyo", label: "JST" },
  { value: "Asia/Manila", label: "PHT" },
  { value: "Asia/Jakarta", label: "WIB" },
  // Oceania
  { value: "Australia/Sydney", label: "AET (SYD)" },
  { value: "Australia/Melbourne", label: "AET (MEL)" },
  { value: "Australia/Brisbane", label: "AET (BNE)" },
  { value: "Australia/Perth", label: "AWST" },
  { value: "Pacific/Auckland", label: "NZST" },
  // Africa
  { value: "Africa/Cairo", label: "EET (Cairo)" },
  { value: "Africa/Johannesburg", label: "SAST" },
  { value: "Africa/Lagos", label: "WAT" },
];

const timezoneAliases: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "America/Argentina/Buenos_Aires": "America/Buenos_Aires",
};

function normalizeTimezone(tz?: string): string | null {
  if (!tz) return null;
  return timezoneAliases[tz] ?? tz;
}

function isSupportedTimezone(tz?: string): tz is string {
  const normalized = normalizeTimezone(tz);
  return Boolean(normalized && timezones.some((t) => t.value === normalized));
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

  // Auto-detect timezone
  useEffect(() => {
    try {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const normalized = normalizeTimezone(detectedTimezone);
      if (isSupportedTimezone(normalized || undefined)) {
        setTimezone(normalized!);
      }
    } catch (error) {
      // Fallback to UTC if detection fails - silently use default
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

  return {
    email,
    fullName,
    password,
    timezone,
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
              Use at least 8 characters with a mix of letters, numbers, and symbols.
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
        <Select value={timezone} onValueChange={setTimezone} disabled={isSubmitting}>
          <SelectTrigger id="timezone">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezones.map((zone) => (
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
