import { useNavSheet } from "@/context/NavSheetContext";
import { cn } from "@/lib/utils";

function GridDotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <rect x="1"    y="1"    width="7.5" height="7.5" rx="1.5" />
      <rect x="11.5" y="1"    width="7.5" height="7.5" rx="1.5" />
      <rect x="1"    y="11.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="11.5" y="11.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function NavTrigger({ className }: { className?: string }) {
  const { setOpen } = useNavSheet();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className={cn(
        "w-[38px] h-[38px] rounded-[12px] bg-card border-none flex items-center justify-center",
        "shadow-[0_2px_10px_rgba(13,16,27,0.06)] text-text transition-colors active:bg-card-elev",
        className,
      )}
    >
      <GridDotsIcon />
    </button>
  );
}
