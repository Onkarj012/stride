import { cn } from "@/lib/utils";

/**
 * Stride mark — two rounded vertical pills offset like the gait of a walker,
 * in brand ink + lavender. No sparkle. Scales to any container size.
 */
export function StrideMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {/* Back pill — ink */}
      <rect
        x="6" y="8" width="8" height="20" rx="4"
        fill="currentColor"
        opacity="0.92"
      />
      {/* Front pill — lavender, slightly forward + up */}
      <rect
        x="17" y="4" width="8" height="20" rx="4"
        fill="#b3a0ff"
      />
    </svg>
  );
}
