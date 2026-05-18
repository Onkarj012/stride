import { type ReactNode, type MouseEvent } from "react";

export function Card({
  children,
  className = "",
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onClick}
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
