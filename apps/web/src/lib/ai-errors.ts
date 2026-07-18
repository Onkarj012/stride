function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "");

  const value = error as { message?: unknown; data?: unknown };
  const parts = [
    typeof value.message === "string" ? value.message : "",
    typeof value.data === "string" ? value.data : JSON.stringify(value.data ?? ""),
  ];
  return parts.filter(Boolean).join(" ");
}

/** Return a human message for typed AI guard failures, or null for other errors. */
export function getAIErrorMessage(error: unknown): string | null {
  const text = errorText(error).toLowerCase();

  if (text.includes("input_too_large") || text.includes("input too large")) {
    if (text.includes("image") || text.includes("photo")) return "That image is too large. Please choose one under 5 MB.";
    if (text.includes("audio") || text.includes("voice")) return "That audio clip is too large. Please record a shorter clip.";
    return "That message is too long.";
  }
  if (text.includes("rate_limited") || text.includes("rate limited")) {
    return "You've sent a lot of AI requests — try again in a few minutes.";
  }
  if (text.includes("budget_exceeded") || text.includes("budget exceeded")) {
    return "You've hit today's AI limit — resets tomorrow.";
  }
  return null;
}
