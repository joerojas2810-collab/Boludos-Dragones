import type { ReactNode } from "react";

type Props = {
  title?: string;
  titleClass?: string;
  className?: string;
  children: ReactNode;
};

export function Panel({
  title,
  titleClass = "",
  className = "",
  children,
}: Props) {
  return (
    <section className={`panel-art p-4 ${title ? "pt-12" : ""} ${className}`}>
      {title && (
        <h2
          className={`title-art panel-title absolute max-w-[calc(100vw-3rem)] whitespace-normal px-5 py-1 text-center leading-tight sm:max-w-none sm:whitespace-nowrap ${titleClass}`}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
