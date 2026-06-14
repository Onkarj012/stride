# Stride — System Assessment Report
*Generated: 2026-06-10*

---

## 1. AI Architecture

### Main Agent — Stry (Elephant)
- **Role:** Holistic wellness companion, routes to specialists, handles all logging
- **Prompt:** Warm, encouraging, direct. Balances training, nutrition, recovery, hydration, habits, mindset. Has access to full user profile, today's meals/workouts, recent history, **food memory**, **workout memory**, and **user ingredients**.
- **Routing:** Two-pass intent classifier — regex heuristic (`looksLikeLog`) + LLM extraction. Forces retry if heuristic disagrees with LLM.

### Specialist Agents

| Animal | CoachType | Domain | Personality |
|---|---|---|---|
| 🐼 Panda | `diet` | Macros, meals, balance | Analytical but practical, bold macro numbers |
| 🦊 Fox | `workout` | Movement and effort | Precise, technical, motivating |
| 🐻 Bear | `recovery` | Rest and recovery | Calm, measured, science-backed |
| 🦎 Axolotl | `water` | Daily hydration | Simple, practical, specific |
| 🐭 Mouse | `habit` | Small, consistent steps | Empathetic, tiny wins, compounding |
| 🦄 Unicorn | `mindset` | Mood, mindfulness, balance | Warm, grounding, mind-body connection |

**Routing:** Keyword scoring across ~50-100 domain keywords per agent. Falls back to Stry (overall) if no strong match.

**Chat page:** 7 coaching personalities (gentle/motivating/analytical) layered on top of agent routing. Persistent session history. Supports voice (Groq Whisper), image, barcode.

### Agent Orchestration (agents.ts)

| Agent | Status | What it does |
|---|---|---|
| **MemoryAgent** | ✅ **Implemented** | Extracts user-stated facts from messages (e.g., "my homemade paneer has 18g protein per 100g") and silently patches `food_memory` and `user_ingredients` |

*Phase 5 stubs (DietAgent, WorkoutAgent, SleepAgent, CoachAgent) were removed 2026-06-10 — unwired dead scaffolding. Real domain-agent orchestration will be built when needed, not stubbed ahead.*

---

## 2. Calorie & Macro Calculations (Nutrition)

### Pipeline
```
User text → LLM ingredient extraction → Unit conversion → USDA/OFF food cache lookup → User ingredient memory → Food memory match → Deterministic calculation → Blend with AI fallback
```

### Steps
1. **LLM parsing** — extracts structured ingredients (food_text, amount, unit, is_oil_or_fat), cooking method, portion scale, AI-estimated fallback macros
2. **Unit converter** — converts cups/tbsp/tsp/pieces to grams using standard density tables (~50 common foods with known piece weights)
3. **Food cache lookup** — word-level scoring against USDA/OpenFoodFacts cache. Exact match: 100pts, contains: 60pts, word overlap: 20pts/word, verified bonus: +10, USDA bonus: +5. Minimum score 30 to match.
4. **User ingredient memory** — checks `user_ingredients` for custom items (e.g., "homemade paneer") and uses per-100g values if available.
5. **Food memory match** — Jaccard similarity against `food_memory` entries. If `timesLogged >= 2` and match score >= 0.55, auto-applies smoothed macros.
6. **Nutrition calculation** — `(per100g × grams) / 100` for each ingredient
7. **Cooking oil adjustment** — adds oil calories based on method: fried (+15g oil), sautéed (+7g), curry (+8g), tadka (+5g), raw/boiled/grilled (0g)
8. **Portion scaling** — multiplies by portion_scale if user ate fraction of recipe
9. **Blending:**
   - All resolved → pure database result
   - Some unresolved → `max(engine_cals, ai_cals)` for calories, engine for macros where available
   - Nothing resolved → pure AI estimate
10. **Confidence score** — `(avg_item_confidence × match_ratio)`, range 0.1–1.0

### Known Accuracy Issues
- Food cache may be sparse for regional/Indian foods → falls back to AI estimate (confidence ~0.3)
- Cooking oil adjustment uses fixed amounts per method, not actual recipe amounts
- Portion scale relies on LLM to detect "half", "quarter", etc. — can miss implicit portions
- AI fallback macros from GPT-4o-mini are reasonable but not USDA-accurate
- Food memory auto-apply is gated behind `timesLogged >= 2` to avoid early overfitting

