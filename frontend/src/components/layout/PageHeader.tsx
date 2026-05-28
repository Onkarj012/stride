import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function PageHeader({ left, center, right, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 pt-1 pb-5",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3">{left}</div>
      <div className="flex-1 min-w-0 text-center">
        {typeof center === "string" ? (
          <h1 className="text-h2 text-text truncate">{center}</h1>
        ) : (
          center
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </header>
  );
}
