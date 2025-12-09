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
  // Use UTC hours/minutes to check, but format in local time
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const hasSpecificTime = !(utcHours === 0 && utcMinutes === 0) && !(utcHours === 23 && utcMinutes === 59);
  
  // If no specific options provided and time exists, include time
  if (!options && hasSpecificTime) {
    return new Intl.DateTimeFormat(undefined, { 
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }
  
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: "medium" }).format(date);
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

