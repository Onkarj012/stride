"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const chatWithAI = action({
  args: { token: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Unauthorized");

    const today = new Date().toISOString().split("T")[0];
    const meals: any = await ctx.runQuery(api.meals.list, { token: args.token, date: today });
    const workouts: any = await ctx.runQuery(api.workouts.list, { token: args.token, date: today });
    const goals: any = await ctx.runQuery(api.dailyGoals.get, { token: args.token, date: today });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const totalCals: number = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein: number = meals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalCarbs: number = meals.reduce((s: number, m: any) => s + m.carbs, 0);
    const totalFat: number = meals.reduce((s: number, m: any) => s + m.fat, 0);

    const systemPrompt: string = `You are NUTRI_BOT_9000, an elite AI fitness and nutrition coach. You speak in a direct, high-energy, slightly aggressive but encouraging tone. Use ALL CAPS for emphasis on key words. Keep responses concise (2-4 sentences max).

User context today:
- Calories: ${totalCals}/${goals?.calorieGoal || 2400} kcal
- Protein: ${totalProtein}/${goals?.proteinGoal || 180}g
- Carbs: ${totalCarbs}/${goals?.carbGoal || 280}g
- Fat: ${totalFat}/${goals?.fatGoal || 80}g
- Meals logged: ${meals.length}
- Workouts: ${workouts.map((w: any) => w.name).join(", ") || "None"}

Give actionable, specific advice. No generic platitudes.`;

    const response: any = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AI Fitness Tracker",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter error: ${error}`);
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "SYSTEM ERROR. TRY AGAIN.";

    await ctx.runMutation(api.chatMessages.send, {
      token: args.token,
      role: "user",
      content: args.message,
    });
    await ctx.runMutation(api.chatMessages.send, {
      token: args.token,
      role: "ai",
      content,
    });

    return { content };
  },
});
