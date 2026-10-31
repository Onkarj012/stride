import { roundNutrients, scaleNutrients, type Nutrients } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { estimateProblem, type Estimate, MAX_TOOL_ITERATIONS } from "./pipeline/tools";
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
  webSources?: { title: string; url: string }[];
  webSearchRequests?: number;
  omitWebSearchUsage?: boolean;
  /** Answer with this HTTP status and no body, for failures such as 402. */
  status?: number;
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
    if (reply.status !== undefined) return new Response("{}", { status: reply.status });
    const toolCalls = (reply.toolCalls ?? []).map((call, i) => ({
      id: `call_${openRouterBodies.length}_${i}`,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    }));
    return json({
      choices: [{
        message: {
          content: reply.content ?? null,
          tool_calls: toolCalls,
          annotations: reply.webSources?.map((source) => ({ type: "url_citation", url_citation: source })) ?? [],
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 40,
        ...(reply.omitWebSearchUsage ? {} : {
          server_tool_use: { web_search_requests: reply.webSearchRequests ?? (reply.webSources === undefined ? 0 : 1) },
        }),
      },
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
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ text: "Chapati", foodName: "Chapati", grams: 80, reasons: [], estimated: false });
    expect(result.lines[0]?.kcal).toBeCloseTo(237.6, 6);
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

describe("sugar double count warning", () => {
  /** Adds a "Tea" food with the given sugar per 100 g, and a "Sugar" food, to a backend. */
  async function teaAndSugar(t: TestConvex<typeof schema>, teaSugar: number): Promise<void> {
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Tea", aliases: [], searchText: "Tea", per100g: { ...RICE, sugar: teaSugar }, source: "fdc", sourceId: "8", verified: true });
      await ctx.db.insert("foods", { name: "Sugar", aliases: [], searchText: "Sugar", per100g: { ...RICE, sugar: 100 }, source: "fdc", sourceId: "9", verified: true });
    });
  }

  /** Two items in one log: 100 g of tea, then 5 g of sugar. */
  const teaWithSugar = [
    { food: "tea", quantity: 100, unit: "g" },
    { food: "sugar", quantity: 5, unit: "g" },
  ];

  test("a sweetened drink with a separate sugar item stays a draft, with the warning on the drink only", async () => {
    const { t, user } = await setup();
    await teaAndSugar(t, 5);
    llm = () => extraction(teaWithSugar);
    const result = await logText(user, "tea with sugar");

    expect(result.kind).toBe("draft");
    if (result.kind !== "draft") return;
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items.map((item) => item.reasons)).toEqual([["sugar_double_count"], ["sugar_separate"]]);
    expect(draft?.items.map((item) => item.grams)).toEqual([100, 5]);
  });

  test("an unsweetened drink with sugar commits with no warning", async () => {
    const { t, user } = await setup();
    await teaAndSugar(t, 0);
    llm = () => extraction(teaWithSugar);
    const result = await logText(user, "tea with sugar");

    expect(result.kind).toBe("committed");
    expect(result.lines.every((line) => line.reasons.length === 0)).toBe(true);
    expect(await entryRows(t)).toHaveLength(2);
  });

  test("confirming the sweetened draft as it is keeps both entries", async () => {
    const { t, user } = await setup();
    await teaAndSugar(t, 5);
    llm = () => extraction(teaWithSugar);
    const result = await logText(user, "tea with sugar");
    if (result.kind !== "draft") throw new Error("expected a draft");

    const confirmed = await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId });
    expect(confirmed.kind).toBe("committed");
    expect(await entryRows(t)).toHaveLength(2);
  });

  test("a drink alone gives no warning", async () => {
    const { t, user } = await setup();
    await teaAndSugar(t, 5);
    llm = () => extraction([{ food: "tea", quantity: 100, unit: "g" }]);
    const result = await logText(user, "tea");

    expect(result.kind).toBe("committed");
    expect(result.lines.every((line) => line.reasons.length === 0)).toBe(true);
  });

  test("a sugar word inside a drink name is not a separate sugar item", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Tea with sugar", aliases: [], searchText: "Tea with sugar", per100g: { ...RICE, sugar: 5 }, source: "fdc", sourceId: "8", verified: true });
      await ctx.db.insert("foods", { name: "Coffee", aliases: [], searchText: "Coffee", per100g: { ...RICE, sugar: 5 }, source: "fdc", sourceId: "9", verified: true });
    });
    llm = () => extraction([{ food: "tea with sugar", quantity: 100, unit: "g" }, { food: "coffee", quantity: 100, unit: "g" }]);
    const result = await logText(user, "tea with sugar and coffee");

    expect(result.lines.every((line) => !line.reasons.includes("sugar_double_count"))).toBe(true);
  });

  test("a sugar-free drink with a sugar-free sweetener name gives no warning", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Cola", aliases: [], searchText: "Cola", per100g: { ...RICE, sugar: 10 }, source: "fdc", sourceId: "8", verified: true });
      await ctx.db.insert("foods", { name: "Sugar-free cola", aliases: [], searchText: "Sugar-free cola", per100g: { ...RICE, sugar: 0 }, source: "fdc", sourceId: "9", verified: true });
      await ctx.db.insert("foods", { name: "Iced tea, no added sugar", aliases: [], searchText: "Iced tea, no added sugar", per100g: { ...RICE, sugar: 5 }, source: "fdc", sourceId: "10", verified: true });
      await ctx.db.insert("foods", { name: "Sugar", aliases: [], searchText: "Sugar", per100g: { ...RICE, sugar: 100 }, source: "fdc", sourceId: "11", verified: true });
    });
    llm = () =>
      extraction([
        { food: "cola", quantity: 330, unit: "g" },
        { food: "sugar-free cola", quantity: 330, unit: "g" },
        { food: "iced tea, no added sugar", quantity: 200, unit: "g" },
        { food: "sugar", quantity: 5, unit: "g" },
      ]);
    const result = await logText(user, "cola, sugar-free cola, iced tea and sugar");

    // Only the sweet cola warns. The sugar-free cola and the no-added-sugar iced tea do not.
    expect(result.lines[0]?.reasons).toContain("sugar_double_count");
    expect(result.lines[1]?.reasons).not.toContain("sugar_double_count");
    expect(result.lines[2]?.reasons).not.toContain("sugar_double_count");
  });

  test("a solid food with a drink word, such as tea biscuits, is not a sweet drink", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Tea biscuits", aliases: [], searchText: "Tea biscuits", per100g: { ...RICE, sugar: 20 }, source: "fdc", sourceId: "8", verified: true });
      await ctx.db.insert("foods", { name: "Sugar", aliases: [], searchText: "Sugar", per100g: { ...RICE, sugar: 100 }, source: "fdc", sourceId: "9", verified: true });
    });
    llm = () => extraction([{ food: "tea biscuits", quantity: 50, unit: "g" }, { food: "sugar", quantity: 5, unit: "g" }]);
    const result = await logText(user, "tea biscuits with sugar");

    expect(result.lines.every((line) => !line.reasons.includes("sugar_double_count"))).toBe(true);
  });

  test("a solid food with a drink word, such as tea cookies, is not a sweet drink", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Tea cookies", aliases: [], searchText: "Tea cookies", per100g: { ...RICE, sugar: 20 }, source: "fdc", sourceId: "9", verified: true });
      await ctx.db.insert("foods", { name: "Sugar", aliases: [], searchText: "Sugar", per100g: { ...RICE, sugar: 100 }, source: "fdc", sourceId: "10", verified: true });
    });
    llm = () => extraction([{ food: "tea cookies", quantity: 50, unit: "g" }, { food: "sugar", quantity: 5, unit: "g" }]);
    const result = await logText(user, "tea cookies with sugar");

    expect(result.lines.every((line) => !line.reasons.includes("sugar_double_count"))).toBe(true);
  });

  test("a dish with honey in its name is not a standalone sweetener", async () => {
    const { t, user } = await setup();
    await teaAndSugar(t, 5);
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Honey roasted peanuts", aliases: [], searchText: "Honey roasted peanuts", per100g: { ...RICE, sugar: 10 }, source: "fdc", sourceId: "10", verified: true });
      await ctx.db.insert("foods", { name: "Sweetener", aliases: [], searchText: "Sweetener", per100g: { ...RICE, sugar: 0 }, source: "fdc", sourceId: "11", verified: true });
    });
    llm = () =>
      extraction([
        { food: "tea", quantity: 100, unit: "g" },
        { food: "honey roasted peanuts", quantity: 50, unit: "g" },
        { food: "sweetener", quantity: 1, unit: "g" },
      ]);
    const result = await logText(user, "tea, honey roasted peanuts and a sweetener");

    expect(result.lines.every((line) => !line.reasons.includes("sugar_double_count"))).toBe(true);
    expect(result.lines[0]?.reasons).not.toContain("sugar_separate");
  });

  test("caffeine-free cola with a separate sugar item still warns", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", { name: "Caffeine-free cola", aliases: [], searchText: "Caffeine-free cola", per100g: { ...RICE, sugar: 10 }, source: "fdc", sourceId: "8", verified: true });
      await ctx.db.insert("foods", { name: "Sugar", aliases: [], searchText: "Sugar", per100g: { ...RICE, sugar: 100 }, source: "fdc", sourceId: "9", verified: true });
    });
    await t.run((ctx) =>
      ctx.db.insert("foods", { name: "Chocolate milkshake", aliases: [], searchText: "Chocolate milkshake", per100g: { ...RICE, sugar: 10 }, source: "fdc", sourceId: "12", verified: true }),
    );
    llm = () =>
      extraction([
        { food: "caffeine-free cola", quantity: 330, unit: "g" },
        { food: "sugar", quantity: 5, unit: "g" },
        { food: "chocolate milkshake", quantity: 300, unit: "g" },
      ]);
    const result = await logText(user, "caffeine-free cola with sugar and a chocolate milkshake");

    expect(result.lines[0]?.reasons).toContain("sugar_double_count");
    expect(result.lines[2]?.reasons).toContain("sugar_double_count");
  });
});

