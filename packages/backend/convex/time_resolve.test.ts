import { describe, expect, test } from "vitest";
import { resolveActionDate, resolveIntervalDay } from "./time_resolve";

const now = Date.parse("2026-07-16T12:00:00.000Z");

describe("resolveActionDate", () => {
  test("accepts explicit historical dates without an age cutoff", () => {
    expect(resolveActionDate({
      now,
      userTimeZone: "UTC",
      explicitDate: "1999-01-02",
      explicitTime: "08:30",
      actionKind: "actual",
    })).toEqual({ status: "resolved", date: "1999-01-02", time: "08:30" });
  });

  test("explicit date wins over client-local context", () => {
    expect(resolveActionDate({
      now,
      userTimeZone: "UTC",
      explicitDate: "2026-07-10",
      clientLocalDate: "2026-07-16",
      actionKind: "actual",
    })).toEqual({ status: "resolved", date: "2026-07-10" });
  });

  test("asks for clarification for vague relative phrases", () => {
    for (const relativePhrase of ["a while ago", "last week sometime", "recently"]) {
      expect(resolveActionDate({ now, userTimeZone: "UTC", relativePhrase, actionKind: "actual" })).toMatchObject({
        status: "needs_clarification",
      });
    }
  });

  test("resolves precise relative phrases in the user timezone", () => {
    expect(resolveActionDate({ now, userTimeZone: "UTC", relativePhrase: "yesterday", actionKind: "actual" }))
      .toEqual({ status: "resolved", date: "2026-07-15" });
    expect(resolveActionDate({ now, userTimeZone: "UTC", relativePhrase: "2 days ago", actionKind: "actual" }))
      .toEqual({ status: "resolved", date: "2026-07-14" });
  });

  test("rejects future actual dates and times", () => {
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-07-17", actionKind: "actual" }))
      .toMatchObject({ status: "rejected" });
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-07-16", explicitTime: "12:01", actionKind: "actual" }))
      .toMatchObject({ status: "rejected" });
  });

  test("allows future planned actions", () => {
    expect(resolveActionDate({
      now,
      userTimeZone: "UTC",
      explicitDate: "2026-07-17",
      explicitTime: "09:00",
      actionKind: "planned",
    })).toEqual({ status: "resolved", date: "2026-07-17", time: "09:00" });
  });

  test("uses the server epoch in the user timezone", () => {
    const utcMidnight = Date.parse("2026-07-16T00:30:00.000Z");
    expect(resolveActionDate({
      now: utcMidnight,
      userTimeZone: "America/Los_Angeles",
      relativePhrase: "yesterday",
      actionKind: "actual",
    })).toEqual({ status: "resolved", date: "2026-07-14" });
  });

  test("uses client local date only when no explicit or relative date exists", () => {
    expect(resolveActionDate({
      now,
      userTimeZone: "UTC",
      clientLocalDate: "2026-07-15",
      actionKind: "actual",
    })).toEqual({ status: "resolved", date: "2026-07-15" });
  });

  test("keeps missing dates and times unknown", () => {
    expect(resolveActionDate({ now, userTimeZone: "UTC", actionKind: "actual" })).toMatchObject({
      status: "needs_clarification",
    });
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-07-16", actionKind: "actual" }))
      .toEqual({ status: "resolved", date: "2026-07-16" });
  });

  test("resolves an interval to its user-local ending day", () => {
    const startMs = Date.parse("2026-07-16T23:30:00.000Z");
    const endMs = Date.parse("2026-07-17T01:30:00.000Z");
    expect(resolveIntervalDay({ startMs, endMs, userTimeZone: "UTC" })).toBe("2026-07-17");
  });

  test("rejects malformed explicit values", () => {
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-02-30", actionKind: "actual" }))
      .toMatchObject({ status: "rejected" });
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-07-16", explicitTime: "25:00", actionKind: "actual" }))
      .toMatchObject({ status: "rejected" });
  });
});
