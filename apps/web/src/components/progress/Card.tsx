import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A rounded panel with a small heading, shared by the Progress cards.
export function Card({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-card bg-card p-6 shadow-card", className)}>
      <h2 className="text-sm font-semibold text-ink3">{title}</h2>
      {children}
    </section>
  );
}

// A grey placeholder block shown while a card's data loads.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-field bg-card2", className)} />;
}
