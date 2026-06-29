import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ListRowProps = {
  icon?: React.ReactNode;
  title: string;
  meta?: string;
  onClick?: () => void;
  className?: string;
  trailing?: React.ReactNode;
  showChevron?: boolean;
};

export function ListRow({
  icon, title, meta, onClick, className, trailing, showChevron = true,
}: ListRowProps) {
  const Comp: React.ElementType = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-4 px-4 py-3.5 text-left",
        "transition-colors duration-150",
        onClick && "hover:bg-card-elev cursor-pointer",
        "rounded-[12px] focus-visible:outline-none",
        className,
      )}
    >
      {icon && (
        <span className="text-text-muted [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[1.6]">
          {icon}
        </span>
      )}
      <span className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="text-[15px] font-semibold text-text truncate">{title}</span>
        {meta && <span className="text-caption text-text-muted truncate">{meta}</span>}
      </span>
      <span className="text-text-subtle shrink-0">
        {trailing ?? (showChevron && onClick && <ChevronRight className="h-5 w-5" />)}
      </span>
    </Comp>
  );
}

export function ListDivider() {
  return <div className="mx-4 h-px bg-border" />;
}
