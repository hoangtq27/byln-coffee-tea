export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Thứ Hai của tuần chứa ngày iso. */
export function mondayOf(iso: string): string {
  const d = parseIso(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(iso, -dow);
}

export function daysBetween(fromIso: string, toIso_: string): number {
  return Math.round((parseIso(toIso_).getTime() - parseIso(fromIso).getTime()) / 86400000);
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** "07:00:00" -> "07:00" */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}
