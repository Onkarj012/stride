import { type ReactNode } from "react";

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border-default)] ${
        hover
          ? "hover:-translate-y-1 hover:shadow-brutal transition-all duration-200"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
