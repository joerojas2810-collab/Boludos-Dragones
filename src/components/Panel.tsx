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
      className={`pixel-frame relative p-4 ${title ? "pt-7" : ""} ${className}`}
    >
      {title && (
        <h2
          className={`pixel-frame absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-0.5 text-base ${titleClass}`}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