---

## 3. Workout Calorie Burn Calculations

### Pipeline
```
User text → LLM exercise parsing → Exercise DB MET lookup → Calorie engine → EPOC → Metabolic factor → Workout memory → Result with confidence range
```

### Formula
```
base_kcal = (MET - 1) × weight_kg × duration_hours
during_workout = base_kcal × intensity_mult × density_mult × compound_mult
epoc = during_workout × epoc_pct
total = (during_workout + epoc) × metabolic_factor
```

### Multipliers
| Factor | Range | Source |
|---|---|---|
| Intensity | 0.85–1.20 | easy/moderate/hard/very_hard |
| Density | 0.90–1.20 | long_rests/normal/short_rests/circuit |
| Compound ratio | 0.95–1.08 | fraction of compound exercises |
| EPOC | 5–12.5% | intensity-based post-exercise burn |
| Metabolic factor | 0.70–1.40 | adaptive, calibrated from user feedback |

### Exercise Database
~100 exercises with MET values from the Compendium of Physical Activities (2011):
- Compound lifts: squat 5.0, deadlift 6.0, bench 4.5, OHP 4.5, pull-up 5.5
- Olympic lifts: power clean 8.0, snatch 9.0
- Cardio: running ~9.8, cycling ~7.5, HIIT ~8.0
- Isolation: curls/extensions 3.5

### Calibration
- Users submit "too_high/accurate/too_low" feedback per workout
- After 5+ feedbacks: metabolic_factor adjusts ±0.02 per feedback
- Range: 0.70–1.40 (capped to prevent extreme drift)
- Fitness level tracked separately (beginner/intermediate/advanced)

### Workout Memory
- Auto-learns from every logged workout via `workout_memory.recordFromWorkout`
- Stores smoothed duration, intensity, calories, exercise list
- 25% weight for new logs
- Used in backend context for workout suggestions

### Known Accuracy Issues
- MET formula assumes steady-state activity; strength training is intermittent → tends to underestimate for high-volume sessions
- Duration often estimated by LLM if not stated → ±15 min error common
- Metabolic factor starts at 1.0 (neutral) and needs 5+ feedbacks to calibrate — new users get generic estimates
- EPOC is a fixed percentage, not measured — real EPOC varies significantly by individual

---

## 4. UI Exposure of Deterministic Engines

### Currently shown:
- **LogConfirmCard (meal):** Confidence bar + percentage + source label ("USDA data" / "DB + AI" / "AI estimate")
- **LogConfirmCard (workout):** Confidence bar + calorie range (e.g., "85% · range 280–340 kcal")
- **History page:** `confidence` and `nutritionSource` stored on meal records, available for display
- **Workout records:** `calorieConfidence`, `calorieRangeLow`, `calorieRangeHigh`, `calorieBreakdown` stored
- **Food memory count:** `getKnownCount` shows number of learned meals
- **Top memories:** `getTopMemoriesPublic` shows top 6 learned meals with kcal and times logged

### Not yet shown:
- Per-ingredient breakdown in meal detail view
- Metabolic profile / calibration status in settings
- Calorie feedback UI on logged workouts (backend exists, no frontend)
- Workout memory entries in UI
- Personal ingredient memory entries in UI

---

## 5. SYSTEM.md Vision Assessment

### The Goal
> "An adaptive AI wellness companion that makes healthy routines easier to sustain" — not a tracking app, but a personalized behavioral system.

### Layer-by-Layer Status

| Layer | Status | Evidence |
|---|---|---|
| **Layer 1 — Input** | ✅ Strong | Text, voice (Whisper), image, barcode, quick-tap water, natural language, multi-modal |
| **Layer 2 — Behavioral Memory** | ✅ Strong | Persistent homepage chat, coaching style, metabolic calibration, **food memory**, **workout memory**, **user ingredients**, **check-in deduplication**, engagement tracking |
| **Layer 3 — Intelligence** | ✅ Strong | 7 specialized agents, keyword routing, deterministic nutrition/calorie engines, heuristic + LLM intent classification, **MemoryAgent** for fact extraction |
| **Layer 4 — Coaching** | ✅ Strong | Daily guidance (getTodayBrief), window-aware greetings, coaching nudges, weekly summaries, AI insights, 3 coaching personalities, **check-in questions**, **command-based guidance** |
| **Layer 5 — Analytics** | 🟡 Partial | Macro charts, streak tracking, progress rows, calendar heatmap, pattern strings. Missing: correlation analysis, recovery pattern detection, prominent pattern UI |
| **Layer 6 — Adaptive Optimization** | 🟡 Early | Metabolic factor calibration, food memory smoothing, workout memory smoothing. Missing: reinforcement learning, reminder adaptation, behavior prediction |

