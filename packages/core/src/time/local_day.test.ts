import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dayNumber,
  daysBetween,
  inferSlot,
  isValidTimeZone,
  localDate,
  localDateTime,
  slotAt,
  weekStart,
} from "./local_day.ts";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("IST midnight boundary", () => {
  it("rolls the date at 18:30 UTC", () => {
    expect(localDate(at("2026-10-05T18:29:59.999Z"), IST)).toBe("2026-10-05");
    expect(localDate(at("2026-10-05T18:30:00.000Z"), IST)).toBe("2026-10-06");
  });

  it("puts 23:59 IST in dinner and 00:00 IST in next-day breakfast", () => {
    expect(slotAt(at("2026-10-05T18:29:00Z"), IST)).toBe("dinner");
    expect(localDateTime(at("2026-10-05T18:30:00Z"), IST)).toEqual({ date: "2026-10-06", hour: 0, minute: 0 });
    expect(slotAt(at("2026-10-05T18:30:00Z"), IST)).toBe("breakfast");
  });

  it("is a fixed +05:30 offset for any instant", () => {
    fc.assert(
      fc.property(fc.integer({ min: at("2000-01-01T00:00:00Z"), max: at("2100-01-01T00:00:00Z") }), (ms) => {
        expect(localDate(ms, IST)).toBe(new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10));
      }),
    );
  });
});

describe("DST boundaries in America/New_York", () => {
  it("handles spring forward on 2026-03-08 (02:00 EST jumps to 03:00 EDT)", () => {
    expect(localDateTime(at("2026-03-08T06:59:00Z"), NY)).toEqual({ date: "2026-03-08", hour: 1, minute: 59 });
    expect(localDateTime(at("2026-03-08T07:00:00Z"), NY)).toEqual({ date: "2026-03-08", hour: 3, minute: 0 });
    expect(localDate(at("2026-03-08T04:59:00Z"), NY)).toBe("2026-03-07");
    expect(localDate(at("2026-03-08T05:00:00Z"), NY)).toBe("2026-03-08");
  });

  it("handles fall back on 2026-11-01 (midnight is UTC-4 before, UTC-5 after)", () => {
    expect(localDate(at("2026-11-01T03:59:00Z"), NY)).toBe("2026-10-31");
    expect(localDate(at("2026-11-01T04:00:00Z"), NY)).toBe("2026-11-01");
    expect(localDateTime(at("2026-11-01T05:30:00Z"), NY)).toEqual({ date: "2026-11-01", hour: 1, minute: 30 });
    expect(localDateTime(at("2026-11-01T06:30:00Z"), NY)).toEqual({ date: "2026-11-01", hour: 1, minute: 30 });
    expect(localDate(at("2026-11-02T04:59:00Z"), NY)).toBe("2026-11-01");
    expect(localDate(at("2026-11-02T05:00:00Z"), NY)).toBe("2026-11-02");
  });
});

describe("inferSlot (D16)", () => {
  it("uses the documented boundaries", () => {
    expect(inferSlot(10, 59)).toBe("breakfast");
    expect(inferSlot(11, 0)).toBe("lunch");
    expect(inferSlot(15, 59)).toBe("lunch");
    expect(inferSlot(16, 0)).toBe("snack");
    expect(inferSlot(18, 59)).toBe("snack");
    expect(inferSlot(19, 0)).toBe("dinner");
    expect(inferSlot(0, 0)).toBe("breakfast");
  });
});

describe("date math", () => {
  it("validates dates and zones", () => {
    expect(dayNumber("2026-02-30")).toBeNull();
    expect(dayNumber("2028-02-29")).not.toBeNull();
    expect(dayNumber("2026-1-01")).toBeNull();
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("adds days across month and leap-year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-29")).toBe(28);
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-06")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("addDays and daysBetween are inverses", () => {
    const date = fc.date({ min: new Date("1990-01-01"), max: new Date("2090-01-01"), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10));
    fc.assert(
      fc.property(date, fc.integer({ min: -2000, max: 2000 }), (d, n) => {
        expect(daysBetween(d, addDays(d, n))).toBe(n);
        expect(weekStart(addDays(weekStart(d), 7))).toBe(addDays(weekStart(d), 7));
      }),
    );
  });
});
