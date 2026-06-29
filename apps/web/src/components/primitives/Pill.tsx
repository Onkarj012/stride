import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full font-medium whitespace-nowrap select-none",
  {
    variants: {
      tone: {
        ink: "bg-ink text-text-on-ink",
        card: "bg-card text-text border border-border",
        outline: "bg-transparent text-text border border-border",
        muted: "bg-card text-text-muted border border-border",
        peach: "bg-peach text-text-on-accent",
        sky: "bg-sky text-text-on-accent",
        mint: "bg-mint text-text-on-accent",
        lavender: "bg-lavender text-text-on-accent",
        bubblegum: "bg-bubblegum text-text-on-accent",
      },
      size: {
        sm: "px-2.5 py-1 text-[11px]",
        md: "px-3 py-1.5 text-[13px]",
        lg: "px-4 py-2 text-sm",
      },
    },
    defaultVariants: { tone: "outline", size: "md" },
  },
);

type PillProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pillVariants>;

export function Pill({ className, tone, size, ...props }: PillProps) {
  return (
    <span className={cn(pillVariants({ tone, size }), className)} {...props} />
  );
}
