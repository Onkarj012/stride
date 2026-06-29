import type { LogEntry } from "@/lib/storage";
import { categoryById } from "@/data/mock";

const HOUR_MS = 3_600_000;

function timePart(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const TIME_PREFIX: Record<ReturnType<typeof timePart>, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

type Greeting = { headline: string; sub: string };

/**
 * Returns a contextual greeting based on the most recent log and time of day.
 * Examples:
 *   - "Morning, Sandra. Ready to log breakfast?"
 *   - "Evening, Sandra. That run looked sharp."
 */
export function getGreeting(name: string, logs: LogEntry[]): Greeting {
  const time = timePart();
  const prefix = TIME_PREFIX[time];

  // No logs at all
  if (logs.length === 0) {
    return {
      headline: `${prefix}, ${name}.`,
      sub: "Ready to start? Tell me what's on your mind.",
    };
  }

  const latest = logs[0];
  const ageHours = (Date.now() - latest.createdAt) / HOUR_MS;
  const cat = categoryById[latest.category];

  // Recently logged something (< 1h ago) — comment on it
  if (ageHours < 1) {
    if (latest.workout) {
      const intensity = latest.workout.intensity;
      const tail =
        intensity === "high"
          ? "That was intense — well done."
          : intensity === "light"
            ? "Nice and easy. Solid recovery work."
            : "Good steady effort.";
      return {
        headline: `${prefix}, ${name}.`,
        sub: `${tail} What's next?`,
      };
    }
    if (latest.meal) {
      return {
        headline: `${prefix}, ${name}.`,
        sub: `Logged ${Math.round(latest.meal.kcal)} kcal — looks balanced.`,
      };
    }
    if (latest.water) {
      return {
        headline: `${prefix}, ${name}.`,
        sub: `Hydration counted. Want to plan the next meal?`,
      };
    }
    if (latest.sleep) {
      return {
        headline: `${prefix}, ${name}.`,
        sub: `Sleep noted. Let's set up today gently.`,
      };
    }
    return {
      headline: `${prefix}, ${name}.`,
      sub: `Got it — your ${cat.label.toLowerCase()} is in.`,
    };
  }

  // Logged a few hours ago — gentle nudge to continue
  if (ageHours < 6) {
    return {
      headline: `${prefix}, ${name}.`,
      sub: `Last entry was your ${cat.label.toLowerCase()}. Anything to add?`,
    };
  }

  // Logged earlier today — soft re-entry prompt
  if (ageHours < 24) {
    return {
      headline: `${prefix}, ${name}.`,
      sub: `Welcome back. Let's keep today rolling.`,
    };
  }

  // Haven't logged today
  return {
    headline: `${prefix}, ${name}.`,
    sub: `Good to see you. What's first today?`,
  };
}
