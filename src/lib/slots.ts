const MINUTE = 60_000;

/** The next `days` calendar days starting today, at local midnight. */
export function nextDays(now: Date, days: number): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: days }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** A new slot on `day` from `hour` for `hours` hours, local time. */
export function slotRange(day: Date, hour: number, hours: number): [Date, Date] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  return [start, new Date(start.getTime() + hours * 60 * MINUTE)];
}

/** Start hours on `day` that are still in the future (the database rejects past slots). */
export function futureHours<T extends string>(day: Date, hours: readonly T[], now: Date): T[] {
  return hours.filter((h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(h)) > now);
}
