// Daily-claim streak: pure date logic. Days are "YYYY-MM-DD" in the game time
// zone (same as SQL game_day()). The server pays the bonus (see 0008 migration,
// constants streak_bonus_3 / streak_bonus_7 must match STREAK_BONUS).
export const GAME_TZ = "America/Argentina/Buenos_Aires";
export const STREAK_CYCLE = 7;
// position in the 7-day cycle -> bonus coins (the cycle repeats)
export const STREAK_BONUS: Record<number, number> = { 3: 500, 7: 1500 };

export interface DailyState {
  day: string; // last claimed day
  streak: number; // streak as of that day
}

export function dayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isDayKey = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const claimedToday = (d: DailyState | undefined, today: string) =>
  d?.day === today;

// Streak to show: still alive if claimed today or yesterday.
export function currentStreak(d: DailyState | undefined, today: string) {
  if (!d) return 0;
  return d.day === today || d.day === addDays(today, -1) ? d.streak : 0;
}

export const streakBonus = (streak: number) =>
  STREAK_BONUS[((streak - 1) % STREAK_CYCLE) + 1] ?? 0;

// Claim today: returns the new state and the bonus (0 if already claimed).
export function claimDaily(
  d: DailyState | undefined,
  today: string,
): { daily: DailyState; bonus: number } | null {
  if (d?.day === today) return null;
  const streak = currentStreak(d, today) + 1;
  return { daily: { day: today, streak }, bonus: streakBonus(streak) };
}