describe("line kcal stays unrounded until the app displays it", () => {
  test("lines of 100.4 and 200.4 kcal come back unrounded, and their sum rounds to 301", async () => {
    const { t, user } = await setup();
    const food = (name: string, kcal: number) => ({ name, aliases: [], searchText: name, per100g: { kcal, protein: 0, carbs: 0, fat: 0, fiber: null, sugar: null, sodiumMg: null }, source: "fdc" as const, sourceId: name, verified: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("foods", food("Alpha Snack", 100.4));
      await ctx.db.insert("foods", food("Beta Snack", 200.4));
    });
    llm = () => extraction([{ food: "Alpha Snack", quantity: 100, unit: "g" }, { food: "Beta Snack", quantity: 100, unit: "g" }]);
    const result = await logText(user, "100 g alpha snack and 100 g beta snack", "unrounded-lines");
    // Either result kind carries lines built the same way; this food pair lands in a draft on the clamp check.
    const kcal = result.lines.map((line) => line.kcal ?? NaN).sort((a, b) => a - b);
    expect(kcal[0]).toBeCloseTo(100.4, 6);
    expect(kcal[1]).toBeCloseTo(200.4, 6);
    expect(Math.round((kcal[0] ?? 0) + (kcal[1] ?? 0))).toBe(301);
  });
});

describe("selected meal slot", () => {
  test("a composer default fills omitted slots, while an explicit extracted slot overrides it", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2 }, { food: "rice, white, cooked", quantity: 100, unit: "g", slot: "dinner" }]);
    const result = await user.action(api.pipeline.log.logInput, {
      submissionId: "breakfast-sheet",
      defaultSlot: "breakfast",
      input: { kind: "text", text: "2 rotis, and for dinner 100 g rice" },
    });
    expect(result.kind).toBe("committed");
    expect((await entryRows(t)).map((row) => row.slot)).toEqual(["breakfast", "dinner"]);
    expect(JSON.stringify(openRouterBodies[0]?.messages)).toContain("current meal slot is breakfast");
  });

  test("a draft keeps the selected default until confirmation", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "biryani, chicken", quantity: 1, unit: "kg", portionScale: 0.25, confidence: 0.5 }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "draft-slot", defaultSlot: "breakfast", input: { kind: "text", text: "quarter of 1 kg biryani" } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId });
    expect((await entryRows(t))[0]?.slot).toBe("breakfast");
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
        ? extraction([{ food: "rice, white, cooked", quantity: 1, unit: "katori" }, { food: "mystery sabzi", quantity: 1, unit: "katori" }])
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

  test("a partial database name is never saved, and the unresolved item keeps its row as a candidate", async () => {
    const { t, user, foods } = await setup();
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "rice", quantity: 100, unit: "g" }]) : { content: "I could not find it." });
    const result = await logText(user, "100 g rice");
    if (result.kind !== "draft") throw new Error("expected a draft");
    expect(await entryRows(t)).toHaveLength(0);
    const toolPass = openRouterBodies.find((b) => kind(b) === "resolve");
    expect(JSON.stringify(toolPass?.messages)).toContain(foods.rice);
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.food).toBeNull();
    expect(draft?.items[0]?.candidates).toEqual([{ _id: foods.rice, name: "Rice, white, cooked" }]);
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

  test("a tool pass that ends with no text and no tool calls still leaves a draft, with no warning", async () => {
    const { t, user } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "zzz unknown dish" }]) : { content: null });
    const result = await logText(user, "zzz unknown dish");
    expect(result.kind).toBe("draft");
    expect(await entryRows(t)).toHaveLength(0);
    expect(openRouterBodies.map(kind)).toEqual(["extract", "resolve"]);
    const resolveRequest = openRouterBodies.find((body) => kind(body) === "resolve");
    expect(Array.isArray(resolveRequest?.tools) && resolveRequest.tools.some((tool) => isRecord(tool) && tool.type === "openrouter:web_search")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("a provider error in the tool pass is logged as a warning and the log still becomes a draft", async () => {
    const { user } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    llm = (body) => {
      if (kind(body) === "extract") return extraction([{ food: "zzz unknown dish" }]);
      throw new Error("provider down");
    };
    const result = await logText(user, "zzz unknown dish");
    expect(result.kind).toBe("draft");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Tool pass failed"), "provider down");
    warn.mockRestore();
  });

  test("the app's OpenRouter account out of credits in the tool pass still leaves a draft", async () => {
    const { t, user } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "zzz unknown dish" }]) : { status: 402 });
    const result = await logText(user, "zzz unknown dish");
    expect(result.kind).toBe("draft");
    expect(openRouterBodies.map(kind)).toEqual(["extract", "resolve"]);
    expect(await entryRows(t)).toHaveLength(0);
    warn.mockRestore();
  });

  test("a guard rejection in the tool pass reaches the user even after extraction succeeded", async () => {
    const { t, user } = await setup();
    // 19 requests in the last few minutes: extraction is the 20th and fits, the tool pass is refused.
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("ai_usage_buckets", {
        scope: "user",
        ownerKey: "user_a",
        bucketKey: new Date(now).toISOString().slice(0, 10),
        requestCount: 19,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        reservedCostUsd: 0,
        rateLimitTimestamps: Array.from({ length: 19 }, () => now),
      }),
    );
    llm = (body) => (kind(body) === "extract" ? extraction([{ food: "zzz unknown dish" }]) : { content: null });
    await expect(logText(user, "zzz unknown dish")).rejects.toThrow(/RATE_LIMITED/);
    expect(openRouterBodies.map(kind)).toEqual(["extract"]);
    expect(await entryRows(t)).toHaveLength(0);
  });

  test("an extraction reply with no content still fails clearly", async () => {
    const { user } = await setup();
    llm = () => ({ content: null });
    await expect(logText(user, "2 rotis")).rejects.toThrow(/Extraction returned no content/);
  });
});

