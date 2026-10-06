const MARKERS = [
  ["meal", "MEAL"],
  ["workout", "WORKOUT"],
  ["sleep", "SLEEP"],
  ["water", "WATER"],
  ["mood", "MOOD"],
  ["steps", "STEPS"],
] as const;

export function structuredExtractionFromLegacyMarkers(reply: string): string | null {
  const items: Record<string, unknown>[] = [];
  for (const [type, marker] of MARKERS) {
    const pattern = new RegExp(`⟦LOG_${marker}⟧([\\s\\S]*?)⟦/LOG_${marker}⟧`, "g");
    for (const match of reply.matchAll(pattern)) {
      try {
        const data = JSON.parse(match[1]) as Record<string, any>;
        const description = type === "meal" || type === "workout"
          ? String(data.description ?? type)
          : type === "sleep"
            ? `slept ${data.hours ?? ""} hours ${data.quality ?? ""}`.trim()
            : type === "water"
              ? `${data.ml ?? ""}ml water`
              : type === "mood"
                ? `mood ${data.rating ?? ""}`
                : `${data.count ?? ""} steps`;
        items.push({
          type,
          description,
          date: data.date,
          ...(data.question ? { question: data.question } : {}),
          ...(data.confidence !== undefined ? { confidence: data.confidence } : {}),
          ...(data.validation ? { validation: data.validation } : {}),
        });
      } catch {
        return null;
      }
    }
  }
  return items.length > 0 ? JSON.stringify({ isQuestion: false, items }) : null;
}

export function legacyMarkerValue(reply: string, marker: string, field: string): unknown {
  const match = reply.match(new RegExp(`⟦LOG_${marker}⟧([\\s\\S]*?)⟦/LOG_${marker}⟧`));
  if (!match) return undefined;
  try {
    return (JSON.parse(match[1]) as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}

export function legacyConversationText(reply: string): string {
  return reply.replace(/⟦LOG_[A-Z_]+⟧[\s\S]*?⟦\/LOG_[A-Z_]+⟧/g, "").trim() || "Got it.";
}
