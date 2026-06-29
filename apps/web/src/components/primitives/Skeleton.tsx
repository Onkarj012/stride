import { cn } from "@/lib/utils";

const radiusMap = {
  sm: "rounded-[10px]",
  md: "rounded-[16px]",
  lg: "rounded-[20px]",
  full: "rounded-full",
};

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  rounded?: keyof typeof radiusMap;
};

export function Skeleton({ className, rounded = "md", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("skeleton-shimmer", radiusMap[rounded], className)}
      {...props}
    />
  );
}
