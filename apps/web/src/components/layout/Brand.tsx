import { StrideMark } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type BrandProps = {
  className?: string;
  showWordmark?: boolean;
};

export function Brand({ className, showWordmark = true }: BrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5 text-text", className)}>
      <StrideMark className="h-7 w-7" />
      {showWordmark && (
        <span className="text-h3 font-extrabold tracking-tight">Stride</span>
      )}
    </div>
  );
}
