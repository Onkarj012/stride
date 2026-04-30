"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const generateDailyInsights = action({
  args: { token: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    const meals: any = await ctx.runQuery(api.meals.list, { token: args.token, date });
    const goals: any = await ctx.runQuery(api.dailyGoals.get, { token: args.token, date });

    if (meals.length === 0) return null;

    const totalCals: number = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein: number = meals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalCarbs: number = meals.reduce((s: number, m: any) => s + m.carbs, 0);
    const totalFat: number = meals.reduce((s: number, m: any) => s + m.fat, 0);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const prompt = `Analyze this daily nutrition data and provide 3-4 specific, actionable insights. Each insight should be one sentence. Be direct and slightly motivational.

Goals: ${goals?.calorieGoal || 2400} kcal, ${goals?.proteinGoal || 180}g protein, ${goals?.carbGoal || 280}g carbs, ${goals?.fatGoal || 80}g fat
Actual: ${totalCals} kcal, ${totalProtein}g protein, ${totalCarbs}g carbs, ${totalFat}g fat
Meals: ${meals.map((m: any) => m.name).join(", ")}

Respond with ONLY a JSON array of strings. Example: ["Insight 1", "Insight 2", "Insight 3"]`;

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
          { role: "system", content: "You are a precise nutrition analyst. Respond only with valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate insights");
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "[]";

    let insights: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      insights = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      insights = ["AI analysis temporarily unavailable. Keep tracking!"];
    }

    const existing: any = await ctx.runQuery(api.insights.getDailyInsights, { token: args.token, date });
    if (existing) {
      await ctx.runMutation(api.insights.deleteDailyInsight, { token: args.token, id: existing._id });
    }

    await ctx.runMutation(api.insights.createDailyInsight, {
      token: args.token,
      date,
      insights,
    });

    return insights;
  },
});

export const generateWorkoutSuggestion = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Unauthorized");

    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const allWorkouts: any[] = [];
    for (const date of dates) {
      const w: any = await ctx.runQuery(api.workouts.list, { token: args.token, date });
      allWorkouts.push(...w.map((x: any) => ({ ...x, date })));
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const prompt = `Based on this user's recent workout history, suggest their next workout. Be specific: give the workout name, sets/reps, and a brief rationale.

Recent workouts: ${allWorkouts.map((w: any) => `${w.name} (${w.date})`).join(", ") || "None logged recently"}

Respond with ONLY a JSON object:
{"name": string, "sets": string, "reps": string, "weight": string, "duration": string, "intensity": string, "rationale": string}`;

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
          { role: "system", content: "You are an elite strength coach. Respond only with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate workout suggestion");
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      return {
        name: "Full Body Strength",
        sets: "4x8",
        reps: "8-10",
        weight: "Moderate",
        duration: "45min",
        intensity: "HIGH",
        rationale: "Balanced session to maintain momentum.",
      };
    }
  },
});

export const generateWeeklySummary = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Unauthorized");

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff)).toISOString().split("T")[0];

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }

    let totalCals = 0;
    let totalProtein = 0;
    let totalWorkouts = 0;
    const mealCounts: number[] = [];

    for (const date of days) {
      const meals: any = await ctx.runQuery(api.meals.list, { token: args.token, date });
      const workouts: any = await ctx.runQuery(api.workouts.list, { token: args.token, date });
      const dayCals: number = meals.reduce((s: number, m: any) => s + m.calories, 0);
      const dayProtein: number = meals.reduce((s: number, m: any) => s + m.protein, 0);
      totalCals += dayCals;
      totalProtein += dayProtein;
      totalWorkouts += workouts.length;
      mealCounts.push(meals.length);
    }

    const avgCals = Math.round(totalCals / 7);
    const avgProtein = Math.round(totalProtein / 7);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const prompt = `Analyze this user's weekly fitness data and provide a concise weekly summary (3-5 sentences). Be motivational but honest about areas to improve.

Week stats:
- Avg daily calories: ${avgCals}
- Avg daily protein: ${avgProtein}g
- Total workouts: ${totalWorkouts}
- Days with meals logged: ${mealCounts.filter(c => c > 0).length}/7

Respond with a single paragraph of plain text. No JSON.`;

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
          { role: "system", content: "You are an elite fitness coach writing a weekly summary." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate weekly summary");
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "Weekly analysis unavailable.";

    const existing: any = await ctx.runQuery(api.insights.getWeeklySummary, { token: args.token });
    if (existing) {
      await ctx.runMutation(api.insights.deleteWeeklySummary, { token: args.token, id: existing._id });
    }

    await ctx.runMutation(api.insights.createWeeklySummary, {
      token: args.token,
      weekStart,
      content,
    });

    return { weekStart, content };
  },
});