describe("HANDOFF #6: recipe fraction and cooking oil are applied explicitly", () => {
  test("a quarter of a 1 kg biryani logs 250 g, and named oil is its own flagged entry", async () => {
    const { t, user, foods } = await setup();
    llm = () =>
      extraction([
        { food: "biryani, chicken", quantity: 1, unit: "kg", portionScale: 0.25 },
        { food: "oil, sunflower", quantity: 1, unit: "tbsp", cookingOil: true },
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

  test("a scaled draft quantity preview can confirm its explicit grams without dropping the fraction", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "biryani, chicken", quantity: 1, unit: "kg", portionScale: 0.25, confidence: 0.5 }]);
    const result = await logText(user, "a quarter of 1 kg biryani");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    const item = draft?.items[0];
    if (item?.grams === null || item?.grams === undefined || !item.quantity) throw new Error("missing scaled portion");
    expect(item.grams).toBe(250);
    const previewGrams = item.grams * 1.5 / item.quantity;
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, grams: previewGrams }] });
    const [row] = await entryRows(t);
    expect(row?.grams).toBe(375);
    expect(row?.nutrients).toEqual(scaleNutrients(BIRYANI, previewGrams));
  });

  test("a fraction above the whole recipe is refused and asks", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "biryani, chicken", quantity: 1, unit: "kg", portionScale: 4 }]);
    const result = await logText(user, "biryani");
    expect(result.kind).toBe("draft");
    expect(result.lines[0]?.reasons).toContain("invalid_portion_scale");
    expect(await entryRows(t)).toHaveLength(0);
  });

  test("a refused fraction does not scale the grams when the draft's food is changed", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "biryani, chicken", quantity: 1, unit: "kg", portionScale: 4 }]);
    const result = await logText(user, "biryani");
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, foodId: foods.rice }] });
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.rice, grams: 1000 });
    expect(row?.flags).not.toContain("portion_scale");
  });
});

describe("HANDOFF #7: rejected or deleted memories are never used", () => {
  test("only active food links steer the matcher", async () => {
    const { t, user, foods } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("food_links", { userId: "user_a", key: "dal cooked", foodId: foods.paneer, status: "rejected", uses: 5, updatedAt: now });
      await ctx.db.insert("food_links", { userId: "user_a", key: "dal cooked", foodId: foods.biryani, status: "deleted", uses: 9, updatedAt: now });
    });
    llm = () => extraction([{ food: "dal, cooked", quantity: 100, unit: "g" }]);
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

  test("many old deleted memories never hide a newer confirmed choice", async () => {
    const { t, user, foods } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 12; i++) {
        await ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.paneer, status: "deleted", uses: 1, updatedAt: i });
      }
    });
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g" }]);
    const first = await logText(user, "100 g ghar ka paneer", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId, corrections: [{ index: 0, foodId: foods.paneer }] });

    const second = await logText(user, "100 g ghar ka paneer", "sub-2");
    expect(second.kind).toBe("committed");
    expect((await entryRows(t)).at(-1)).toMatchObject({ foodId: foods.paneer, source: "memory" });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toHaveLength(1);
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

