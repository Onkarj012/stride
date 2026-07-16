import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

function promptText(messages: any[]): string {
  const first = messages[0]?.content;
  return typeof first === "string" ? first : "";
}

function isTitlePrompt(messages: any[]): boolean {
  return promptText(messages).includes("Generate a short, descriptive title");
}

function isMealParsePrompt(messages: any[]): boolean {
  return promptText(messages).includes("You are a professional nutritionist");
}

function mockChatReply(reply: string) {
  mockedCallAI.mockImplementation(async (messages) => {
    if (isTitlePrompt(messages)) return "Chat";
    if (isMealParsePrompt(messages)) {
      return JSON.stringify({
        name: "Pizza",
        calories: 100,
        protein: 5,
        carbs: 15,
        fat: 4,
        components: "pizza",
        suggestion: "Add vegetables next time.",
        ingredients: [{ food_text: "pizza", amount: 1, unit: "slice", is_oil_or_fat: false }],
        cooking_method: "baked",
        portion_scale: 1,
        total_recipe_servings: 1,
      });
    }
    return reply;
  });
}

describe("clarification flow", () => {
  beforeEach(() => {
    mockedCallAI.mockReset();
  });

  test("vague date → pending group + clarification payload, no domain row written", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockChatReply(
      'I need the exact date.⟦LOG_MEAL⟧{"description":"pizza","date":"UNKNOWN_VAGUE","question":"Which date did you eat this?"}⟦/LOG_MEAL⟧',
    );

    const result = await asUser.action(api.ai.chat, {
      message: "I ate pizza a while ago",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;

    expect(result.clarification).toBeDefined();
    const clarification = result.clarification as { groupId: string; items: any[]; question: string };
    expect(clarification.items).toHaveLength(1);
    expect(clarification.items[0]).toMatchObject({ actionType: "meal", description: "pizza" });
    expect(clarification.question).toContain("Which date");

    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(0);

    const groups = await t.run((ctx) => ctx.db.query("actionGroups").collect());
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ status: "pending", _id: clarification.groupId });

    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ status: "pending", groupId: clarification.groupId });
  });

  test("low confidence meal → clarification", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockedCallAI.mockImplementation(async (messages) => {
      if (isTitlePrompt(messages)) return "Chat";
      if (isMealParsePrompt(messages)) {
        return JSON.stringify({
          name: "Mystery food",
          calories: 100,
          protein: 2,
          carbs: 10,
          fat: 3,
          components: "mystery",
          suggestion: "",
          ingredients: [{ food_text: "xyz_unknown_food_123", amount: 1, unit: "serving", is_oil_or_fat: false }],
          cooking_method: "unknown",
          portion_scale: 1,
          total_recipe_servings: 1,
        });
      }
      return 'I am not sure about this entry.⟦LOG_MEAL⟧{"description":"mystery food","date":"2026-07-16"}⟦/LOG_MEAL⟧';
    });

    const result = await asUser.action(api.ai.chat, {
      message: "I ate something weird",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;

    expect(result.clarification).toBeDefined();
    const clarification = result.clarification as { items: any[] };
    expect(clarification.items).toHaveLength(1);
    expect(clarification.items[0].confidence).toBeLessThan(0.6);

    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(0);
  });

  test("warning validation → clarification", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockChatReply(
      'Please confirm this entry.⟦LOG_MEAL⟧{"description":"pizza","date":"2026-07-16","validation":{"status":"warning","messages":["unclear portion"]}}⟦/LOG_MEAL⟧',
    );

    const result = await asUser.action(api.ai.chat, {
      message: "I had pizza",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;

    expect(result.clarification).toBeDefined();
    const clarification = result.clarification as { items: any[] };
    expect(clarification.items[0].reason).toContain("confirmation");

    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(0);
  });

  test("resolveClarification with exact date → committed via canonical writer + same groupId", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockChatReply(
      'I need the exact date.⟦LOG_MEAL⟧{"description":"pizza","date":"UNKNOWN_VAGUE","question":"Which date did you eat this?"}⟦/LOG_MEAL⟧',
    );

    const chatResult = await asUser.action(api.ai.chat, {
      message: "I ate pizza a while ago",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;
    const groupId = (chatResult.clarification as { groupId: string }).groupId;

    const resolved = await asUser.action(api.ai.resolveClarification, { groupId: groupId as any, date: "2026-07-10" });

    expect(resolved.groupId).toBe(groupId);
    expect(resolved.loggedItems).toHaveLength(1);

    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ date: "2026-07-10", name: "Pizza" });

    const group = await t.run((ctx) => ctx.db.get("actionGroups", groupId as any));
    expect(group?.status).toBe("committed");

    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    expect(actions[0]).toMatchObject({ status: "committed", committedRowRef: { table: "meals" } });
  });

  test("resolved group cannot be double-committed", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockChatReply(
      'I need the exact date.⟦LOG_MEAL⟧{"description":"pizza","date":"UNKNOWN_VAGUE","question":"Which date did you eat this?"}⟦/LOG_MEAL⟧',
    );

    const chatResult = await asUser.action(api.ai.chat, {
      message: "I ate pizza a while ago",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;
    const groupId = (chatResult.clarification as { groupId: string }).groupId;

    await asUser.action(api.ai.resolveClarification, { groupId: groupId as any, date: "2026-07-10" });
    await expect(
      asUser.action(api.ai.resolveClarification, { groupId: groupId as any, date: "2026-07-10" }),
    ).rejects.toThrow("Group is not pending clarification");
  });

  test("free-text clarification answer resolves pending group", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    mockChatReply(
      'I need the exact date.⟦LOG_MEAL⟧{"description":"pizza","date":"UNKNOWN_VAGUE","question":"Which date did you eat this?"}⟦/LOG_MEAL⟧',
    );

    const chatResult = await asUser.action(api.ai.chat, {
      message: "I ate pizza a while ago",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
    }) as Record<string, unknown>;
    const groupId = (chatResult.clarification as { groupId: string }).groupId;

    const followUp = await asUser.action(api.ai.chat, {
      message: "2026-07-12",
      sessionId: undefined,
      coachType: "auto",
      today: "2026-07-16",
      clarificationGroupId: groupId as any,
    }) as Record<string, unknown>;

    expect(followUp.loggedItem).toBeDefined();
    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ date: "2026-07-12", name: "Pizza" });
  });
});
