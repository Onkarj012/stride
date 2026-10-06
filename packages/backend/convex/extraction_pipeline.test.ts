import { roundNutrients, scaleNutrients, type Nutrients } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { MAX_TOOL_ITERATIONS } from "./pipeline/tools";
import { isRecord, OPENROUTER_CHAT_URL, PHOTO_MODEL, PIPELINE_MODEL } from "./pipeline/openrouter";
import { UNDO_WINDOW_MS } from "./pipeline/resolve";
import { AI_INPUT_LIMITS } from "./ai_guard";

const modules = import.meta.glob("./**/*.*s");

/** FDC 171844 chapati/roti per 100 g. */
const CHAPATI: Nutrients = { kcal: 297, protein: 11.25, carbs: 46.36, fat: 7.45, fiber: 4.9, sugar: 2.72, sodiumMg: 409 };
const RICE: Nutrients = { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 };
const DAL: Nutrients = { kcal: 116.3, protein: 9.02, carbs: 20.13, fat: 0.38, fiber: 7.9, sugar: 1.8, sodiumMg: 2 };
const PANEER: Nutrients = { kcal: 321, protein: 25, carbs: 3.6, fat: 25, fiber: null, sugar: null, sodiumMg: null };
const PANEER_TIKKA: Nutrients = { kcal: 300, protein: 18, carbs: 8, fat: 22, fiber: null, sugar: null, sodiumMg: null };
const BIRYANI: Nutrients = { kcal: 180, protein: 8, carbs: 22, fat: 6.5, fiber: 1, sugar: 1, sodiumMg: 300 };
const OIL: Nutrients = { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, sodiumMg: 0 };
const HOMEMADE_PANEER: Nutrients = { kcal: 260, protein: 18, carbs: 4, fat: 19, fiber: null, sugar: null, sodiumMg: null };

/** One mocked model reply: text and/or tool calls. */
interface LlmReply {
  content?: string | null;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}
type RequestBody = Record<string, unknown>;

let llm: (body: RequestBody) => LlmReply;
let openRouterBodies: RequestBody[];
let offRequests: string[];
let offProducts: Record<string, unknown>;

/** The model's routes in a request: structured extraction, the D14 tool pass, or a chat turn. */
function kind(body: RequestBody): "extract" | "resolve" | "chat" {
  if (body.response_format !== undefined) return "extract";
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const names = tools.flatMap((t) => (isRecord(t) && isRecord(t.function) && typeof t.function.name === "string" ? [t.function.name] : []));
  return names.includes("choose_food") ? "resolve" : "chat";
}

/** A JSON response object. */
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

/** Mocked fetch for OpenRouter, Groq and Open Food Facts. Nothing reaches the network. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === OPENROUTER_CHAT_URL) {
    const body: unknown = JSON.parse(String(init?.body));
    if (!isRecord(body)) throw new Error("bad body");
    openRouterBodies.push(body);
    const reply = llm(body);
    const toolCalls = (reply.toolCalls ?? []).map((call, i) => ({
      id: `call_${openRouterBodies.length}_${i}`,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    }));
    return json({
      choices: [{ message: { content: reply.content ?? null, tool_calls: toolCalls }, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 200, completion_tokens: 40 },
    });
  }
  if (url.startsWith("https://api.groq.com/")) return json({ text: "2 rotis" });
  if (url.startsWith("https://world.openfoodfacts.org/")) {
    offRequests.push(url);
    const code = /product\/(\d+)\.json/.exec(url)?.[1] ?? "";
    const product = offProducts[code];
    return product === undefined ? json({ status: 0 }, 404) : json({ status: 1, product });
  }
  throw new Error(`Unexpected fetch: ${url}`);
}

/** An extraction reply. Extra fields such as kcal or grams are what a misbehaving model might add. */
function extraction(items: Record<string, unknown>[]): LlmReply {
  const full = items.map((item) => ({
    quantity: 1,
    unit: null,
    slot: null,
    date: null,
    fromPhoto: false,
    portionScale: null,
    cookingOil: false,
    confidence: 0.95,
    ...item,
  }));
  return { content: JSON.stringify({ items: full }) };
}

