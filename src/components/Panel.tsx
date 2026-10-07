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
    <section
      className={`panel-art p-4 ${title ? "pt-9" : ""} ${className}`}
    >
      {title && (
        <h2
          className={`title-art panel-title absolute -top-4 left-1/2 max-w-[calc(100vw-3rem)] -translate-x-1/2 whitespace-normal px-4 py-0.5 text-center text-base leading-tight sm:max-w-none sm:whitespace-nowrap ${titleClass}`}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
