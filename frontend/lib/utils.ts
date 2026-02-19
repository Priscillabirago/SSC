import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "TBD";
  
  // Parse backend datetime (handles both UTC-aware and naive UTC)
  const date = parseBackendDateTime(value);
  
  // Check if time is set to a specific time (not midnight 00:00 or default end-of-day 23:59)
  // Use UTC hours/minutes to check
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const hasSpecificTime = !(utcHours === 0 && utcMinutes === 0) && !(utcHours === 23 && utcMinutes === 59);
  
  // For date-only formatting, use UTC date components to preserve the date the user selected
  // This prevents timezone shifts from showing the wrong date
  if (!options || (!options.timeStyle && !options.hour && !options.minute)) {
    if (!options && hasSpecificTime) {
      // When there's a specific time, convert UTC to local and use local date/time
      // This ensures both date and time are correct
      const localYear = date.getFullYear();
      const localMonth = date.getMonth();
      const localDay = date.getDate();
      const localHours = date.getHours();
      const localMinutes = date.getMinutes();
      
      // Create date in local timezone for formatting
      const dateForFormatting = new Date(localYear, localMonth, localDay, localHours, localMinutes);
      
      const timeStr = dateForFormatting.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
      const dateStr = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(dateForFormatting);
      return `${dateStr}, ${timeStr}`;
    }
    
    // Date-only formatting - use UTC components to preserve the selected date
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth();
    const utcDay = date.getUTCDate();
    
    // Create a date object with UTC components but in local timezone for formatting
    // This ensures the date component is preserved
    const dateForFormatting = new Date(utcYear, utcMonth, utcDay);
    
    return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: "medium" }).format(dateForFormatting);
  }
  
  // If options specify time formatting, use the original date (which includes timezone conversion)
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

/**
 * Parse a datetime string from backend, handling both UTC-aware and naive UTC formats.
 * Backend stores times as naive UTC, but may send them as UTC-aware in JSON.
 * This ensures consistent parsing regardless of format.
 */
export function parseBackendDateTime(value: string): Date {
  // If already has timezone info (Z, +, or -), parse directly
  if (value.includes('Z') || value.includes('+') || value.includes('-', 10)) {
    return new Date(value);
  }
  // Naive datetime from backend - assume UTC and append 'Z'
  return new Date(value + 'Z');
}

export function formatTime(value: string): string {
  // Parse backend datetime (handles both UTC-aware and naive UTC)
  const date = parseBackendDateTime(value);
  
  // Format in user's local timezone (browser automatically handles conversion)
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }).format(date);
}

/**
 * Format datetime for datetime-local input.
 * datetime-local expects LOCAL time, so we use local time methods.
 * The Date object automatically handles UTC to local conversion.
 */
export function formatForDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format minutes as a readable time string (e.g., "30m", "1h 30m", "2h").
 */
export function formatTimer(minutes: number | null | undefined): string {
  if (minutes == null || minutes === 0) return "0m";
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours === 0) {
    return `${remainingMinutes}m`;
  } else if (remainingMinutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${remainingMinutes}m`;
  }
}

/**
 * Parse a time input in "HH:MM" or minutes format into total minutes.
 * - "1:30" → 90
 * - "90"   → 90
 */
export function parseTimeToMinutes(value: string): number | null {
  if (!value) return null;

  const trimmed = value.trim();

  // If it looks like plain minutes, parse as integer
  if (!trimmed.includes(":")) {
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) && asNumber >= 0 ? Math.floor(asNumber) : null;
  }

  const [hoursPart, minutesPart] = trimmed.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Convert a local date/time to UTC ISO string, preserving BOTH date and time.
 * 
 * Strategy: Store the local time converted to UTC. When displaying:
 * - formatDate will convert UTC back to local time
 * - This preserves both the date and time the user entered
 * 
 * Example: User in UTC+8 enters Dec 12, 7:00 AM
 * - Store as: Dec 11, 11:00 PM UTC (7am - 8 hours)
 * - Display: Dec 12, 7:00 AM (formatDate converts UTC to local)
 */
export function localDateTimeToUTCISO(
  year: number,
  month: number, // 1-12 (not 0-11)
  day: number,
  hours: number = 23,
  minutes: number = 59
): string {
  // Create date in local timezone (what user actually entered)
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  
  // Convert to UTC ISO string
  // This stores the local time as UTC (may shift date, but formatDate handles it)
  return localDate.toISOString();
}

/**
 * Extract error message from unknown error type.
 * Handles Error instances, API error responses, and other error formats.
 */
export function getErrorMessage(error: unknown, fallback = "An error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const apiError = error as { response?: { data?: { detail?: string; message?: string } }; message?: string };
    return apiError?.response?.data?.detail || apiError?.response?.data?.message || apiError?.message || fallback;
  }
  return fallback;
}

