import { cn } from "@/lib/utils";

type SuggestionChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  label: string;
};

export function SuggestionChip({
  icon, label, className, type = "button", ...props
}: SuggestionChipProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-full",
        "bg-card border border-border text-text",
        "px-3.5 py-2 text-[13px] font-medium",
        "transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out-soft)]",
        "hover:bg-card-elev hover:border-border-strong active:scale-[0.97]",
        "focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="text-text-muted [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.75]">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