describe("undo takes back the food memory a confirmation wrote", () => {
  type User = ReturnType<TestConvex<typeof schema>["withIdentity"]>;

  /** Logs text that lands on a draft and confirms it with the given food per item. Returns the confirmed entry ids. */
  async function confirmAs(user: User, text: string, submissionId: string, foodIds: Id<"foods">[]): Promise<Id<"entries">[]> {
    const draft = await logText(user, text, submissionId);
    if (draft.kind !== "draft") throw new Error("expected a draft");
    const result = await user.mutation(api.pipeline.drafts.confirmDraft, {
      draftId: draft.draftId,
      corrections: foodIds.map((foodId, index) => ({ index, foodId, grams: 100 })),
    });
    if (result.kind !== "committed") throw new Error("expected entries");
    return result.entryIds;
  }

  /** Every memory row, by food. */
  async function links(t: TestConvex<typeof schema>) {
    return await t.run((ctx) => ctx.db.query("food_links").take(50));
  }

  test("undoing the log removes the memory it created, so the text asks again", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g" }]);
    const [entryId] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    if (entryId === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId });

    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
    expect((await links(t)).map((l) => l.status)).toEqual(["deleted"]);
    expect((await logText(user, "100 g ghar ka paneer", "sub-2")).kind).toBe("draft");
  });

  test("undoing a replacement restores the old memory exactly", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.tikka, status: "active", uses: 3, updatedAt: 1 }),
    );
    // The remembered tikka would auto-log, so a low-confidence amount keeps this log on a draft.
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [entryId] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    if (entryId === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId });

    const rows = await links(t);
    expect(rows.find((l) => l.foodId === foods.tikka)).toMatchObject({ status: "active", uses: 3, updatedAt: 1 });
    expect(rows.find((l) => l.foodId === foods.paneer)?.status).toBe("deleted");
  });

  test("undoing an older log keeps a later confirmation for the same text", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [older] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    await confirmAs(user, "100 g ghar ka paneer", "sub-2", [foods.tikka]);
    if (older === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: older });

    const active = await user.query(api.pipeline.drafts.listFoodLinks, {});
    expect(active.map((l) => l.foodId)).toEqual([foods.tikka]);
    expect((await links(t)).find((l) => l.foodId === foods.paneer)?.status).toBe("rejected");
  });

  test("undoing the newer log after the older one leaves the older choice", async () => {
    const { user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    const [newer] = await confirmAs(user, "100 g ghar ka paneer", "sub-2", [foods.tikka]);
    if (newer === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId: newer });

    const active = await user.query(api.pipeline.drafts.listFoodLinks, {});
    expect(active.map((l) => ({ foodId: l.foodId, uses: l.uses }))).toEqual([{ foodId: foods.paneer, uses: 1 }]);
  });

  test("undoing the older log and then the newer one leaves no memory", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [older] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    const [newer] = await confirmAs(user, "100 g ghar ka paneer", "sub-2", [foods.tikka]);
    if (older === undefined || newer === undefined) throw new Error("expected entries");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: older });
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId: newer });

    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
    expect((await links(t)).map((l) => l.status).sort()).toEqual(["deleted", "deleted"]);
  });

  test("undoing an older replacement first still restores the first memory at the end", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.biryani, status: "active", uses: 4, updatedAt: 1 }),
    );
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [older] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    const [newer] = await confirmAs(user, "100 g ghar ka paneer", "sub-2", [foods.tikka]);
    if (older === undefined || newer === undefined) throw new Error("expected entries");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: older });
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId: newer });

    const active = await user.query(api.pipeline.drafts.listFoodLinks, {});
    expect(active.map((l) => ({ foodId: l.foodId, uses: l.uses }))).toEqual([{ foodId: foods.biryani, uses: 4 }]);
  });

  test("many undone events for a text never hide the live one", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g" }]);
    const [entryId] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    if (entryId === undefined) throw new Error("expected an entry");
    // Later confirmations that were since undone, more than any fixed read window.
    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("food_link_events", {
          userId: "user_a",
          key: "ghar ka paneer",
          submissionId: `old-${i}`,
          entryId,
          changes: [],
          undoneAt: 1,
        });
      }
    });
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
  });

  test("an older choice stays replaced while the newer one is live, even after a forget", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.biryani, status: "active", uses: 4, updatedAt: 1 }),
    );
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [older] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    await confirmAs(user, "100 g ghar ka paneer", "sub-2", [foods.tikka]);
    if (older === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: older });
    const active = await user.query(api.pipeline.drafts.listFoodLinks, {});
    expect(active.map((l) => l.foodId)).toEqual([foods.tikka]);

    const [tikka] = active;
    if (tikka === undefined) throw new Error("expected a memory");
    await user.mutation(api.pipeline.drafts.forgetFoodLink, { linkId: tikka._id });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
  });

  test("two items with the same text in one log each undo only their own choice", async () => {
    const { user, foods } = await setup();
    llm = () =>
      extraction([
        { food: "ghar ka paneer", quantity: 100, unit: "g" },
        { food: "ghar ka paneer", quantity: 100, unit: "g" },
      ]);
    const [first, second] = await confirmAs(user, "paneer twice", "sub-1", [foods.paneer, foods.tikka]);
    if (first === undefined || second === undefined) throw new Error("expected two entries");

    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId: second });
    expect((await user.query(api.pipeline.drafts.listFoodLinks, {})).map((l) => l.foodId)).toEqual([foods.paneer]);
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: first });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
  });

  test("alternating choices undone one by one keep each event's history bounded", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const picks = [foods.paneer, foods.tikka, foods.biryani];
    let previous: Id<"entries"> | undefined;
    // Each log is two AI calls, so 9 logs stay under the 20-per-5-minutes guard.
    for (let i = 0; i < 9; i++) {
      const [entryId] = await confirmAs(user, "100 g ghar ka paneer", `sub-${i}`, [picks[i % 3] ?? foods.paneer]);
      if (previous !== undefined) await user.mutation(api.entries.undoRevision, { submissionId: `undo-${i}`, entryId: previous });
      previous = entryId;
    }
    const events = await t.run((ctx) => ctx.db.query("food_link_events").take(50));
    expect(Math.max(...events.map((e) => e.changes.length))).toBeLessThanOrEqual(30);
    expect((await user.query(api.pipeline.drafts.listFoodLinks, {})).map((l) => l.foodId)).toEqual([picks[8 % 3]]);
  });

  test("each item of a multi-item log rolls its own memory back once", async () => {
    const { t, user, foods } = await setup();
    llm = () =>
      extraction([
        { food: "ghar ka paneer", quantity: 100, unit: "g" },
        { food: "maa ki biryani", quantity: 100, unit: "g" },
      ]);
    const [paneerEntry, biryaniEntry] = await confirmAs(user, "paneer and biryani", "sub-1", [foods.paneer, foods.biryani]);
    if (paneerEntry === undefined || biryaniEntry === undefined) throw new Error("expected two entries");

    const paneerGone = await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: paneerEntry });
    expect((await user.query(api.pipeline.drafts.listFoodLinks, {})).map((l) => l.foodId)).toEqual([foods.biryani]);
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId: biryaniEntry });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);

    // Undoing the undo brings the entry back but not the memory, and a retried undo changes nothing.
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-3", entryId: paneerGone });
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId: paneerEntry });
    expect(await user.query(api.pipeline.drafts.listFoodLinks, {})).toEqual([]);
    const events = await t.run((ctx) => ctx.db.query("food_link_events").take(10));
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.undoneAt !== undefined)).toBe(true);
  });

  test("a memory the user forgot after logging stays forgotten when the log is undone", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_links", { userId: "user_a", key: "ghar ka paneer", foodId: foods.tikka, status: "active", uses: 2, updatedAt: 1 }),
    );
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g", confidence: 0.3 }]);
    const [entryId] = await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    if (entryId === undefined) throw new Error("expected an entry");
    const [link] = await user.query(api.pipeline.drafts.listFoodLinks, {});
    if (link === undefined) throw new Error("expected a memory");
    await user.mutation(api.pipeline.drafts.forgetFoodLink, { linkId: link._id });
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-1", entryId });

    const rows = await links(t);
    expect(rows.find((l) => l.foodId === foods.paneer)?.status).toBe("deleted");
    expect(rows.find((l) => l.foodId === foods.tikka)).toMatchObject({ status: "active", uses: 2 });
  });

  test("undoing an auto-logged entry leaves the memory that logged it", async () => {
    const { user, foods } = await setup();
    llm = () => extraction([{ food: "ghar ka paneer", quantity: 100, unit: "g" }]);
    await confirmAs(user, "100 g ghar ka paneer", "sub-1", [foods.paneer]);
    const auto = await logText(user, "100 g ghar ka paneer", "sub-2");
    if (auto.kind !== "committed") throw new Error("expected an auto-log");
    const [entryId] = auto.entryIds;
    if (entryId === undefined) throw new Error("expected an entry");
    await user.mutation(api.entries.undoRevision, { submissionId: "undo-2", entryId });
    expect((await user.query(api.pipeline.drafts.listFoodLinks, {})).map((l) => l.foodId)).toEqual([foods.paneer]);
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

/** Stores a photo the caller uploaded, and returns its storage id. */
async function uploadPhoto(t: TestConvex<typeof schema>, user: ReturnType<TestConvex<typeof schema>["withIdentity"]>) {
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
  await user.mutation(internal.uploads.registerStoredUpload, { storageId });
  return storageId;
}

describe("photo amounts are estimates for review", () => {
  test("the photo prompt allows household units, while the text prompt still forbids inferred amounts", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2, fromPhoto: true }]);
    await user.action(api.pipeline.log.logInput, { submissionId: "p-prompt", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    const photoPrompt = JSON.stringify(openRouterBodies[0]?.messages);
    expect(photoPrompt).toContain("one unit from: ml, cup, glass, katori");
    expect(photoPrompt).toContain("Never grams for an image estimate");
    expect(photoPrompt).not.toContain("Never output grams you inferred");

    llm = () => extraction([{ food: "roti", quantity: 2 }]);
    await logText(user, "2 rotis", "txt-prompt");
    const textPrompt = JSON.stringify(openRouterBodies.at(-1)?.messages);
    expect(textPrompt).toContain("Never output grams you inferred");
    expect(textPrompt).not.toContain("one unit from");
  });

  test("a photo item with an estimated amount always drafts and keeps the estimated badge", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2, unit: "piece", fromPhoto: true, amountFromImage: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-draft", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await t.run((ctx) => ctx.db.get("drafts", result.draftId));
    expect(draft?.items[0]?.reasons).toContain("photo_amount");
    expect(result.lines[0]).toMatchObject({ grams: 80, estimated: true });
    expect(await entryRows(t)).toEqual([]);
  });

  test("a photo quantity outside 0 to 20 becomes null, so the draft asks for an amount", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer tikka", quantity: 50, unit: "plate", fromPhoto: true, amountFromImage: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-range", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await t.run((ctx) => ctx.db.get("drafts", result.draftId));
    expect(draft?.items[0]).toMatchObject({ text: "paneer tikka" });
    expect(draft?.items[0]?.quantity).toBeUndefined();
    expect(draft?.items[0]?.unit).toBeUndefined();
    expect(result.lines[0]?.grams).toBeNull();
  });

  test("image amounts keep ml and plural household units, since the caps are per unit", async () => {
    const { t, user } = await setup();
    const image = { fromPhoto: true, amountFromImage: true };
    llm = () => extraction([
      { food: "dal, cooked", quantity: 250, unit: "ml", ...image },
      { food: "rice, white, cooked", quantity: 2, unit: "cups", ...image },
      { food: "roti", quantity: 3, unit: "pieces", ...image },
      { food: "lassi", quantity: 2, unit: "glasses", ...image },
      { food: "dal", quantity: 2, unit: "bowls", ...image },
      { food: "paneer", quantity: 2, unit: "plates", ...image },
      { food: "rice", quantity: 2, unit: "katoris", ...image },
      { food: "oil, sunflower", quantity: 2, unit: "tbsps", ...image },
      { food: "chapati", quantity: 2, unit: "slices", ...image },
    ]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-ml", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await t.run((ctx) => ctx.db.get("drafts", result.draftId));
    expect(draft?.items.map((item) => [item.quantity, item.unit])).toEqual([
      [250, "ml"],
      [2, "cup"],
      [3, "piece"],
      [2, "glass"],
      [2, "bowl"],
      [2, "plate"],
      [2, "katori"],
      [2, "tbsp"],
      [2, "slice"],
    ]);
  });

  test("a caption amount in grams is kept as stated and is not an image estimate", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "oil, sunflower", quantity: 10, unit: "g", fromPhoto: true, amountFromImage: false }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-caption", input: { kind: "photo", storageId: await uploadPhoto(t, user), text: "10 g butter" } });
    expect(result.lines[0]?.grams).toBe(10);
    expect(result.kind).toBe("committed");
  });

  test("a caption amount in grams spelled out is kept as stated", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer", quantity: 100, unit: "grams", fromPhoto: true, amountFromImage: false }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-grams", input: { kind: "photo", storageId: await uploadPhoto(t, user), text: "100 grams paneer" } });
    expect(result.lines[0]?.grams).toBe(100);
  });

  test("an image estimate in ounces is refused, so the amount becomes null and the draft asks", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "paneer", quantity: 8, unit: "oz", fromPhoto: true, amountFromImage: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-oz", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await t.run((ctx) => ctx.db.get("drafts", result.draftId));
    expect(draft?.items[0]?.quantity).toBeUndefined();
    expect(draft?.items[0]?.unit).toBeUndefined();
    expect(result.lines[0]?.grams).toBeNull();
  });

  test("a photo-estimated bare count always drafts", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2, fromPhoto: true, amountFromImage: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-bare", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await t.run((ctx) => ctx.db.get("drafts", result.draftId));
    expect(draft?.items[0]?.reasons).toContain("photo_amount");
  });

  test("correcting the quantity of a photo estimate recomputes grams from the tables", async () => {
    const { t, user } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 1, unit: "piece", fromPhoto: true, amountFromImage: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p-fix", input: { kind: "photo", storageId: await uploadPhoto(t, user) } });
    if (result.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, quantity: 3 }] });
    const [row] = await entryRows(t);
    expect(row?.grams).toBeCloseTo(120, 9);
    await expectComputedFromFoods(t);
  });
});

