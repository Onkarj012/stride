import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string;
  name?: string;
  size?: number;
  className?: string;
  ring?: boolean;
};

const palette = ["bg-lavender", "bg-sky", "bg-peach", "bg-mint", "bg-bubblegum"];

function pickPaletteForName(name: string) {
  const total = name
    .split("")
    .reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return palette[total % palette.length];
}

export function Avatar({ src, name = "?", size = 40, className, ring }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const ringClass = ring ? "ring-2 ring-white" : "";

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn(
          "rounded-full object-cover shrink-0",
          ringClass,
          className,
        )}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-ink shrink-0",
        pickPaletteForName(name),
        ringClass,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
      }}
    >
      {initials || "?"}
    </span>
  );
}

type AvatarStackProps = {
  people: { name: string; src?: string }[];
  max?: number;
  size?: number;
  className?: string;
};

export function AvatarStack({
  people,
  max = 3,
  size = 32,
  className,
}: AvatarStackProps) {
  const visible = people.slice(0, max);
  const overflow = Math.max(0, people.length - max);

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          className="relative"
          style={{ marginLeft: i === 0 ? 0 : -10 }}
        >
          <Avatar src={p.src} name={p.name} size={size} ring />
        </div>
      ))}
      {overflow > 0 && (
        <span
          className="relative inline-flex items-center justify-center rounded-full bg-ink text-white font-semibold ring-2 ring-white"
          style={{
            width: size,
            height: size,
            marginLeft: -10,
            fontSize: Math.max(11, size * 0.36),
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