beforeEach(() => {
  openRouterBodies = [];
  offRequests = [];
  offProducts = {};
  llm = () => ({ content: "done" });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("GROQ_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type Foods = Record<"chapati" | "rice" | "dal" | "paneer" | "tikka" | "biryani" | "oil", Id<"foods">>;

/** A backend with one IST user and a small food table. */
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  const foods: Foods = await t.run(async (ctx) => {
    const insert = (name: string, per100g: Nutrients, sourceId: string, aliases: string[] = []) =>
      ctx.db.insert("foods", {
        name,
        aliases,
        searchText: [name, ...aliases].join(" "),
        per100g,
        source: "fdc",
        sourceId,
        verified: true,
      });
    return {
      chapati: await insert("Chapati", CHAPATI, "1", ["roti"]),
      rice: await insert("Rice, white, cooked", RICE, "2"),
      dal: await insert("Dal, cooked", DAL, "3"),
      paneer: await insert("Paneer", PANEER, "4"),
      tikka: await insert("Paneer tikka", PANEER_TIKKA, "5"),
      biryani: await insert("Biryani, chicken", BIRYANI, "6"),
      oil: await insert("Oil, sunflower", OIL, "7"),
    };
  });
  return { t, user, foods };
}

/** Every entries row, oldest first. */
async function entryRows(t: TestConvex<typeof schema>): Promise<Doc<"entries">[]> {
  return await t.run((ctx) => ctx.db.query("entries").take(500));
}

/** Asserts each entry's nutrients are exactly `foods.per100g × grams` from core: no model number was stored. */
async function expectComputedFromFoods(t: TestConvex<typeof schema>): Promise<void> {
  const rows = await entryRows(t);
  for (const row of rows) {
    const food = await t.run((ctx) => ctx.db.get("foods", row.foodId));
    if (food === null) throw new Error("missing food");
    expect(row.nutrients).toEqual(scaleNutrients(food.per100g, row.grams));
  }
}

/** Logs text through the input bar. */
function logText(user: ReturnType<TestConvex<typeof schema>["withIdentity"]>, text: string, submissionId = "sub-1") {
  return user.action(api.pipeline.log.logInput, { submissionId, input: { kind: "text", text } });
}

describe("gate: auto-commit vs draft", () => {
  test("every item passes, so entries commit with an undo window and nutrients from foods × grams", async () => {
    const { t, user, foods } = await setup();
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "roti", quantity: 2, kcal: 9999, grams: 1 }]) : { content: "" });
    const result = await logText(user, "2 rotis");

    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") return;
    const rows = await entryRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ foodId: foods.chapati, grams: 80, source: "db", createdBy: "ai", status: "live" });
    expect(result.undoUntil).toBe((rows[0]?._creationTime ?? 0) + UNDO_WINDOW_MS);
    expect(result.lines).toEqual([
      { text: "Chapati", foodName: "Chapati", grams: 80, kcal: 238, reasons: [], estimated: false },
    ]);
    await expectComputedFromFoods(t);
    expect(JSON.stringify(rows)).not.toContain("9999");
  });

  test("a low-confidence portion sends the log to a draft, writing no entries", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 1, unit: "plate" }]);
    const result = await logText(user, "a plate of paneer tikka");

    expect(result.kind).toBe("draft");
    expect(await entryRows(t)).toHaveLength(0);
    if (result.kind !== "draft") return;
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]).toMatchObject({
      text: "paneer tikka",
      food: { _id: foods.tikka },
      grams: null,
      unresolved: "food_specific_measure",
      preview: null,
    });
    expect(draft?.items[0]?.reasons).toContain("unresolved_portion");
  });
});

