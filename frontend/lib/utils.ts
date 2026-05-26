import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function parseApiDate(dateValue: string | Date): Date {
  if (dateValue instanceof Date) return dateValue;

  const raw = String(dateValue || "").trim();
  if (!raw) return new Date(NaN);

  // Backend returns naive ISO strings in PKT (GMT+5); treat them as such.
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasTimezone ? raw : `${raw}+05:00`);
}

export function formatPakistanDateTime(
  dateValue: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseApiDate(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
}

export function formatPakistanDate(
  dateValue: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatPakistanDateTime(dateValue, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/** Today's date in PKT as YYYY-MM-DD (e.g. for API calls, filenames). */
export function todayPKTDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Current PKT date+time formatted for display. */
export function nowPKTFormatted(options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(new Date());
}