describe("photo and voice input", () => {
  test("photo items use the photo model and are flagged estimated", async () => {
    const { t, user, foods } = await setup();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await user.mutation(internal.uploads.registerStoredUpload, { storageId });
    llm = () => extraction([{ food: "roti", quantity: 2, fromPhoto: true }]);
    const result = await user.action(api.pipeline.log.logInput, { submissionId: "p1", input: { kind: "photo", storageId } });
    expect(result.kind).toBe("committed");
    expect(openRouterBodies[0]?.model).toBe(PHOTO_MODEL);
    expect(JSON.stringify(openRouterBodies[0]?.messages)).toContain("image_url");
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.chapati, flags: ["photo", "estimated"] });
    expect(result.lines[0]?.estimated).toBe(true);
  });

  test("an oversized photo is refused before any model call", async () => {
    const { t, user } = await setup();
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(AI_INPUT_LIMITS.imageBytes + 1)], { type: "image/jpeg" })),
    );
    await user.mutation(internal.uploads.registerStoredUpload, { storageId });
    await expect(
      user.action(api.pipeline.log.logInput, { submissionId: "p1", input: { kind: "photo", storageId } }),
    ).rejects.toThrow(/too large/);
    expect(openRouterBodies).toHaveLength(0);
  });

  test("a photo the caller did not upload is refused before any model call", async () => {
    const { t, user } = await setup();
    const other = t.withIdentity({ subject: "user_b" });
    const theirs = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await other.mutation(internal.uploads.registerStoredUpload, { storageId: theirs });
    const unregistered = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    for (const storageId of [theirs, unregistered]) {
      await expect(
        user.action(api.pipeline.log.logInput, { submissionId: `p-${storageId}`, input: { kind: "photo", storageId } }),
      ).rejects.toMatchObject({ data: { code: "UPLOAD_NOT_FOUND" } });
    }
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

describe("draft amounts: a food is only offered units it converts in", () => {
  test("grams always convert, and a powder with no density or cup row offers no cup or ml", async () => {
    const { t, user } = await setup();
    const powder = await t.run((ctx) =>
      ctx.db.insert("foods", {
        name: "Coffee, instant, powder",
        aliases: [],
        searchText: "Coffee, instant, powder",
        per100g: RICE,
        source: "fdc",
        sourceId: "powder",
        verified: true,
      }),
    );
    const [set] = await user.query(api.pipeline.drafts.amountOptions, { items: [{ foodId: powder, unit: null }] });
    const units = set?.units.map((u) => u.unit) ?? [];
    expect(set?.units.find((u) => u.unit === "g")?.gramsPerUnit).toBe(1);
    expect(units).not.toContain("cup");
    expect(units).not.toContain("ml");
  });

  test("a cookie's piece row offers piece at that row's weight", async () => {
    const { t, user } = await setup();
    const cookie = await t.run(async (ctx) => {
      const id = await ctx.db.insert("foods", {
        name: "Cookies, chocolate chip",
        aliases: [],
        searchText: "Cookies, chocolate chip",
        per100g: OIL,
        source: "fdc",
        sourceId: "cookie",
        verified: true,
      });
      await ctx.db.insert("food_portions", { foodId: id, source: "fdc", measure: "piece", description: "piece", gramsPerMeasure: 5.6 });
      return id;
    });
    const [set] = await user.query(api.pipeline.drafts.amountOptions, { items: [{ foodId: cookie, unit: null }] });
    expect(set?.units).toContainEqual({ unit: "piece", label: "pc (5.6 g)", gramsPerUnit: 5.6 });
  });
});

describe("draft amounts: bare counts keep their resolver meaning", () => {
  test("previews bare roti at 40 g and explicit piece at its 68 g row", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_portions", {
        foodId: foods.chapati,
        source: "fdc",
        measure: "piece",
        description: "piece",
        gramsPerMeasure: 68,
      }),
    );

    const [bare, piece] = await user.query(api.pipeline.drafts.amountOptions, {
      items: [
        { foodId: foods.chapati, unit: null },
        { foodId: foods.chapati, unit: "piece" },
      ],
    });
    expect(bare?.units.find((unit) => unit.unit === null)?.gramsPerUnit).toBe(40);
    expect(piece?.units.find((unit) => unit.unit === "piece")?.gramsPerUnit).toBe(68);
  });

  test("bare roti and explicit piece get different chip labels when they weigh different amounts", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_portions", {
        foodId: foods.chapati,
        source: "fdc",
        measure: "piece",
        description: "piece",
        gramsPerMeasure: 68,
      }),
    );

    const [set] = await user.query(api.pipeline.drafts.amountOptions, { items: [{ foodId: foods.chapati, unit: null }] });
    const bare = set?.units.find((unit) => unit.unit === null)?.label;
    const piece = set?.units.find((unit) => unit.unit === "piece")?.label;
    expect(bare).toBe("roti");
    expect(piece).toBe("pc");
  });

  test("changing a bare roti count to three confirms 120 g", async () => {
    const { t, user, foods } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("food_portions", {
        foodId: foods.chapati,
        source: "fdc",
        measure: "piece",
        description: "piece",
        gramsPerMeasure: 68,
      }),
    );
    llm = () => extraction([{ food: "roti", quantity: 2, confidence: 0.5 }]);
    const result = await logText(user, "2 rotis");
    if (result.kind !== "draft") throw new Error("expected a draft");

    await user.mutation(api.pipeline.drafts.confirmDraft, {
      draftId: result.draftId,
      corrections: [{ index: 0, quantity: 3, unit: null }],
    });

    expect(await entryRows(t)).toMatchObject([{ foodId: foods.chapati, grams: 120 }]);
  });
});

describe("draft amounts: a food-name unit does not follow a food change", () => {
  test("a roti amount on a roti food is not offered or saved once the food is coffee powder", async () => {
    const { t, user, foods } = await setup();
    llm = () => extraction([{ food: "roti", quantity: 2, unit: "roti", confidence: 0.5 }]);
    const result = await logText(user, "2 rotis");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.food?._id).toBe(foods.chapati);
    expect(draft?.items[0]?.unit).toBe("roti");

    const coffee = await t.run((ctx) =>
      ctx.db.insert("foods", {
        name: "Beverages, coffee, instant, powder",
        aliases: [],
        searchText: "Beverages, coffee, instant, powder",
        per100g: RICE,
        source: "fdc",
        sourceId: "coffee-powder",
        verified: true,
      }),
    );
    const [set] = await user.query(api.pipeline.drafts.amountOptions, { items: [{ foodId: coffee, unit: "roti" }] });
    expect(set?.units.map((u) => u.unit)).not.toContain("roti");

    await expect(
      user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId, corrections: [{ index: 0, foodId: coffee }] }),
    ).rejects.toThrow(/cannot turn that amount/);
    expect(await entryRows(t)).toHaveLength(0);
  });
});