describe("HANDOFF #1: a correction made in the draft card is what gets stored", () => {
  test("300 kcal corrected to 600 kcal stores 600 kcal, recomputed from foods", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 1, unit: "plate" }]);
    const result = await logText(user, "a plate of paneer tikka");
    if (result.kind !== "draft") throw new Error("expected a draft");

    const confirmed = await user.mutation(api.pipeline.drafts.confirmDraft, {
      draftId: result.draftId,
      corrections: [{ index: 0, kcal: 600 }],
    });
    expect(confirmed.kind).toBe("committed");
    const [row] = await entryRows(t);
    expect(row?.grams).toBeCloseTo(200, 9);
    expect(roundNutrients(row?.nutrients ?? PANEER).kcal).toBe(600);
    expect(row?.flags).toContain("user_corrected");
    await expectComputedFromFoods(t);
    const totals = await user.query(api.day_totals.dayTotals, {});
    expect(totals.nutrients.kcal).toBe(600);
  });

  test("a grams correction replaces the resolved grams", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 1, unit: "plate" }]);
    const result = await logText(user, "a plate of paneer tikka");
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, grams: 150 }] });
    const [row] = await entryRows(t);
    expect(row?.grams).toBe(150);
    expect(roundNutrients(row?.nutrients ?? PANEER).kcal).toBe(450);
  });

  test("a unit correction alone recomputes grams", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 100, unit: "plate" }]);
    const result = await logText(user, "100 plate paneer tikka");
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, unit: "g" }] });
    const [row] = await entryRows(t);
    expect(row?.grams).toBe(100);
  });

  test("confirming twice returns the same entries and a discarded draft cannot be confirmed", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 1, unit: "plate" }]);
    const first = await logText(user, "plate of tikka", "sub-a");
    const second = await logText(user, "plate of tikka again", "sub-b");
    if (first.kind !== "draft" || second.kind !== "draft") throw new Error("expected drafts");
    const a = await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId, corrections: [{ index: 0, grams: 100 }] });
    const b = await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId });
    expect(b).toEqual(a);
    expect(await entryRows(t)).toHaveLength(1);
    await user.mutation(api.pipeline.drafts.discardDraft, { draftId: second.draftId });
    await expect(user.mutation(api.pipeline.drafts.confirmDraft, { draftId: second.draftId })).rejects.toThrow(/discarded/);
  });
});

describe("HANDOFF #4: an unresolved food never contributes 0 kcal silently", () => {
  test("the unmatched item stays in the draft, asks, and must be fixed or removed", async () => {
    const { t, user, foods } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "rice", quantity: 1, unit: "katori" }, { food: "mystery sabzi", quantity: 1, unit: "katori" }])
        : { content: "I could not find it." };
    const result = await logText(user, "a katori of rice and a katori of mystery sabzi");

    if (result.kind !== "draft") throw new Error("expected a draft");
    expect(await entryRows(t)).toHaveLength(0);
    expect(result.lines[1]).toMatchObject({ text: "mystery sabzi", foodName: null, kcal: null });
    expect(result.lines[1]?.reasons).toContain("unmatched");
    expect(openRouterBodies.map(kind)).toEqual(["extract", "resolve"]);

    await expect(user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId })).rejects.toThrow(/needs a food/);
    expect(await entryRows(t)).toHaveLength(0);

    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 1, remove: true }] });
    const rows = await entryRows(t);
    expect(rows.map((r) => r.foodId)).toEqual([foods.rice]);
    expect(rows[0]?.grams).toBeCloseTo(150 * 0.668, 9);
  });

  test("the tool pass may pick a food, which fills the draft but never auto-commits", async () => {
    const { t, user, foods } = await setup();
    llm = (body) => {
      if (kind(body) === "extract") return extraction([{ food: "cottage cheese", quantity: 100, unit: "g" }]);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const searched = messages.some((m) => isRecord(m) && m.role === "tool");
      if (!searched) return { toolCalls: [{ name: "search_food", args: { query: "paneer" } }] };
      return {
        toolCalls: [
          { name: "choose_food", args: { item_index: 0, food_id: "made-up-id" } },
          { name: "choose_food", args: { item_index: 0, food_id: foods.paneer } },
        ],
      };
    };
    const result = await logText(user, "100 g cottage cheese");
    if (result.kind !== "draft") throw new Error("expected a draft");
    expect(await entryRows(t)).toHaveLength(0);
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]).toMatchObject({ food: { _id: foods.paneer }, grams: 100 });
    expect(draft?.items[0]?.reasons).toContain("low_match");
    expect(openRouterBodies.map(kind)).toEqual(["extract", "resolve", "resolve"]);
  });
});

