import type { ReactNode } from "react";

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
