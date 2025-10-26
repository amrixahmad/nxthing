// Date/time utilities for formatting and parsing without extra deps

export function toDMY(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function toHM12(date: Date): string {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  const am = h < 12;
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${am ? "AM" : "PM"}`;
}

export function formatDateTimeLocal(dt: string | Date | null | undefined): string {
  if (!dt) return "";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (isNaN(d.getTime())) return "";
  return `${toDMY(d)} ${toHM12(d)}`;
}

export function parseDMY(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
  if (d.getFullYear() !== yy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

export function parseTime12(value: string): { hours24: number; minutes: number } | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  // Allow formats like "9", "9PM", "9:05 PM", "09:05", "9  pm"
  const re = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/;
  const m = re.exec(v.replace(/\s+/g, " "));
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] as "AM" | "PM" | undefined;
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "AM") {
      h = h % 12; // 12AM -> 0
    } else {
      h = h % 12 + 12; // 12PM -> 12, 1PM -> 13
    }
  }
  return { hours24: h, minutes: min };
}

export function combineDateTime(dateStrDMY: string, timeStr12: string): Date | null {
  const d = parseDMY(dateStrDMY);
  const t = parseTime12(timeStr12);
  if (!d || !t) return null;
  d.setHours(t.hours24, t.minutes, 0, 0);
  return d;
}
