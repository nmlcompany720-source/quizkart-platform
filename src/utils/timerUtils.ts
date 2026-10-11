export interface CountdownResult {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  totalSecondsRemaining: number;
  formattedBadge: string;
  isFinished: boolean;
}

/**
 * Parses any date/time string or number into a valid timestamp in milliseconds.
 * Supports:
 * - ISO string: "2026-09-08T20:00:00"
 * - Date string: "2026-09-08"
 * - Number: timestamp
 * - Legacy format: "8:00 PM Daily Blitz", "10:00 PM Night Surge"
 */
export function parseTargetTimestamp(scheduledTime?: string | number | null): number {
  if (!scheduledTime) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
    if (d.getTime() < now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }

  if (typeof scheduledTime === 'number') {
    return scheduledTime;
  }

  // Try parsing ISO or Date string
  const parsed = Date.parse(scheduledTime);
  if (!isNaN(parsed)) {
    return parsed;
  }

  // Handle strings like "8:00 PM Daily Blitz" or "10:00 PM"
  const match = scheduledTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const isPM = match[3].toUpperCase() === 'PM';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0);
    if (d.getTime() < now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }

  // Fallback: 2 hours from now
  return Date.now() + 2 * 3600 * 1000;
}

/**
 * Returns exact days, hours, minutes, seconds countdown
 * Formatted example: "Starts in: 02d : 05h : 30m : 15s"
 */
export function getCountdown(targetMs: number, currentMs: number = Date.now()): CountdownResult {
  const diffMs = targetMs - currentMs;

  if (diffMs <= 0) {
    return {
      days: '00',
      hours: '00',
      minutes: '00',
      seconds: '00',
      totalSecondsRemaining: 0,
      formattedBadge: '00d : 00h : 00m : 00s',
      isFinished: true
    };
  }

  const totalSecs = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dStr = pad(d);
  const hStr = pad(h);
  const mStr = pad(m);
  const sStr = pad(s);

  return {
    days: dStr,
    hours: hStr,
    minutes: mStr,
    seconds: sStr,
    totalSecondsRemaining: totalSecs,
    formattedBadge: `${dStr}d : ${hStr}h : ${mStr}m : ${sStr}s`,
    isFinished: false
  };
}

/**
 * Format countdown result to readable string (e.g. 02d : 05h : 30m : 15s)
 */
export function formatCountdown(cd: CountdownResult): string {
  return `${cd.days}d : ${cd.hours}h : ${cd.minutes}m : ${cd.seconds}s`;
}

/**
 * Format a Date to local ISO string (YYYY-MM-DDTHH:mm:ss)
 */
export function toLocalISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Decompose a date/time or scheduledTime into date, hours, minutes, seconds parts
 */
export function parseDateParts(input?: string): {
  date: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const pad = (n: number) => n.toString().padStart(2, '0');
  let d: Date;

  if (input && !isNaN(Date.parse(input))) {
    d = new Date(input);
  } else {
    // Default to today at 20:00:00
    const now = new Date();
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
    if (d.getTime() <= now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
  }

  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    date: dateStr,
    hours: pad(d.getHours()),
    minutes: pad(d.getMinutes()),
    seconds: pad(d.getSeconds())
  };
}
