import * as Sentry from "@sentry/react";

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown client error");
}

export function reportException(error: unknown, event: string): void {
  Sentry.withScope((scope) => {
    scope.setTag("event", event);
    Sentry.captureException(asError(error));
  });
}
