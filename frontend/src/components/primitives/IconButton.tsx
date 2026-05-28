import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full transition-[transform,background-color,box-shadow,color] duration-150 ease-[var(--ease-out-soft)] active:scale-[0.96] focus-visible:outline-none",
  {
    variants: {
      tone: {
        card: "bg-card text-text border border-border hover:bg-card-elev",
        ghost: "bg-transparent text-text-muted hover:bg-card hover:text-text",
        ink: "bg-ink text-text-on-ink hover:opacity-90",
        outline: "bg-transparent text-text border border-border hover:bg-card",
      },
      size: {
        sm: "h-9 w-9",
        md: "h-10 w-10",
        lg: "h-11 w-11",
      },
    },
    defaultVariants: { tone: "card", size: "md" },
  },
);

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants>;

export function IconButton({
  className, tone, size, type = "button", ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(iconButtonVariants({ tone, size }), className)}
      {...props}
    />
  );
}
