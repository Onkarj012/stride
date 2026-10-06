import { roundNutrients, scaleNutrients, sumNutrients, totalNutrients, type Nutrients } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const RICE: Nutrients = { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 };
const DAL: Nutrients = { kcal: 116.3, protein: 9.02, carbs: 20.13, fat: 0.38, fiber: 7.9, sugar: 1.8, sodiumMg: 2 };
const GHEE: Nutrients = { kcal: 876, protein: 0.28, carbs: 0, fat: 99.48, fiber: null, sugar: null, sodiumMg: null };

// 2026-10-05 23:30 and 2026-10-06 00:30 in Asia/Kolkata (UTC+5:30).
const IST_2330 = Date.UTC(2026, 9, 5, 18, 0);
const IST_0030 = Date.UTC(2026, 9, 5, 19, 0);
const IST_LUNCH = Date.UTC(2026, 9, 5, 7, 30); // 13:00 IST on 2026-10-05

/** A test backend with one signed-in user in IST and three foods. */
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  const ids = await t.run(async (ctx) => {
    const insert = (name: string, per100g: Nutrients, sourceId: string) =>
      ctx.db.insert("foods", { name, aliases: [], searchText: name, per100g, source: "fdc", sourceId, verified: true });
    return {
      rice: await insert("Rice, cooked", RICE, "1"),
      dal: await insert("Dal, cooked", DAL, "2"),
      ghee: await insert("Ghee", GHEE, "3"),
    };
  });
  return { t, user, ...ids };
}

/** Every entries row for one user, oldest first. */
async function allRows(t: TestConvex<typeof schema>): Promise<Doc<"entries">[]> {
  return await t.run((ctx) => ctx.db.query("entries").take(1000));
}

/** Expected day totals: live heads of the day, scaled from today's foods table, summed unrounded, rounded once. */
async function expectedTotals(t: TestConvex<typeof schema>, localDate: string): Promise<Nutrients> {
  return await t.run(async (ctx) => {
    const live = await ctx.db
      .query("entries")
      .withIndex("by_userId_and_localDate_and_status", (q) =>
        q.eq("userId", "user_a").eq("localDate", localDate).eq("status", "live"),
      )
      .take(1000);
    const items: { per100g: Nutrients; grams: number }[] = [];
    for (const row of live) {
      const food = await ctx.db.get("foods", row.foodId);
      if (food === null) throw new Error("missing food");
      items.push({ per100g: food.per100g, grams: row.grams });
    }
    return totalNutrients(items);
  });
}

describe("time zone resolver", () => {
  test("rejects unknown zones and refuses to log before a zone is set", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "no_zone" });
    await expect(user.mutation(api.time_zone.setTimeZone, { timeZone: "Mars/Olympus" })).rejects.toThrow(/Unknown time zone/);
    const foodId = await t.run((ctx) =>
      ctx.db.insert("foods", { name: "Rice", aliases: [], searchText: "Rice", per100g: RICE, source: "fdc", sourceId: "1", verified: true }),
    );
    await expect(
      user.mutation(api.entries.addEntries, { submissionId: "s1", items: [{ foodId, grams: 100, source: "db" }] }),
    ).rejects.toThrow(/Time zone not set/);
  });

  test("23:30 and 00:30 IST land on different local days and slots", async () => {
    const { user, rice } = await setup();
    const [late, early] = await user.mutation(api.entries.addEntries, {
      submissionId: "s1",
      items: [
        { foodId: rice, grams: 100, source: "db", loggedAt: IST_2330 },
        { foodId: rice, grams: 100, source: "db", loggedAt: IST_0030 },
      ],
    });
    const day1 = await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" });
    const day2 = await user.query(api.entries.entriesForDay, { localDate: "2026-10-06" });
    expect(day1.map((e) => [e._id, e.slot])).toEqual([[late, "dinner"]]);
    expect(day2.map((e) => [e._id, e.slot])).toEqual([[early, "breakfast"]]);
  });

  test("setTimeZone refreshes the zone used for new entries", async () => {
    const { user, rice } = await setup();
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "UTC" });
    await user.mutation(api.entries.addEntries, {
      submissionId: "s1",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_0030 }],
    });
    const day = await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" });
    expect(day).toHaveLength(1);
  });
});

