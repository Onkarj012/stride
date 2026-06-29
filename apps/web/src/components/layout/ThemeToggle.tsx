import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { IconButton } from "@/components/primitives/IconButton";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      tone="ghost"
      size="sm"
      onClick={toggle}
      className={className}
    >
      {theme === "dark"
        ? <Sun className="h-4 w-4" strokeWidth={1.75} />
        : <Moon className="h-4 w-4" strokeWidth={1.75} />}
    </IconButton>
  );
}
