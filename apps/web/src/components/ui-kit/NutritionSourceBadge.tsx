type NutritionSourceBadgeProps = {
  source?: string;
  confidence?: number;
  verified?: boolean;
};

export function formatNutritionSource(source?: string) {
  if (!source) return "Estimate";
  const normalized = source.toLowerCase();
  if (normalized === "database") return "DB matched";
  if (normalized === "mixed") return "DB + AI";
  if (normalized === "ai" || normalized === "ai_estimated") return "AI-estimated";
  if (normalized === "memory") return "Memory";
  if (normalized === "recipe") return "Recipe";
  if (normalized.includes("off")) return "Open Food Facts";
  if (normalized.includes("usda")) return "USDA";
  if (normalized.includes("barcode")) return "Barcode";
  if (normalized === "parse_error") return "Needs edit";
  return source.replace(/_/g, " ");
}

export function NutritionSourceBadge({ source, confidence, verified }: NutritionSourceBadgeProps) {
  if (!source && confidence == null && !verified) return null;

  const confidenceLabel = confidence == null
    ? null
    : `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide ${
      verified ? "bg-mint-soft uppercase text-mint" : "bg-card-elev text-text-muted"
    }`}>
      {verified ? "Verified food data" : formatNutritionSource(source)}
      {!verified && confidenceLabel ? ` · ${confidenceLabel}` : ""}
    </span>
  );
}