describe("addEntries", () => {
  test("same submissionId twice writes one set of entries", async () => {
    const { t, user, rice, dal } = await setup();
    const args = {
      submissionId: "sub-1",
      items: [
        { foodId: rice, grams: 150, source: "db" as const, loggedAt: IST_LUNCH },
        { foodId: dal, grams: 200, source: "db" as const, loggedAt: IST_LUNCH },
      ],
    };
    const first = await user.mutation(api.entries.addEntries, args);
    const second = await user.mutation(api.entries.addEntries, args);
    expect(second).toEqual(first);
    expect(await allRows(t)).toHaveLength(2);
    const totals = await user.query(api.day_totals.dayTotals, { localDate: "2026-10-05" });
    expect(totals.entryCount).toBe(2);
    expect(totals.nutrients).toEqual(await expectedTotals(t, "2026-10-05"));
  });

  test("kcal is reproducible from foods per 100 g × grams", async () => {
    const { t, user, dal } = await setup();
    const [id] = await user.mutation(api.entries.addEntries, {
      submissionId: "s1",
      items: [{ foodId: dal, grams: 237, source: "db", loggedAt: IST_LUNCH }],
    });
    const row = await t.run((ctx) => ctx.db.get("entries", id));
    expect(row?.nutrients).toEqual(scaleNutrients(DAL, 237));
    const [view] = await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" });
    expect(view?.nutrients.kcal).toBe(totalNutrients([{ per100g: DAL, grams: 237 }]).kcal);
    expect(view?.nutrients.kcal).toBe(276);
  });

  test("clients cannot send nutrient numbers", async () => {
    const { user, rice } = await setup();
    await expect(
      user.mutation(api.entries.addEntries, {
        submissionId: "s1",
        // @ts-expect-error nutrients are not part of the item validator
        items: [{ foodId: rice, grams: 100, source: "db", kcal: 999 }],
      }),
    ).rejects.toThrow(/kcal/);
  });

  test("rejects bad grams, bad dates and empty batches", async () => {
    const { user, rice } = await setup();
    await expect(
      user.mutation(api.entries.addEntries, { submissionId: "s1", items: [{ foodId: rice, grams: 0, source: "db" }] }),
    ).rejects.toThrow(/grams/);
    await expect(
      user.mutation(api.entries.addEntries, { submissionId: "s2", items: [{ foodId: rice, grams: 9000, source: "db" }] }),
    ).rejects.toThrow(/grams/);
    await expect(user.mutation(api.entries.addEntries, { submissionId: "s3", items: [] })).rejects.toThrow(/1-50 items/);
    await expect(
      user.mutation(api.entries.addEntries, {
        submissionId: "s4",
        items: [{ foodId: rice, grams: 100, source: "db", localDate: "2026-02-30" }],
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  test("explicit date and slot override the inferred ones", async () => {
    const { user, rice } = await setup();
    await user.mutation(api.entries.addEntries, {
      submissionId: "s1",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH, localDate: "2026-10-04", slot: "snack" }],
    });
    const [entry] = await user.query(api.entries.entriesForDay, { localDate: "2026-10-04" });
    expect(entry?.slot).toBe("snack");
  });
});

describe("revisions", () => {
  test("every mutation writes a new revision row and only marks the old one superseded", async () => {
    const { t, user, rice, dal } = await setup();
    const [rev1] = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH }],
    });
    const before = await t.run((ctx) => ctx.db.get("entries", rev1));
    const rev2 = await user.mutation(api.entries.editEntry, { submissionId: "edit", entryId: rev1, grams: 250, foodId: dal });
    const rev3 = await user.mutation(api.entries.deleteEntry, { submissionId: "del", entryId: rev2 });
    const rev4 = await user.mutation(api.entries.undoRevision, { submissionId: "undo", entryId: rev3 });

    const rows = await allRows(t);
    expect(rows.map((r) => [r.revision, r.op, r.status, r.supersedes ?? null])).toEqual([
      [1, "add", "superseded", null],
      [2, "edit", "superseded", rev1],
      [3, "delete", "superseded", rev2],
      [4, "undo", "live", rev3],
    ]);
    expect(rows[0]).toEqual({ ...before, status: "superseded" });
    expect(rows[2]?.deletedAt).toEqual(expect.any(Number));
    expect(rows[3]?._id).toBe(rev4);
    expect(rows[3]?.grams).toBe(250);
    expect(rows[3]?.foodName).toBe("Dal, cooked");
    expect(rows[3]?.deletedAt).toBeUndefined();
  });

  test("undo restores the prior revision's content", async () => {
    const { t, user, rice } = await setup();
    const [id] = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH }],
    });
    const edited = await user.mutation(api.entries.editEntry, {
      submissionId: "edit",
      entryId: id,
      grams: 300,
      slot: "dinner",
    });
    const restored = await user.mutation(api.entries.undoRevision, { submissionId: "undo", entryId: edited });
    const [orig, now] = await t.run(async (ctx) => [
      await ctx.db.get("entries", id),
      await ctx.db.get("entries", restored),
    ]);
    expect(now?.grams).toBe(100);
    expect(now?.slot).toBe(orig?.slot);
    expect(now?.nutrients).toEqual(orig?.nutrients);
    const day = await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" });
    expect(day.map((e) => e._id)).toEqual([restored]);
  });

  test("undoing an add deletes the entry, and undoing that brings it back", async () => {
    const { user, rice } = await setup();
    const [id] = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH }],
    });
    const gone = await user.mutation(api.entries.undoRevision, { submissionId: "u1", entryId: id });
    expect(await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" })).toEqual([]);
    const back = await user.mutation(api.entries.undoRevision, { submissionId: "u2", entryId: gone });
    expect((await user.query(api.entries.entriesForDay, { localDate: "2026-10-05" })).map((e) => e._id)).toEqual([back]);
  });

  test("stale revisions, other users and reused submission ids are rejected", async () => {
    const { t, user, rice } = await setup();
    const [rev1] = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH }],
    });
    const rev2 = await user.mutation(api.entries.editEntry, { submissionId: "e1", entryId: rev1, grams: 120 });
    await expect(user.mutation(api.entries.editEntry, { submissionId: "e2", entryId: rev1, grams: 130 })).rejects.toThrow(
      /newer revision/,
    );
    const other = t.withIdentity({ subject: "user_b" });
    await expect(other.mutation(api.entries.deleteEntry, { submissionId: "d1", entryId: rev2 })).rejects.toThrow(
      /not found/,
    );
    await expect(user.mutation(api.entries.deleteEntry, { submissionId: "add", entryId: rev2 })).rejects.toThrow(
      /different change/,
    );
  });

  test("retrying an edit, delete or undo with the same submissionId writes nothing new", async () => {
    const { t, user, rice } = await setup();
    const [id] = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [{ foodId: rice, grams: 100, source: "db", loggedAt: IST_LUNCH }],
    });
    const edit = { submissionId: "e1", entryId: id, grams: 120 };
    const rev2 = await user.mutation(api.entries.editEntry, edit);
    expect(await user.mutation(api.entries.editEntry, edit)).toBe(rev2);
    const del = { submissionId: "d1", entryId: rev2 };
    const rev3 = await user.mutation(api.entries.deleteEntry, del);
    expect(await user.mutation(api.entries.deleteEntry, del)).toBe(rev3);
    const undo = { submissionId: "u1", entryId: rev3 };
    const rev4 = await user.mutation(api.entries.undoRevision, undo);
    expect(await user.mutation(api.entries.undoRevision, undo)).toBe(rev4);
    expect(await allRows(t)).toHaveLength(4);
  });
});

