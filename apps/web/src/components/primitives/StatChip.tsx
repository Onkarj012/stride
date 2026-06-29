import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statChipVariants = cva("flex flex-col gap-1 rounded-[16px] px-4 py-3.5", {
  variants: {
    tone: {
      mint: "bg-mint text-text-on-accent",
      sky: "bg-sky text-text-on-accent",
      peach: "bg-peach text-text-on-accent",
      lavender: "bg-lavender text-text-on-accent",
      card: "bg-card text-text border border-border",
    },
  },
  defaultVariants: { tone: "mint" },
});

type StatChipProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof statChipVariants> & {
    label: string;
    value: string;
    unit?: string;
  };

export function StatChip({
  label, value, unit, tone, className, ...props
}: StatChipProps) {
  return (
    <div className={cn(statChipVariants({ tone }), className)} {...props}>
      <span className="text-stat-label">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-stat-value">{value}</span>
        {unit && <span className="text-[12px] font-medium opacity-60">{unit}</span>}
      </span>
    </div>
  );
}
