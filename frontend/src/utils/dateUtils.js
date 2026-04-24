/**
 * Date utilities used across every "week view" page (Scheduler, Attendance,
 * Timesheets, Staff Shifts, Swap Requests, Reports).
 *
 * IMPORTANT: always prefer `toLocalDateStr` over `toISOString().split('T')[0]`
 * when formatting a Date for a date-picker input, API query param, or
 * comparison against a day calendar.
 *
 * `toISOString()` returns the UTC calendar day, but `getDay()` / `getDate()`
 * / `setDate()` use the user's LOCAL timezone. Mixing the two creates an
 * off-by-one-day bug for any user east of UTC during their early-morning
 * hours (India +5:30, Gulf +4, SG +8, Sydney +10 etc.) — the dates in the
 * header end up one day behind the day labels, even though the week-start
 * setting itself is correct.
 */

export function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocal() {
  return toLocalDateStr(new Date());
}

/**
 * Return the YYYY-MM-DD for the first day of the user's current work week,
 * honouring `weekStartDay` (0=Sun, 1=Mon, 6=Sat).
 */
export function weekStartLocal(weekStartDay = 1, offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - diff + offsetWeeks * 7);
  return toLocalDateStr(start);
}

/**
 * Return [startStr, endStr] for the user's current work week.
 */
export function weekRangeLocal(weekStartDay = 1, offsetWeeks = 0) {
  const start = new Date();
  const day = start.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  start.setDate(start.getDate() - diff + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
}