describe("day totals", () => {
  test("equal live entries summed unrounded and rounded once through edit, delete, undo and date moves", async () => {
    const { t, user, rice, dal, ghee } = await setup();
    const days = ["2026-10-05", "2026-10-04"];

    /** Asserts both days' totals match an independent recompute from the foods table. */
    const check = async () => {
      for (const localDate of days) {
        const got = await user.query(api.day_totals.dayTotals, { localDate });
        expect(got.nutrients).toEqual(await expectedTotals(t, localDate));
      }
    };

    const ids = await user.mutation(api.entries.addEntries, {
      submissionId: "add",
      items: [
        { foodId: rice, grams: 187.3, source: "db", loggedAt: IST_LUNCH },
        { foodId: dal, grams: 143.7, source: "db", loggedAt: IST_LUNCH },
        { foodId: ghee, grams: 7.35, source: "db", loggedAt: IST_LUNCH },
      ],
    });
    await check();
    const ghee0 = await user.query(api.day_totals.dayTotals, { localDate: "2026-10-05" });
    expect(ghee0.nutrients.fiber).toBeNull();

    const riceEdit = await user.mutation(api.entries.editEntry, { submissionId: "e1", entryId: ids[0], grams: 211.9 });
    await check();
    const gheeGone = await user.mutation(api.entries.deleteEntry, { submissionId: "d1", entryId: ids[2] });
    await check();
    const noGhee = await user.query(api.day_totals.dayTotals, { localDate: "2026-10-05" });
    expect(noGhee.nutrients.fiber).not.toBeNull();
    expect(noGhee.nutrients).toEqual(
      roundNutrients(sumNutrients([scaleNutrients(RICE, 211.9), scaleNutrients(DAL, 143.7)])),
    );

    const dalMoved = await user.mutation(api.entries.editEntry, {
      submissionId: "e2",
      entryId: ids[1],
      localDate: "2026-10-04",
      foodId: rice,
    });
    await check();
    await user.mutation(api.entries.undoRevision, { submissionId: "u1", entryId: dalMoved });
    await check();
    await user.mutation(api.entries.undoRevision, { submissionId: "u2", entryId: gheeGone });
    await check();
    await user.mutation(api.entries.undoRevision, { submissionId: "u3", entryId: riceEdit });
    await check();

    const final = await user.query(api.day_totals.dayTotals, { localDate: "2026-10-05" });
    expect(final.entryCount).toBe(3);
    expect(final.nutrients).toEqual(
      totalNutrients([
        { per100g: RICE, grams: 187.3 },
        { per100g: DAL, grams: 143.7 },
        { per100g: GHEE, grams: 7.35 },
      ]),
    );
    const empty = await user.query(api.day_totals.dayTotals, { localDate: "2026-10-04" });
    expect(empty).toEqual({
      localDate: "2026-10-04",
      entryCount: 0,
      nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodiumMg: 0 },
    });
  });
});