describe("D14 tool loop", () => {
  test("stops after MAX_TOOL_ITERATIONS model calls even if the model keeps calling tools", async () => {
    const { user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "zzz unknown dish" }])
        : { toolCalls: [{ name: "search_food", args: { query: "zzz" } }] };
    const result = await logText(user, "zzz unknown dish");
    expect(result.kind).toBe("draft");
    expect(openRouterBodies.filter((b) => kind(b) === "resolve")).toHaveLength(MAX_TOOL_ITERATIONS);
  });
});

describe("HANDOFF #6: recipe fraction and cooking oil are applied explicitly", () => {
  test("a quarter of a 1 kg biryani logs 250 g, and named oil is its own flagged entry", async () => {
    const { t, user, foods } = await setup();
    llm = () =>
      extraction([
        { food: "biryani", quantity: 1, unit: "kg", portionScale: 0.25 },
        { food: "oil", quantity: 1, unit: "tbsp", cookingOil: true },
      ]);
    const result = await logText(user, "a quarter of the 1 kg biryani, made with 1 tbsp oil");
    expect(result.kind).toBe("committed");
    const rows = await entryRows(t);
    const biryani = rows.find((r) => r.foodId === foods.biryani);
    const oil = rows.find((r) => r.foodId === foods.oil);
    expect(biryani?.grams).toBeCloseTo(250, 9);
    expect(biryani?.flags).toContain("portion_scale");
    expect(oil?.grams).toBeCloseTo(15 * 0.913, 9);
    expect(oil?.flags).toContain("cooking_oil");
    await expectComputedFromFoods(t);
  });

  test("a fraction above the whole recipe is refused and asks", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "biryani", quantity: 1, unit: "kg", portionScale: 4 }]);
    const result = await logText(user, "biryani");
    expect(result.kind).toBe("draft");
    expect(result.lines[0]?.reasons).toContain("invalid_portion_scale");
    expect(await entryRows(t)).toHaveLength(0);
  });

  test("a refused fraction does not scale the grams when the draft's food is changed", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "biryani", quantity: 1, unit: "kg", portionScale: 4 }]);
    const result = await logText(user, "biryani");
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, foodId: foods.rice }] });
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.rice, grams: 1000 });
    expect(row?.flags).not.toContain("portion_scale");
  });
});

describe("HANDOFF #7: rejected or deleted memories are never used", () => {
  test("only active food memories steer the matcher; old macro memories are ignored", async () => {
    const { t, user, foods } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("food_links", { userId: "user_a", key: "dal", foodId: foods.paneer, status: "rejected", uses: 5, updatedAt: now });
      await ctx.db.insert("food_links", { userId: "user_a", key: "dal", foodId: foods.biryani, status: "deleted", uses: 9, updatedAt: now });
      // Pre-restart meal memory with AI-estimated macros. The new pipeline must not read it.
      await ctx.db.insert("food_memory", {
        userId: "user_a",
        normalizedName: "dal",
        displayName: "Dal",
        aliases: [],
        kcal: 600,
        protein: 1,
        carbs: 1,
        fat: 1,
        timesLogged: 9,
        source: "learned",
        lastUsedDate: "2026-10-01",
        approvalStatus: "approved",
      });
    });
    llm = () => extraction([{ food: "dal", quantity: 100, unit: "g" }]);
    await logText(user, "100 g dal");
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.dal, source: "db" });
    expect(roundNutrients(row?.nutrients ?? DAL).kcal).toBe(116);
  });

  test("a confirmed choice becomes memory, a deleted memory stops matching", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g" }]);
    const first = await logText(user, "100 g ghar ka paneer", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId, corrections: [{ index: 0, foodId: foods.paneer }] });

    const second = await logText(user, "100 g ghar ka paneer", "sub-2");
    expect(second.kind).toBe("committed");
    expect((await entryRows(t)).at(-1)).toMatchObject({ foodId: foods.paneer, source: "memory", grams: 100 });

    const [link] = await user.query(api.pipeline.drafts.listFoodLinks, {});
    if (link === undefined) throw new Error("expected a memory");
    await user.mutation(api.pipeline.drafts.forgetFoodLink, { linkId: link._id });
    const third = await logText(user, "100 g ghar ka paneer", "sub-3");
    expect(third.kind).toBe("draft");
  });

  test("picking a different food rejects the old memory", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.tikka, status: "active", uses: 1, updatedAt: 1 }),
    );
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 1, unit: "plate" }]);
    const result = await logText(user, "a plate of ghar ka paneer");
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, {
      draftId: result.draftId,
      corrections: [{ index: 0, foodId: foods.paneer, grams: 100 }],
    });
    const links = await t.run((ctx) => ctx.db.query("food_links").take(10));
    expect(links.find((l) => l.foodId === foods.tikka)?.status).toBe("rejected");
    expect(links.find((l) => l.foodId === foods.paneer)?.status).toBe("active");
  });
});

