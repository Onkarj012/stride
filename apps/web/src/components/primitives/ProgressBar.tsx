import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const progressVariants = cva("overflow-hidden rounded-full bg-input", {
  variants: {
    height: {
      sm: "h-1",
      md: "h-1.5",
      lg: "h-2",
    },
  },
  defaultVariants: {
    height: "md",
  },
});

const progressFillVariants = cva("block h-full rounded-full", {
  variants: {
    tone: {
      lavender: "bg-lavender",
      peach: "bg-peach",
      sky: "bg-sky",
      mint: "bg-mint",
      bubblegum: "bg-bubblegum",
      ink: "bg-ink",
    },
    animated: {
      true: "transition-[width] duration-300 ease-[var(--ease-out-soft)]",
      false: "",
    },
  },
  defaultVariants: {
    tone: "lavender",
    animated: true,
  },
});

type ProgressTone = NonNullable<VariantProps<typeof progressFillVariants>["tone"]>;

type ProgressBarProps = Omit<React.HTMLAttributes<HTMLDivElement>, "color"> &
  VariantProps<typeof progressVariants> & {
    value?: number;
    tone?: ProgressTone;
    color?: ProgressTone;
    animated?: boolean;
    track?: string;
    fillClassName?: string;
  };

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function ProgressBar({
  value = 0,
  tone,
  color,
  height,
  animated,
  track,
  fillClassName,
  className,
  style,
  ...props
}: ProgressBarProps) {
  return (
    <div
      className={cn(progressVariants({ height }), className)}
      style={{ ...style, background: track ?? style?.background }}
      {...props}
    >
      <span
        className={cn(progressFillVariants({ tone: tone ?? color, animated }), fillClassName)}
        style={{ width: `${clamp01(value) * 100}%` }}
      />
    </div>
  );
}
