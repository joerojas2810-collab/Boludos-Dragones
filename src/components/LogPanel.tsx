import type { ReactNode } from "react";
import { Panel } from "@/components/Panel";

// The fight log is no longer drawn (the arena effects tell the story); only the action buttons stay,
// centered. The latest line is kept for screen readers.
export function LogPanel({
  lines,
  children,
}: {
  lines: string[];
  children?: ReactNode;
}) {
  return (
    <section className="shrink-0 py-1">
      <div className="flex flex-wrap items-center justify-center gap-3 [&>*]:!mt-0 [&>*]:!w-auto [&>*]:!min-h-0 [&>*]:!py-0.5 [&>*]:text-sm">
        {children}
      </div>
      <div className="sr-only" aria-live="polite">
        {lines[lines.length - 1]}
      </div>
    </section>
  );
}

// Fight log in the side column: same painted panel as the actions, newest line on top.
export function FightLog({ lines }: { lines: string[] }) {
  return (
    <Panel className="panel-float hidden !p-2 md:flex md:min-h-0 md:flex-1 md:flex-col">
      <ul className="action-inset min-h-0 flex-1 space-y-0.5 overflow-y-auto text-[13px] leading-5 text-[#d9d2ca]">
        {[...lines].reverse().map((l, i) => (
          <li
            key={lines.length - i}
            className={i === 0 ? "text-[#f6ead6]" : "opacity-75"}
          >
            {l}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