describe("AI estimate checks", () => {
  test("a chai estimate passes; macros that do not add up and a 600 g katori are refused", () => {
    const chai: Estimate = { name: "Masala chai", grams: 110, kcal: 55, protein: 2.5, carbs: 7, fat: 2, assumptions: "Milk and sugar, cafe cup", sourceUrls: [] };
    expect(estimateProblem(chai, 1, "teacup")).toBeNull();
    expect(estimateProblem({ ...chai, fat: 10 }, 1, "teacup")).toMatch(/add up/);
    expect(estimateProblem({ ...chai, protein: 60, carbs: 50, fat: 10, kcal: 530 }, 1, "teacup")).toMatch(/cannot weigh more/);
    expect(estimateProblem({ ...chai, grams: 600, kcal: 300, protein: 10, carbs: 40, fat: 10 }, 1, "katori")).toMatch(/fit one katori/);
  });

  test("a cup of dry oats at 0.34 g/ml passes", () => {
    const oats: Estimate = { name: "Oats, dry", grams: 82, kcal: 319, protein: 13.2, carbs: 54.2, fat: 6.9, assumptions: "Rolled oats", sourceUrls: [] };
    expect(estimateProblem(oats, 1, "cup")).toBeNull();
  });

  test("grams must agree with an explicit mass or volume unit", () => {
    const paneer: Estimate = { name: "Paneer", grams: 100, kcal: 300, protein: 20, carbs: 4, fat: 20, assumptions: "Cubed", sourceUrls: [] };
    expect(estimateProblem(paneer, 100, "g")).toBeNull();
    expect(estimateProblem({ ...paneer, grams: 150 }, 100, "g")).toMatch(/do not match 100 g/);
    const milk: Estimate = { name: "Milk", grams: 600, kcal: 300, protein: 20, carbs: 4, fat: 20, assumptions: "Whole", sourceUrls: [] };
    expect(estimateProblem(milk, 200, "ml")).toMatch(/do not match 200 ml/);
  });
});

