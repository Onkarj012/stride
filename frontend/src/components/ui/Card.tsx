import { type ReactNode, type MouseEvent } from "react";
import { motion } from "framer-motion";

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
  if (hover) {
    return (
      <motion.div
        onClick={onClick}
        whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 25 } }}
        className={`bg-[var(--bg-card)] border border-[var(--border-default)] hover:shadow-brutal transition-shadow duration-200 will-change-transform ${className}`}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-[var(--bg-card)] border border-[var(--border-default)] ${className}`}
    >
      {children}
    </div>
  );
}