### Principles

| Principle | Grade | Notes |
|---|---|---|
| Frictionless Tracking | **A** | Voice, image, paste, barcode, natural language, quick-tap, re-log button, per-day sessions |
| Personalized Intelligence | **A-** | Coaching style, dietary preferences, calorie targets, metabolic calibration, **food memory**, **personal ingredient memory**, **check-in deduplication**. Not yet learning from ignored recommendations |
| Behavioral Sustainability | **A-** | Recovery mode in streaks, no shame for missed days, gentle re-entry messaging, **check-in questions**, **command-based guidance** |
| Daily Guidance Over Raw Analytics | **A** | Today's Brief with command (doToday/recoverFrom/ignoreToday), coaching nudges, window-aware prompts, check-in questions. Insights page shows actionable tips before charts |
| Emotional Engagement | **A-** | Voxel mascot, playful design, personality-aware coaching, check-in flows. Could improve with adaptive notification timing |

### Verdict

**The app has crossed the threshold** from "a tracking platform" into "an adaptive wellness companion."

**What's working:**
1. AI-first interaction — meals logged through conversation, not forms
2. Deterministic accuracy — real USDA data + MET-based calorie science + food memory + user ingredients
3. Personalization — metabolic calibration, coaching style, dietary preferences, window-aware guidance, check-in questions
4. Low friction — voice, image, re-log, quick-tap, natural language, per-day sessions
5. Emotional design — voxel mascot, pastel palette, no-shame streaks, encouraging tone, check-in flows
6. 7 specialized agents with distinct personalities matching the animal mascots
7. **Adaptive memory** — food memory, workout memory, personal ingredient memory, behavioral memory
8. **Proactive guidance** — today's brief with command-based recommendations, not just data

**What's still needed for the full vision:**
- Domain-agent orchestration (DietAgent/WorkoutAgent/SleepAgent/CoachAgent) — build real, not stubs
- Behavioral memory — track what users respond to, what they ignore
- Proactive outreach — system initiating, not just responding
- Recommendation success tracking — did the user follow the suggestion?
- Calorie feedback UI — backend calibration exists, no frontend
- Per-ingredient breakdown in meal detail view
- Cross-day pattern detection UI — "you always skip protein on Wednesdays"
- Adaptive notification timing
- Web push for nudges

**Bottom line:** The foundation is solid and meaningfully beyond a calorie tracker. The system is a conversational wellness companion with real nutritional science, adaptive memory, and proactive guidance. The next evolution is building **real domain-agent orchestration** (DietAgent/WorkoutAgent/SleepAgent/CoachAgent) and adding **proactive behavioral intelligence**.

---

## 6. Recent Changes (2026-05-28 to 2026-06-10)

### Major Features Added
1. **Personal ingredient memory** — `user_ingredients` table + MemoryAgent extraction
2. **Food memory** — `food_memory` table with Jaccard matching and auto-apply
3. **Workout memory** — `workout_memory` table with smoothed averages
4. **Check-in questions** — window-aware quick questions in `getTodayBrief`
5. **Per-day homepage sessions** — `__HOMEPAGE_${today}__` for fresh daily context
6. **Deterministic confirm cards** — every log produces a visible confirm card
7. **Dynamic per-day targets** — `adjustCaloriesForDay` from `planBreakdown` + today's burn
8. **Coach page layout overhaul** — fixed inset, scroll lock, sidebar toggle, markdown

### Technical Improvements
- Timezone-aware brief (`timezoneOffsetMinutes` from settings)
- Settings synced to Convex (`coachingStyle`, `units`, `notifications`, `timezoneOffsetMinutes`)
- Gamification fully wired (`recordActivity` on all log paths)
- Wellness tables fully wired (water, sleep, mood, steps)
- Food memory public queries (`getKnownCount`, `getTopMemoriesPublic`)

---

*Previous assessment: 2026-05-28*