describe("AI estimate: an unmatched item becomes a private estimate on the draft", () => {
  const CHAI_CALL = {
    item_index: 0,
    name: "Masala chai",
    grams: 110,
    kcal: 55,
    protein_g: 2.5,
    carbs_g: 7,
    fat_g: 2,
    assumptions: "Milk and sugar, cafe cup",
  };

  test("the estimate lands on the draft with its chip data and a private food row, and does not auto-commit", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const result = await logText(user, "a teacup of masala chai");

    if (result.kind !== "draft") throw new Error("expected a draft");
    expect(await entryRows(t)).toHaveLength(0);
    expect(openRouterBodies.map(kind)).toEqual(["extract", "resolve"]);
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]).toMatchObject({ aiEstimate: true, estimated: true, note: "Milk and sugar, cafe cup", grams: 110 });
    expect(draft?.items[0]?.reasons).toContain("ai_estimate");

    const foods = await t.run((ctx) => ctx.db.query("foods").collect());
    const estimates = foods.filter((food) => food.source === "ai_estimate");
    expect(estimates).toHaveLength(1);
    expect(estimates[0]).toMatchObject({ name: "Masala chai", ownerUserId: "user_a", verified: false });
    expect(draft?.items[0]?.food?._id).toBe(estimates[0]?._id);
  });

  test("opt-in lookup is bounded, stores only returned citations, and keeps the result estimated after confirmation", async () => {
    const { t, user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : {
            webSources: [{ title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" }],
            toolCalls: [{ name: "estimate_food", args: { ...CHAI_CALL, source_urls: ["https://nutrition.example/masala-chai"] } }],
          };
    const result = await logText(user, "a teacup of masala chai");

    if (result.kind !== "draft") throw new Error("expected a draft");
    const resolveBody = openRouterBodies.find((body) => kind(body) === "resolve");
    const resolveTools = Array.isArray(resolveBody?.tools) ? resolveBody.tools : [];
    const searchTool = resolveTools.find((tool) => isRecord(tool) && tool.type === "openrouter:web_search");
    expect(searchTool).toMatchObject({
      type: "openrouter:web_search",
      parameters: { engine: "exa", max_results: 3, max_uses: 1, max_total_results: 3 },
    });
    expect(resolveBody?.max_tool_calls).toBe(1);
    const globalUsage = await t.run((ctx) => ctx.db.query("ai_usage_buckets").take(10));
    expect(globalUsage.find((bucket) => bucket.scope === "global")?.costUsd).toBeGreaterThan(0.007);
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.webSources).toEqual([{ title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" }]);
    const estimate = (await t.run((ctx) => ctx.db.query("foods").collect())).find((food) => food.source === "ai_estimate");
    expect(estimate).toMatchObject({ verified: false, webSources: draft?.items[0]?.webSources });

    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: result.draftId });
    const entries = await user.query(api.entries.entriesForDay, {});
    expect(entries[0]).toMatchObject({ flags: ["estimated"], webSources: estimate?.webSources });
  });

  test("a search-only cited reply continues to a no-web estimate turn", async () => {
    const { t, user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) => {
      if (kind(body) === "extract") return extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }]);
      const hasWebSearch = Array.isArray(body.tools) && body.tools.some((tool) => isRecord(tool) && tool.type === "openrouter:web_search");
      return hasWebSearch
        ? { content: "A cited source describes masala chai as a prepared tea with milk and sugar.", webSources: [{ title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" }] }
        : { toolCalls: [{ name: "estimate_food", args: { ...CHAI_CALL, source_urls: ["https://nutrition.example/masala-chai"] } }] };
    };

    const result = await logText(user, "a teacup of masala chai");

    if (result.kind !== "draft") throw new Error("expected a review draft");
    expect(result.lines[0]).toMatchObject({ foodName: "Masala chai", estimated: true });
    expect(result.lines[0]?.kcal).toBeCloseTo(55, 8);
    expect(await entryRows(t)).toHaveLength(0);
    const resolverBodies = openRouterBodies.filter((body) => kind(body) === "resolve");
    expect(resolverBodies).toHaveLength(2);
    expect(resolverBodies[0]?.max_tool_calls).toBe(1);
    expect(resolverBodies[1]?.tools).not.toContainEqual(expect.objectContaining({ type: "openrouter:web_search" }));
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.webSources).toEqual([{ title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" }]);
  });

  test("estimates attach only explicitly selected citations to each item", async () => {
    const { user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) => kind(body) === "extract"
      ? extraction([
          { food: "masala chai", quantity: 1, unit: "teacup" },
          { food: "unknown lentil bowl", quantity: 1, unit: "katori" },
          { food: "unknown rice bowl", quantity: 100, unit: "g" },
        ])
      : {
          webSources: [
            { title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" },
            { title: "Lentil bowl nutrition", url: "https://nutrition.example/lentil-bowl" },
          ],
          toolCalls: [
            { name: "estimate_food", args: { ...CHAI_CALL, source_urls: ["https://nutrition.example/masala-chai"] } },
            { name: "estimate_food", args: { item_index: 1, name: "Unknown lentil bowl", grams: 150, kcal: 212, protein_g: 4, carbs_g: 40, fat_g: 4, assumptions: "Cooked lentils with a little oil", source_urls: ["https://nutrition.example/lentil-bowl"] } },
            { name: "estimate_food", args: { item_index: 2, name: "Unknown rice bowl", grams: 100, kcal: 150, protein_g: 4, carbs_g: 28, fat_g: 2, assumptions: "Cooked rice with seasoning" } },
          ],
        };

    const result = await logText(user, "chai and a lentil bowl and a rice bowl");

    if (result.kind !== "draft") throw new Error("expected a review draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items.map((item) => item.webSources)).toEqual([
      [{ title: "Masala chai nutrition", url: "https://nutrition.example/masala-chai" }],
      [{ title: "Lentil bowl nutrition", url: "https://nutrition.example/lentil-bowl" }],
      [],
    ]);
  });

  test("a model-provided URL without a returned citation is never saved", async () => {
    const { t, user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: { ...CHAI_CALL, source_urls: ["https://fake.example/food"] } }] };
    const result = await logText(user, "a teacup of masala chai");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const foods = await t.run((ctx) => ctx.db.query("foods").collect());
    expect(foods.find((food) => food.source === "ai_estimate")?.webSources).toBeUndefined();
    expect((await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId }))?.items[0]?.webSources).toEqual([]);
  });

  test("database lookup precedes one web search and later resolver calls stay capped", async () => {
    const { user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) => {
      if (kind(body) === "extract") return extraction([
        { food: "masala chai", quantity: 1, unit: "teacup" },
        { food: "unknown lentil bowl", quantity: 1, unit: "katori" },
      ]);
      const resolverIndex = openRouterBodies.filter((candidate) => kind(candidate) === "resolve").length;
      if (resolverIndex === 1) return { webSearchRequests: 0, toolCalls: [{ name: "search_food", args: { query: "masala chai" } }] };
      if (resolverIndex === 2) return { omitWebSearchUsage: true, toolCalls: [{ name: "get_user_foods", args: {} }] };
      return { toolCalls: [
        { name: "estimate_food", args: CHAI_CALL },
        { name: "estimate_food", args: {
          item_index: 1, name: "Unknown lentil bowl", grams: 150, kcal: 212, protein_g: 4, carbs_g: 40, fat_g: 4, assumptions: "Cooked lentils with a little oil",
        } },
      ] };
    };

    await logText(user, "a teacup of masala chai and a katori of unknown lentil bowl");

    const resolverBodies = openRouterBodies.filter((body) => kind(body) === "resolve");
    const offeredWebSearch = resolverBodies.map((body) => Array.isArray(body.tools) && body.tools.some((tool) => isRecord(tool) && tool.type === "openrouter:web_search"));
    expect(offeredWebSearch).toEqual([true, true, false]);
  });

  test("the final bounded resolver turn is reserved for no-web synthesis", async () => {
    const { user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) => {
      if (kind(body) === "extract") return extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }]);
      const resolverIndex = openRouterBodies.filter((candidate) => kind(candidate) === "resolve").length;
      return resolverIndex < MAX_TOOL_ITERATIONS
        ? { webSearchRequests: 0, toolCalls: [{ name: "get_user_foods", args: {} }] }
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    };

    const result = await logText(user, "a teacup of masala chai");

    if (result.kind !== "draft") throw new Error("expected a review draft");
    expect(result.lines[0]?.kcal).toBeCloseTo(55, 8);
    const resolverBodies = openRouterBodies.filter((body) => kind(body) === "resolve");
    expect(resolverBodies).toHaveLength(MAX_TOOL_ITERATIONS);
    expect(resolverBodies.map((body) => Array.isArray(body.tools) && body.tools.some((tool) => isRecord(tool) && tool.type === "openrouter:web_search"))).toEqual([true, true, true, false]);
  });

  test("a failed opt-in search falls back to the unresolved review draft without saving a blank entry", async () => {
    const { t, user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    llm = (body) => kind(body) === "extract"
      ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
      : Array.isArray(body.tools) && body.tools.some((tool) => isRecord(tool) && tool.type === "openrouter:web_search")
        ? { status: 503 }
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const result = await logText(user, "a teacup of masala chai");
    expect(result.kind).toBe("draft");
    if (result.kind !== "draft") return;
    expect(result.lines[0]).toMatchObject({ foodName: "Masala chai", estimated: true });
    expect(result.lines[0]?.kcal).toBeCloseTo(55, 8);
    expect(result.lines[0]?.reasons).toContain("ai_estimate");
    expect(await entryRows(t)).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.query("foods").collect())).filter((food) => food.source === "ai_estimate")).toHaveLength(1);
  });

  test("structured own-key errors are not retried without web search", async () => {
    const { t, user } = await setup();
    await user.mutation(api.api_keys.setWebFoodLookup, { enabled: true });
    await t.run((ctx) => ctx.db.insert("user_api_keys", {
      userId: "user_a", provider: "openrouter", key: "sk-or-v1-test-000000000000000000", last4: "0000", updatedAt: Date.now(),
    }));
    llm = (body) => kind(body) === "extract"
      ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
      : { status: 401 };

    await expect(logText(user, "a teacup of masala chai")).rejects.toMatchObject({ data: { code: "OWN_KEY_INVALID" } });

    const resolverBodies = openRouterBodies.filter((body) => kind(body) === "resolve");
    expect(resolverBodies).toHaveLength(1);
    expect(resolverBodies[0]?.tools).toContainEqual(expect.objectContaining({ type: "openrouter:web_search" }));
  });

  test("once confirmed, the same text auto-commits from memory with no model call", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const first = await logText(user, "a teacup of masala chai", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId });

    const callsBefore = openRouterBodies.length;
    const second = await logText(user, "a teacup of masala chai", "sub-2");
    expect(second.kind).toBe("committed");
    expect(openRouterBodies.slice(callsBefore).map(kind)).toEqual(["extract"]);
    const rows = await entryRows(t);
    expect(rows.at(-1)).toMatchObject({ source: "memory", grams: 110 });
    expect(rows.at(-1)?.flags).toContain("estimated");
  });

  test("a confirmed estimate is reused with the same nutrients and portion on the next day", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup", date: "2026-10-24" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const first = await logText(user, "a teacup of masala chai", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId });
    const firstRow = (await entryRows(t))[0];
    if (firstRow === undefined) throw new Error("expected a confirmed entry");
    const firstFood = await t.run((ctx) => ctx.db.get("foods", firstRow.foodId));
    if (firstFood === null) throw new Error("expected the saved estimate");

    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { content: "unexpected estimate call" };
    const callsBefore = openRouterBodies.length;
    const second = await logText(user, "a teacup of masala chai", "sub-2");
    const rows = await entryRows(t);

    expect(second.kind).toBe("committed");
    expect(openRouterBodies.slice(callsBefore).map(kind)).toEqual(["extract"]);
    expect(rows[1]).toMatchObject({ foodId: firstRow.foodId, source: "memory", grams: firstRow.grams, nutrients: firstRow.nutrients, flags: ["estimated"] });
    expect(rows[1]?.localDate).toBe("2026-10-25");
    expect(rows.filter((row) => row.foodId === firstRow.foodId)).toHaveLength(2);
    expect(firstFood.source).toBe("ai_estimate");
  });

  test("an estimate's own portion row sets the grams, so a seed piece weight cannot change them", async () => {
    const { user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala paratha", quantity: 2 }])
        : {
            toolCalls: [
              {
                name: "estimate_food",
                args: { item_index: 0, name: "Masala paratha", grams: 240, kcal: 600, protein_g: 12, carbs_g: 72, fat_g: 24, assumptions: "Plain, ghee brushed" },
              },
            ],
          };
    const result = await logText(user, "2 masala paratha");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.grams).toBe(240);
  });

  test("while a clear runs, an estimate writes no food row and the log fails", async () => {
    const { t, user } = await setup();
    await t.run((ctx) => ctx.db.insert("ledger_clears", { userId: "user_a" }));
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };

    await expect(logText(user, "a teacup of masala chai")).rejects.toThrow(/being cleared/);
    const foods = await t.run((ctx) => ctx.db.query("foods").collect());
    expect(foods.filter((food) => food.source === "ai_estimate")).toHaveLength(0);
  });

  test("a tool-picked estimate stays among the item's candidates, so the picker can offer it again", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : {
            toolCalls: [
              {
                name: "estimate_food",
                args: { item_index: 0, name: "Masala chai", grams: 110, kcal: 55, protein_g: 2.5, carbs_g: 7, fat_g: 2, assumptions: "Milk and sugar" },
              },
            ],
          };
    const result = await logText(user, "a teacup of masala chai");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const estimate = (await t.run((ctx) => ctx.db.query("foods").collect())).find((food) => food.source === "ai_estimate");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.candidates.map((food) => food._id)).toContain(estimate?._id);
  });

  test("a remembered estimate that lands on a draft stays among the item's candidates", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const first = await logText(user, "a teacup of masala chai", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId });

    llm = () => extraction([{ food: "masala chai", quantity: 1, unit: "teacup", confidence: 0.5 }]);
    const second = await logText(user, "a teacup of masala chai", "sub-2");
    if (second.kind !== "draft") throw new Error("expected a draft");
    const estimate = (await t.run((ctx) => ctx.db.query("foods").collect())).find((food) => food.source === "ai_estimate");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: second.draftId });
    expect(draft?.items[0]?.candidates.map((food) => food._id)).toEqual([estimate?._id]);
  });

  test("two unconfirmed logs of the same estimate make one food row", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: CHAI_CALL }] };
    const first = await logText(user, "a teacup of masala chai", "sub-1");
    const second = await logText(user, "a teacup of masala chai", "sub-2");

    expect(first.kind).toBe("draft");
    expect(second.kind).toBe("draft");
    const foods = await t.run((ctx) => ctx.db.query("foods").collect());
    expect(foods.filter((food) => food.source === "ai_estimate")).toHaveLength(1);
  });

  test("punctuation variants of an estimate name reuse the same private food", async () => {
    const { t, user } = await setup();
    let estimateName = "Masala chai";
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: { ...CHAI_CALL, name: estimateName } }] };
    await logText(user, "a teacup of masala chai", "sub-1");

    estimateName = "Masala chai!";
    await logText(user, "a teacup of masala chai", "sub-2");

    const foods = await t.run((ctx) => ctx.db.query("foods").collect());
    expect(foods.filter((food) => food.source === "ai_estimate")).toHaveLength(1);
  });
});