describe("HANDOFF #8: personal foods resolve before generic records", () => {
  test("'200 g paneer' logs the user's homemade paneer, not the generic record", async () => {
    const { t, user, foods } = await setup();
    const mine = await user.mutation(api.foods_db.createUserFood, { name: "Paneer (homemade)", per100g: HOMEMADE_PANEER });
    llm = () => extraction([{ food: "paneer", quantity: 200, unit: "g" }]);
    const result = await logText(user, "200 g paneer");
    expect(result.kind).toBe("committed");
    const [row] = await entryRows(t);
    expect(row?.foodId).toBe(mine);
    expect(row?.foodId).not.toBe(foods.paneer);
    expect(roundNutrients(row?.nutrients ?? PANEER).kcal).toBe(520);
  });

  test("another user's personal food is never matched or searchable", async () => {
    const { t, user, foods } = await setup();
    await t.withIdentity({ subject: "user_b" }).mutation(api.foods_db.createUserFood, { name: "Paneer", per100g: HOMEMADE_PANEER });
    llm = () => extraction([{ food: "paneer", quantity: 200, unit: "g" }]);
    await logText(user, "200 g paneer");
    const [row] = await entryRows(t);
    expect(row?.foodId).toBe(foods.paneer);
    const found = await user.query(api.foods_db.searchFoods, { query: "paneer" });
    expect(found.every((f) => f.source !== "user")).toBe(true);
  });
});

describe("search keeps shared foods visible", () => {
  test("many private foods from another user never hide a shared match", async () => {
    const t = convexTest(schema, modules);
    const other = t.withIdentity({ subject: "user_b" });
    for (let i = 0; i < 30; i++) await other.mutation(api.foods_db.createUserFood, { name: `Paneer ${i}`, per100g: HOMEMADE_PANEER });
    const shared = await t.run((ctx) =>
      ctx.db.insert("foods", {
        name: "Paneer",
        aliases: [],
        searchText: "Paneer",
        per100g: PANEER,
        source: "fdc",
        sourceId: "4",
        verified: true,
      }),
    );
    const user = t.withIdentity({ subject: "user_a" });
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });

    const found = await user.query(api.foods_db.searchFoods, { query: "paneer" });
    expect(found.map((f) => f._id)).toEqual([shared]);
    llm = () => extraction([{ food: "paneer", quantity: 200, unit: "g" }]);
    await logText(user, "200 g paneer");
    expect((await entryRows(t))[0]?.foodId).toBe(shared);
  });
});

