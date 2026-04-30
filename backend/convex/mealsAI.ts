"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const estimateWithAI = action({
  args: { token: v.string(), mealName: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Unauthorized");

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const response: any = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Stride",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a nutrition expert. Given a meal name, estimate its nutritional values per typical serving. Respond ONLY with a JSON object in this exact format:
{"calories": number, "protein": number, "carbs": number, "fat": number, "suggestion": string}
The suggestion should be a brief 1-sentence tip about improving the meal.`,
          },
          {
            role: "user",
            content: `Estimate nutrition for: ${args.mealName}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter error: ${error}`);
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      return {
        calories: Math.round(parsed.calories) || 0,
        protein: Math.round(parsed.protein) || 0,
        carbs: Math.round(parsed.carbs) || 0,
        fat: Math.round(parsed.fat) || 0,
        suggestion: parsed.suggestion || "",
      };
    } catch (e) {
      return {
        calories: 400,
        protein: 25,
        carbs: 45,
        fat: 15,
        suggestion: "Add a side of vegetables for extra nutrients.",
      };
    }
  },
});
