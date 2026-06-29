import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("relative", {
  variants: {
    tone: {
      card: "bg-card text-text",
      elev: "bg-card-elev text-text",
      outline: "bg-card text-text border border-border",
      ink: "bg-ink text-text-on-ink",
      lavender: "bg-lavender text-text-on-accent",
      sky: "bg-sky text-text-on-accent",
      peach: "bg-peach text-text-on-accent",
      mint: "bg-mint text-text-on-accent",
      bubblegum: "bg-bubblegum text-text-on-accent",
    },
    radius: {
      md: "rounded-[16px]",
      lg: "rounded-[20px]",
      xl: "rounded-[24px]",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
      xl: "p-8",
    },
    lift: {
      true: "hover-lift cursor-pointer",
      false: "",
    },
  },
  defaultVariants: {
    tone: "card",
    radius: "lg",
    padding: "lg",
    lift: false,
  },
});

type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ className, tone, radius, padding, lift, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ tone, radius, padding, lift }), className)}
      {...props}
    />
  );
}
