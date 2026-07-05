import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 lg:px-6", className)}>{children}</div>;
}
