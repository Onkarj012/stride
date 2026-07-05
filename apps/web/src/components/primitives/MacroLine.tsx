import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/primitives/Pill";

const macroLineVariants = cva("mt-2 flex flex-wrap gap-1.5", {
  variants: {
    align: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
    },
  },
  defaultVariants: {
    align: "start",
  },
});

type MacroTone =
  | "ink"
  | "card"
  | "outline"
  | "muted"
  | "peach"
  | "sky"
  | "mint"
  | "lavender"
  | "bubblegum";

export type MacroItem = {
  label: string;
  tone?: MacroTone;
  icon?: React.ReactNode;
};

type MacroLineProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof macroLineVariants> & {
    items?: MacroItem[];
    size?: "sm" | "md" | "lg";
  };

export function MacroLine({
  items = [],
  size = "md",
  align,
  className,
  ...props
}: MacroLineProps) {
  return (
    <div className={cn(macroLineVariants({ align }), className)} {...props}>
      {items.map((item, index) => (
        <Pill key={`${item.label}-${index}`} tone={item.tone ?? "muted"} size={size}>
          {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
          {item.label}
        </Pill>
      ))}
    </div>
  );
}