describe("HANDOFF #14: barcode servings in ml use density, never read as grams", () => {
  test("a 250 ml milk serving becomes 257.75 g; the product is cached after one fetch", async () => {
    const { user } = await setup();
    offProducts["8901262150231"] = {
      product_name: "Toned milk",
      brands: "Amul",
      serving_quantity: 250,
      serving_quantity_unit: "ml",
      nutriments: { "energy-kcal_100g": 58, proteins_100g: 3.1, carbohydrates_100g: 4.7, fat_100g: 3, sodium_100g: 0.05 },
    };
    const first = await user.action(api.pipeline.barcode.lookupBarcode, { barcode: "8901262150231" });
    expect(first?.servingGrams).toBeCloseTo(250 * 1.031, 9);
    expect(first?.servingGrams).not.toBe(250);
    expect(first?.per100g.sodiumMg).toBeCloseTo(50, 9);
    const second = await user.action(api.pipeline.barcode.lookupBarcode, { barcode: "8901262150231" });
    expect(second).toEqual(first);
    expect(offRequests).toHaveLength(1);
  });

  test("an ml serving with no known density has no serving grams instead of a 1 g/ml guess", async () => {
    const { user } = await setup();
    offProducts["5449000000996"] = {
      product_name: "Cola",
      serving_quantity: 330,
      serving_quantity_unit: "ml",
      nutriments: { "energy-kj_100g": 180, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 },
    };
    const product = await user.action(api.pipeline.barcode.lookupBarcode, { barcode: "5449000000996" });
    expect(product?.servingGrams).toBeNull();
    expect(product?.per100g.kcal).toBeCloseTo(180 / 4.184, 9);
  });

  test("unknown barcodes return null and bad input throws", async () => {
    const { user } = await setup();
    expect(await user.action(api.pipeline.barcode.lookupBarcode, { barcode: "00000000" })).toBeNull();
    await expect(user.action(api.pipeline.barcode.lookupBarcode, { barcode: "abc" })).rejects.toThrow(/8-14 digits/);
  });
});

describe("idempotency and budget", () => {
  test("the same submissionId twice gives one result and one model call", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2 }]);
    const a = await logText(user, "2 rotis", "same");
    const b = await logText(user, "2 rotis", "same");
    expect(b).toEqual(a);
    expect(await entryRows(t)).toHaveLength(1);
    expect(openRouterBodies).toHaveLength(1);
  });

  test("a retried draft submission returns the same draft", async () => {
    const { t, user } = await setup();
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "zzz" }]) : { content: "" });
    const a = await logText(user, "zzz", "same");
    const b = await logText(user, "zzz", "same");
    expect(b).toEqual(a);
    expect(await t.run((ctx) => ctx.db.query("drafts").take(10))).toHaveLength(1);
  });

  test("every LLM call reserves budget first and settles it", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract" ? extraction([{ food: "zzz" }]) : { toolCalls: [{ name: "get_user_foods", args: {} }] };
    await logText(user, "zzz");
    const reservations = await t.run((ctx) => ctx.db.query("ai_usage_reservations").take(50));
    expect(openRouterBodies.length).toBe(1 + MAX_TOOL_ITERATIONS);
    expect(reservations).toHaveLength(openRouterBodies.length);
    expect(reservations.every((r) => r.state === "settled" && r.ownerKey === "user_a")).toBe(true);
    expect(reservations.map((r) => r.model)).toEqual(openRouterBodies.map(() => PIPELINE_MODEL));
  });

  test("a spent budget blocks the call before it reaches OpenRouter", async () => {
    const { t, user } = await setup();
    const day = new Date().toISOString().slice(0, 10);
    await t.run((ctx) =>
      ctx.db.insert("ai_usage_buckets", {
        scope: "user",
        ownerKey: "user_a",
        bucketKey: day,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 10,
        reservedCostUsd: 0,
        rateLimitTimestamps: [],
      }),
    );
    await expect(logText(user, "2 rotis")).rejects.toThrow(/BUDGET_EXCEEDED/);
    expect(openRouterBodies).toHaveLength(0);
  });
});

