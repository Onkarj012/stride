import { newSubmissionId } from "@/lib/log";

export type Submission = { key: string; id: string } | null;

// Returns the id for this payload, reusing the last one while the payload is unchanged so a retry logs once.
export function submissionIdFor(last: { current: Submission }, key: string): string {
  if (last.current?.key === key) return last.current.id;
  const id = newSubmissionId();
  last.current = { key, id };
  return id;
}
