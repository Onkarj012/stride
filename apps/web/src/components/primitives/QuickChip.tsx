import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const quickChipVariants = cva(
  [
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent",
    "px-3.5 py-2 text-[12.5px] font-bold",
    "transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-[var(--ease-out-soft)]",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
  ],
  {
    variants: {
      active: {
        true: "bg-ink text-text-on-ink",
        false: "bg-card text-text border-border shadow-[var(--shadow-elev)] hover:bg-card-elev",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

type QuickChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof quickChipVariants> & {
    label: string;
    dot?: string;
    icon?: React.ReactNode;
  };

export function QuickChip({
  label,
  dot,
  icon,
  active,
  className,
  type = "button",
  ...props
}: QuickChipProps) {
  return (
    <button
      type={type}
      className={cn(quickChipVariants({ active }), className)}
      {...props}
    >
      {icon ? (
        <span className="inline-flex shrink-0">{icon}</span>
      ) : dot ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  );
}
