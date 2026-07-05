import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full border border-transparent",
    "font-bold whitespace-nowrap select-none",
    "transition-[transform,background-color,border-color,color,opacity,box-shadow] duration-150 ease-[var(--ease-out-soft)]",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
  ],
  {
    variants: {
      variant: {
        primary: "bg-ink text-text-on-ink hover:opacity-90",
        secondary: "bg-input text-text hover:bg-card-elev",
        ghost: "bg-input text-text hover:bg-card-elev",
        outline: "bg-transparent text-text border-border-strong hover:bg-card",
        lavender: "bg-lavender text-text-on-accent hover:opacity-90",
        mint: "bg-mint text-text-on-accent hover:opacity-90",
        peach: "bg-peach text-text-on-accent hover:opacity-90",
      },
      size: {
        sm: "px-3.5 py-2 text-[12px]",
        md: "px-4.5 py-2.5 text-[13px]",
        lg: "px-5.5 py-3.5 text-[15px]",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      full: false,
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    icon?: React.ReactNode;
    iconRight?: React.ReactNode;
  };

export function Button({
  children,
  className,
  variant,
  size,
  full,
  icon,
  iconRight,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
      {iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
    </button>
  );
}
