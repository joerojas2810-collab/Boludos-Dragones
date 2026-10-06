import type { Profile } from "@/lib/game/profile";
import {
  claimedToday,
  currentStreak,
  dayKey,
  streakBonus,
} from "@/lib/game/streak";

export function DailyStreak({ profile }: { profile: Profile }) {
  const today = dayKey();
  const streak = currentStreak(profile.daily, today);
  const done = claimedToday(profile.daily, today);
  let n = streak + 1; // the next claim; find the next day that pays
  while (streakBonus(n) === 0) n++;
  return (
    <span>
      Racha diaria: {streak} {streak === 1 ? "día" : "días"}
      {done ? " (hoy reclamada)" : ""} · bono en {n - streak} día
      {n - streak === 1 ? "" : "s"}: +{streakBonus(n)} monedas
    </span>
  );
}