describe("AI estimate identity and portions", () => {
  test("two teacup chai estimates of different size make two rows, and the second draft shows its own amount", async () => {
    const { t, user } = await setup();
    const chai = (grams: number, kcal: number, protein: number, carbs: number, fat: number) => ({
      item_index: 0,
      name: "Masala chai",
      grams,
      kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      assumptions: "Milk and sugar",
    });
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: chai(110, 55, 2.5, 7, 2) }] };
    await logText(user, "a teacup of masala chai", "sub-1");

    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "masala chai", quantity: 1, unit: "teacup" }])
        : { toolCalls: [{ name: "estimate_food", args: chai(150, 120, 4, 14, 4) }] };
    const second = await logText(user, "a teacup of masala chai", "sub-2");
    if (second.kind !== "draft") throw new Error("expected a draft");

    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: second.draftId });
    expect(draft?.items[0]?.grams).toBe(150);
    expect(draft?.items[0]?.preview?.kcal).toBeCloseTo(120, 6);
    const rows = (await t.run((ctx) => ctx.db.query("foods").collect())).filter((food) => food.source === "ai_estimate");
    expect(rows).toHaveLength(2);
  });

  test("two 200 g, 200 kcal shakes with different macros make two rows", async () => {
    const { t, user } = await setup();
    const shake = (protein: number, carbs: number, fat: number) => ({
      item_index: 0,
      name: "Protein shake",
      grams: 200,
      kcal: 200,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      assumptions: "Whey in milk",
    });
    for (const [submission, args] of [["sub-1", shake(20, 20, 2)], ["sub-2", shake(10, 35, 5)]] as const) {
      llm = (body) =>
        kind(body) === "extract"
          ? extraction([{ food: "protein shake", quantity: 1 }])
          : { toolCalls: [{ name: "estimate_food", args }] };
      const result = await logText(user, "a protein shake", submission);
      expect(result.kind).toBe("draft");
    }
    const rows = (await t.run((ctx) => ctx.db.query("foods").collect())).filter((food) => food.source === "ai_estimate");
    expect(rows).toHaveLength(2);
  });

  test("a reused estimate keeps one piece row, so counts stated two ways never conflict", async () => {
    const { t, user } = await setup();
    const samosa = (quantity: number, grams: number, kcal: number, protein: number, carbs: number, fat: number) => ({
      item_index: 0,
      name: "Samosa",
      grams,
      kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      assumptions: "Fried, potato filling",
    });
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "samosa", quantity: 3, unit: "samosa" }])
        : { toolCalls: [{ name: "estimate_food", args: samosa(3, 99, 297, 7.92, 39.6, 11.88) }] };
    await logText(user, "3 samosa", "sub-1");

    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "samosa", quantity: 1 }])
        : { toolCalls: [{ name: "estimate_food", args: samosa(1, 33, 99, 2.64, 13.2, 3.96) }] };
    const second = await logText(user, "1 samosa", "sub-2");
    if (second.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: second.draftId });

    const estimate = (await t.run((ctx) => ctx.db.query("foods").collect())).find((food) => food.source === "ai_estimate");
    const portions = await t.run((ctx) => ctx.db.query("food_portions").collect());
    expect(portions.filter((p) => p.foodId === estimate?._id).map((p) => p.measure)).toEqual(["piece"]);

    llm = () => extraction([{ food: "samosa", quantity: 2 }]);
    const third = await logText(user, "2 samosa", "sub-3");
    expect(third.kind).toBe("committed");
    expect((await entryRows(t)).at(-1)?.grams).toBeCloseTo(2 * 33, 6);
  });

  test("'Acai bowl' with unit bowl keeps a bowl row, and the draft resolves to its 200 g", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "acai bowl", quantity: 1, unit: "bowl" }])
        : {
            toolCalls: [
              {
                name: "estimate_food",
                args: { item_index: 0, name: "Acai bowl", grams: 200, kcal: 200, protein_g: 3, carbs_g: 30, fat_g: 6, assumptions: "Banana, granola" },
              },
            ],
          };
    const result = await logText(user, "an acai bowl");
    if (result.kind !== "draft") throw new Error("expected a draft");
    const draft = await user.query(api.pipeline.drafts.getDraft, { draftId: result.draftId });
    expect(draft?.items[0]?.grams).toBe(200);
    const portions = await t.run((ctx) => ctx.db.query("food_portions").collect());
    expect(portions.map((p) => [p.measure, p.description])).toEqual([["bowl", "bowl"]]);
  });

  test("an estimate saved with a unit that names the food answers a later bare count", async () => {
    const { t, user } = await setup();
    llm = (body) =>
      kind(body) === "extract"
        ? extraction([{ food: "samosa", quantity: 2, unit: "samosa" }])
        : {
            toolCalls: [
              {
                name: "estimate_food",
                args: { item_index: 0, name: "Samosa", grams: 240, kcal: 600, protein_g: 14, carbs_g: 72, fat_g: 28, assumptions: "Fried, potato filling" },
              },
            ],
          };
    const first = await logText(user, "2 samosa", "sub-1");
    if (first.kind !== "draft") throw new Error("expected a draft");
    await user.mutation(api.pipeline.drafts.confirmDraft, { draftId: first.draftId });

    llm = () => extraction([{ food: "samosa", quantity: 2 }]);
    const second = await logText(user, "2 samosa", "sub-2");
    expect(second.kind).toBe("committed");
    expect((await entryRows(t)).at(-1)).toMatchObject({ grams: 240 });
  });
});

describe("AI estimate names keep non-Latin scripts apart", () => {
  test("two Devanagari estimates make two food rows", async () => {
    const { t, user } = await setup();
    const callFor = (name: string) => ({
      item_index: 0,
      name,
      grams: 150,
      kcal: 200,
      protein_g: 5,
      carbs_g: 30,
      fat_g: 6,
      assumptions: "Home-style, one katori",
    });
    for (const [submission, name] of [["sub-1", "पोहा"], ["sub-2", "उपमा"]] as const) {
      llm = (body) =>
        kind(body) === "extract"
          ? extraction([{ food: name, quantity: 1, unit: "katori" }])
          : { toolCalls: [{ name: "estimate_food", args: callFor(name) }] };
      const result = await logText(user, name, submission);
      expect(result.kind).toBe("draft");
    }
    const rows = (await t.run((ctx) => ctx.db.query("foods").collect())).filter((food) => food.source === "ai_estimate");
    expect(rows.map((food) => food.name).sort()).toEqual(["उपमा", "पोहा"]);
  });
});

describe("saved foods are never crowded out by AI estimates", () => {
  test("a user with 210 AI estimates still matches their own saved food", async () => {
    const { t, user } = await setup();
    const saved = await t.run(async (ctx) => {
      for (let i = 0; i < 210; i++) {
        await ctx.db.insert("foods", {
          name: `Estimate ${i}`,
          aliases: [],
          searchText: `Estimate ${i}`,
          per100g: RICE,
          source: "ai_estimate",
          sourceId: `user_a:ai:estimate ${i}`,
          verified: false,
          ownerUserId: "user_a",
        });
      }
      return await ctx.db.insert("foods", {
        name: "Homemade paneer",
        aliases: [],
        searchText: "Homemade paneer",
        per100g: PANEER,
        source: "user",
        sourceId: "user_a:homemade-paneer",
        verified: true,
        ownerUserId: "user_a",
      });
    });
    // The saved-food list has no search fallback, so it shows whether estimates crowd saved foods out.
    expect((await user.query(api.foods_db.listUserFoods, {})).map((food) => food._id)).toContain(saved);
    llm = () => extraction([{ food: "homemade paneer", quantity: 100, unit: "g" }]);
    const result = await logText(user, "100 g homemade paneer");

    expect(result.kind).toBe("committed");
    expect((await entryRows(t)).at(-1)).toMatchObject({ foodId: saved, source: "db", grams: 100 });
  });
});