describe("photo and voice input", () => {
  test("photo items use the photo model and are flagged estimated", async () => {
    const { t, user, foods } = await setup();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    llm = () => extraction([{ food: "roti", quantity: 2, fromPhoto: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p1", input: { kind: "photo", storageId } });
    expect(result.kind).toBe("committed");
    expect(openRouterBodies[0]?.model).toBe(PHOTO_MODEL);
    expect(JSON.stringify(openRouterBodies[0]?.messages)).toContain("image_url");
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.chapati, flags: ["estimated"] });
    expect(result.lines[0]?.estimated).toBe(true);
  });

  test("an oversized photo is refused before any model call", async () => {
    const { t, user } = await setup();
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(AI_INPUT_LIMITS.imageBytes + 1)], { type: "image/jpeg" })),
    );
    await expect(
      user.action(api.pipeline.log.logInput, { submissionId: "p1", input: { kind: "photo", storageId } }),
    ).rejects.toThrow(/too large/);
    expect(openRouterBodies).toHaveLength(0);
  });

  test("voice is transcribed by Groq Whisper, under the budget guard, then logged", async () => {
    const { t, user, foods } = await setup();
    llm = (body) => {
      const text = JSON.stringify(body.messages);
      return extraction(text.includes("2 rotis") ? [{ food: "roti", quantity: 2 }] : []);
    };
    const result = await user.action(api.pipeline.log.logInput, {
      submissionId: "v1",
      input: { kind: "voice", audio: btoa("fake audio bytes"), mimeType: "audio/webm" },
    });
    expect(result.kind).toBe("committed");
    expect((await entryRows(t))[0]?.foodId).toBe(foods.chapati);
    const models = (await t.run((ctx) => ctx.db.query("ai_usage_reservations").take(10))).map((r) => r.model);
    expect(models).toEqual(["groq/whisper-large-v3-turbo", PIPELINE_MODEL]);
  });
});

describe("dates and slots", () => {
  test("a named past day lands on that day; a future day asks", async () => {
    const { t, user } = await setup();
    const today = await t.run(async () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    llm = () => extraction([{ food: "roti", quantity: 1, date: yesterday, slot: "dinner" }]);
    await logText(user, "1 roti last night", "d1");
    expect((await entryRows(t))[0]).toMatchObject({ localDate: yesterday, slot: "dinner" });

    llm = () => extraction([{ food: "roti", quantity: 1, date: tomorrow }]);
    const future = await logText(user, "1 roti tomorrow", "d2");
    expect(future.kind).toBe("draft");
    expect(future.lines[0]?.reasons).toContain("invalid_date");
  });

  test("a refused date must be replaced before the draft confirms", async () => {
    const { t, user } = await setup();
    const today = await t.run(async () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    llm = () => extraction([{ food: "roti", quantity: 1, date: tomorrow }]);
    const result = await logText(user, "1 roti tomorrow");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]).toMatchObject({ requestedDate: tomorrow, localDate: null });

    const confirm = (localDate?: string) =>
      user.mutation(api.pipeline.drafts.confirmDraft, {
        draftId: result.draftId,
        ...(localDate === undefined ? {} : { corrections: [{ index: 0, localDate }] }),
      });
    await expect(confirm()).rejects.toThrow(/Pick a date or remove it/);
    await expect(confirm(tomorrow)).rejects.toThrow(/within the last/);
    expect(await entryRows(t)).toHaveLength(0);
    await confirm(yesterday);
    expect((await entryRows(t))[0]?.localDate).toBe(yesterday);
  });

  test("a draft keeps the day and slot it was logged in when confirmed after midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-05T18:20:00Z")); // 23:50 IST
      const { t, user } = await setup();
      llm = () => extraction([{ food: "paneer tikka", quantity: 1, unit: "plate" }]);
      const result = await logText(user, "a plate of paneer tikka");
      if (result.kind !== "draft") throw new Error("expected a draft");

      vi.setSystemTime(new Date("2026-10-05T18:45:00Z")); // 00:15 IST the next day
      await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, grams: 150 }] });
      expect((await entryRows(t))[0]).toMatchObject({ localDate: "2026-10-05", slot: "dinner" });
    } finally {
      vi.useRealTimers();
    }
  });
});
