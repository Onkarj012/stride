export function logBackgroundFailure(event: string, userId: string, error: unknown): void {
  console.error(JSON.stringify({
    event,
    userId,
    error: error instanceof Error ? error.message : String(error),
  }));
}
