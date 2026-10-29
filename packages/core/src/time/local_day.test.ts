import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  ageOnDate,
  dayNumber,
  dateOf,
  daysIn,
  daysBetween,
  inferSlot,
  instantAt,
  isValidTimeZone,
  localDate,
  localDateTime,
  nextLocalMidnight,
  slotAt,
  shiftMonth,
  weekdayOf,
  weekStart,
} from "./local_day.ts";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("IST midnight boundary", () => {
  it("resolves a local date and time through IST and DST", () => {
    expect(instantAt("2026-10-06", "08:15", IST)).toBe(at("2026-10-06T02:45:00Z"));
    expect(instantAt("2026-03-08", "03:30", NY)).toBe(at("2026-03-08T07:30:00Z"));
  });
  it("finds the next midnight to the millisecond, including month rollover", () => {
    expect(nextLocalMidnight(at("2026-10-31T18:29:59.999Z"), IST)).toBe(at("2026-10-31T18:30:00Z"));
    expect(nextLocalMidnight(at("2026-10-31T18:30:00Z"), IST)).toBe(at("2026-11-01T18:30:00Z"));
  });

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
  it("finds the next midnight after a 23-hour spring-forward day", () => {
    const start = at("2026-03-08T05:00:00Z");
    const next = nextLocalMidnight(start, NY);
    expect(next).toBe(at("2026-03-09T04:00:00Z"));
    expect(next - start).toBe(23 * 3_600_000);
    expect(localDate(next - 1, NY)).toBe("2026-03-08");
    expect(localDate(next, NY)).toBe("2026-03-09");
  });

  it("finds the next midnight after a 25-hour fall-back day", () => {
    const start = at("2026-11-01T04:00:00Z");
    const next = nextLocalMidnight(start, NY);
    expect(next).toBe(at("2026-11-02T05:00:00Z"));
    expect(next - start).toBe(25 * 3_600_000);
    expect(localDate(next - 1, NY)).toBe("2026-11-01");
    expect(localDate(next, NY)).toBe("2026-11-02");
  });

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
  it("counts age at the birthday and rejects invalid or implausible dates", () => {
    expect(ageOnDate("2000-10-15", "2026-10-14")).toBe(25);
    expect(ageOnDate("2000-10-15", "2026-10-15")).toBe(26);
    expect(ageOnDate("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOnDate("2000-02-29", "2026-03-01")).toBe(26);
    for (const dob of [undefined, "2001-02-29", "2027-01-01", "1896-01-01"]) {
      expect(ageOnDate(dob, "2026-10-15")).toBeNull();
    }
    expect(ageOnDate("2000-01-01", "invalid")).toBeNull();
  });

  it("builds calendar months across year and leap-year boundaries", () => {
    expect(dateOf({ year: 2026, month: 1 }, 5)).toBe("2026-01-05");
    expect(daysIn({ year: 2026, month: 2 })).toBe(28);
    expect(daysIn({ year: 2028, month: 2 })).toBe(29);
    expect(daysIn({ year: 2026, month: 9 })).toBe(30);
    expect(daysIn({ year: 2026, month: 12 })).toBe(31);
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(() => daysIn({ year: 2026, month: 13 })).toThrow(RangeError);
  });

  it("finds weekdays on both sides of the epoch and rejects invalid dates", () => {
    expect(weekdayOf("1970-01-01")).toBe(4);
    expect(weekdayOf("1969-12-28")).toBe(0);
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(() => weekdayOf("2026-02-30")).toThrow(RangeError);
    expect(() => weekdayOf("2026-2-01")).toThrow(RangeError);
  });

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
