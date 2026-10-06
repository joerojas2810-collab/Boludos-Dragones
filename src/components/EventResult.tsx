"use client";

import type { EventChange } from "@/lib/game/run";

// Dialog box with what an encounter did: the story line, what it cost and the result.
export function EventResult({
  text,
  paid,
  changes,
}: {
  text: string;
  paid: EventChange[];
  changes: EventChange[];
}) {
  const all = [...paid, ...changes];
  const bad = all.some((c) => c.good === false);
  const good = all.some((c) => c.good === true);
  const tone = good && !bad ? "#4ade80" : bad && !good ? "#f87171" : "#facc15";
  return (
    <div
      role="status"
      className="pixel-frame mb-3 space-y-2 p-3 text-center"
      style={{ borderColor: tone }}
    >
      <div className="text-yellow-300">{text}</div>
      <ul className="space-y-0.5 text-sm">
        {all.map((c, i) => (
          <li
            key={i}
            className={
              c.good === true
                ? "text-green-300"
                : c.good === false
                  ? "text-red-300"
                  : "text-[#d9d2ca]"
            }
          >
            {c.good === true ? "▲ " : c.good === false ? "▼ " : "· "}
            {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
