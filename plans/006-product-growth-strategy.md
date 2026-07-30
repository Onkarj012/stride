# Stride — Product & Growth Strategy (12 months)

> Produced 2026-07-20. Recon: gpt-5.6-luna (read-only sweep of apps/web, apps/mobile, packages/backend). Strategy synthesis: gpt-5.6-sol. Orchestrated per repo agent rules.
> Prerequisite: complete `plans/005-beta-release.md` P0 hardening before Week 1 of the 90-day plan below.

# Stride: 12-Month Strategic Plan

## 1. STRATEGIC POSITION

Stride should win on one promise:

> “Tell Stride what happened. It remembers, understands, and helps you decide what to do next.”

MyFitnessPal wins on database breadth. Lose It wins on simplicity and familiarity. MacroFactor wins on analytical rigor and adaptive calorie targets. Cal AI owns the visually compelling “take a photo” demo and claims more than 5M users. citeturn1view2

Stride should not compete on database size, calorie precision, or feature count.

The wedge is:

- Natural-language logging across food, workouts, weight, sleep, mood, and symptoms.
- A persistent AI coach that remembers preferences and context.
- Daily and weekly narratives that turn logs into decisions.
- One system connecting nutrition, training, recovery, and adherence.
- A forgiving experience for people who abandon traditional trackers.

The product category should be “adaptive wellness operating system,” not “AI calorie counter.”

### First 1,000 users

Target people who already understand the value of tracking but hate the labor:

- 400 busy strength-training adults trying to lose fat or maintain muscle.
- 250 returning dieters who have abandoned MyFitnessPal-style tracking.
- 200 recreational athletes who need food, training, and recovery in one place.
- 100 nutrition-conscious professionals who want coaching without a human coach.
- 50 fitness creators, coaches, and power users who can generate feedback and referrals.

Prioritize ages 25–45, English-speaking, smartphone-heavy, already familiar with macros or structured workouts.

Do not initially target:

- Clinical weight-management users.
- Serious bodybuilders demanding laboratory-grade nutrition data.
- Families needing multi-user accounts.
- General wellness users with no clear recurring behavior.
- Users who expect medical advice.

The first 1,000 should be behaviorally narrow, not demographically broad.

### Strategic product thesis

Stride’s moat will not be the underlying model. Models commoditize.

The moat is the longitudinal personal dataset created through low-friction logging:

1. The user logs naturally.
2. Stride learns recurring foods, workouts, timing, preferences, and failures.
3. Stry produces more relevant guidance.
4. Guidance makes the next action easier.
5. Better guidance increases logging frequency and retention.

The critical product metric is not “AI response quality” in isolation. It is whether users continue logging after the novelty of AI disappears.

## 2. WEB ROADMAP

### Q1: Beta hardening and activation

Complete the existing P0 beta plan before adding meaningful surface area.

Priorities:

- Finish security and cost-shield work.
- Finish canonical-write and data-integrity work.
- Add Convex-side observability for failed parses, duplicate writes, latency, and AI spend.
- Make the first-log experience exceptional.
- Surface daily goals and the first useful Stry narrative.
- Add correction flows when AI guesses incorrectly.
- Add invite gating, waitlist capture, and beta feedback collection.
- Add basic product analytics and event taxonomy.
- Add metadata, sitemap, robots, and share previews.

Q1 success target:

- 70% of invited users complete onboarding.
- 60% submit a first valid log.
- 40% reach three valid logs in seven days.
- 25% return in week two.
- Less than 2% of logs require support intervention.
- AI cost per weekly active user remains below $0.50 during beta.

### Q2: Retention system

Build the loop that makes Stride useful every day.

Priorities:

- Daily dashboard with goal progress and next-best action.
- Weekly narrative with trends, wins, gaps, and one recommended adjustment.
- Saved meals, recent meals, repeat workouts, and one-tap edits.
- Metabolic calibration surfaced as a transparent “Stride is learning your needs” experience.
- Gamification surfaced as lightweight progress, not a game overlay.
- Streak rescue and flexible adherence states.
- Better empty states and recovery from missed days.
- Exportable progress summaries.

Q2 success target:

- D30 retention above 8% overall.
- D30 retention above 15% among activated users.
- At least 3.5 meaningful logging days per active user per week.
- At least 35% of active users view a weekly narrative.
- At least 20% of active users use Stry weekly.

### Q3: Acquisition-ready web product

Turn the web app into a conversion and sharing surface.

Priorities:

- Public marketing pages for each core input mode.
- Public sample narratives and anonymized progress examples.
- Shareable insight cards with privacy controls.
- Referral links and invite attribution.
- SEO landing pages tied to real user intent.
- Lightweight coach or creator invite tools.
- Improved onboarding experiments with feature flags.
- Public changelog and trust/security page.

Q3 success target:

- Landing visitor-to-waitlist conversion above 20%.
- Waitlist-to-activated-user conversion above 35%.
- At least 15% of new users attributed to referrals or shared content.
- At least 10% of weekly active users generate a shareable artifact monthly.

### Q4: Web monetization and ecosystem

Priorities:

- Paid plans with usage-aware AI limits.
- Billing, entitlement, cancellation, and restore flows.
- Calendar integrations and basic wearable imports only if demand is proven.
- Better data export and account portability.
- Creator or coach dashboards only after consumer retention is established.
- Team or workplace wellness experiments only as a small pilot.

### What not to build on web

Do not build:

- A giant food database before demand proves it necessary.
- A social feed.
- Public leaderboards.
- A full meal-planning marketplace.
- A recipe publishing community.
- Medical or diagnostic recommendations.
- Complex workout programming software.
- Dozens of AI personas with little usage differentiation.
- Custom model training infrastructure.
- An ad-supported free tier.
- A desktop-native app.
- A broad “everything health” dashboard.

The web product should remain the fastest place to understand Stride’s intelligence and the easiest place to operate beta infrastructure.

## 3. MOBILE ROADMAP

Mobile should be the primary long-term logging surface, but not the first go-to-market surface.

The recommendation is:

> Web-first beta and learning; mobile-led acquisition after mobile reaches reliable capture parity.

Mobile has the camera, microphone, notifications, and habit proximity needed for sustained use. Shipping a weak mobile shell early would create poor reviews and false retention signals.

### Phase 1: Mobile foundation

Complete before capture work:

- Real Clerk authentication.
- Correct signed-out, loading, and signed-in routing.
- Remove hard-coded identity assumptions.
- Account creation, sign-in, sign-out, and session restoration.
- Error boundaries and offline/loading states.
- Sentry or equivalent mobile telemetry.
- Shared API contracts for user identity and core records.
- Consistent date/timezone handling.

### Phase 2: Capture parity

Build in this order:

1. Natural-language text logging.
2. Voice capture and transcription.
3. Photo meal capture.
4. Barcode scanning.
5. OCR for labels and receipts.
6. Correction and confirmation flows.
7. Repeat/recent item shortcuts.

Text and voice should ship before barcode and OCR because they reinforce the core wedge with less dependency and lower implementation risk.

Every capture mode must produce the same canonical write path.

### Phase 3: Core product parity

Add:

- Daily dashboard.
- Goals and progress.
- Stry conversations.
- Food history and repeat meals.
- Workout logging and editing.
- Weight and body metrics.
- Daily goals.
- Gamification.
- Calibration status.
- Settings synced to the backend.

Settings must not remain local-only.

### Phase 4: Release engineering

Use Expo EAS for:

- Development builds.
- Internal distribution.
- iOS TestFlight.
- Android internal and closed testing.
- Versioned production channels.
- Crash and performance monitoring.
- Environment separation between development, beta, and production.

TestFlight should begin only after:

- Authentication is real.
- All capture modes have stable error handling.
- Core writes are idempotent.
- App resumes correctly after backgrounding.
- AI failures degrade gracefully.
- Account deletion and data export are testable.

### Phase 5: Store launch

Launch iOS first if the first 1,000 users are disproportionately iPhone users and creator-led. Launch Android in parallel only if the Expo surface is genuinely stable on both platforms.

Store launch gates:

- 95%+ successful capture completion in beta telemetry.
- Crash-free sessions above 99.5%.
- No known data-loss path.
- D7 mobile retention above 20% in invited cohorts.
- At least 50 users willing to provide public reviews.
- App Store screenshots and listing copy focused on effortless logging, not generic AI.

### Shared-package extraction strategy

Extract shared logic in three waves:

1. `packages/contracts`
   - DTOs.
   - Enums.
   - Input types.
   - Validation schemas.
   - Event names.

2. `packages/domain`
   - Date and timezone utilities.
   - Normalizers.
   - Goal calculations.
   - Formatting rules.
   - Canonical client-side transformations.

3. `packages/data`
   - Shared data hooks.
   - Query/mutation wrappers.
   - Loading/error conventions.
   - Cache and optimistic-update helpers where compatible.

Do not force UI components into a shared package yet. Web and React Native should share domain behavior and contracts before visual components.

The extraction rule is simple:

> If duplicated code can create inconsistent user data, share it. If it only creates visual similarity, defer it.

## 4. FEATURE ROADMAP

| Rank | Feature | Retention | Acquisition | Solo-dev cost | AI cost | Decision |
|---|---|---:|---:|---:|---:|---|
| 1 | Reliable text/voice/photo logging | Very high | Very high | Medium | Medium-high | Build now |
| 2 | Confirmation and correction loop | Very high | Medium | Small | Low | Build now |
| 3 | Recent meals, saved meals, repeat workouts | Very high | Low | Small | Low | Build now |
| 4 | Daily goals and next-best action | High | Low | Small | Low-medium | Surface now |
| 5 | Weekly Stry narrative | High | Medium | Medium | Medium | Build next |
| 6 | Metabolic calibration | High | Medium | Medium | Low-medium | Surface now |
| 7 | Gamification, XP, missions, streak rescue | Medium-high | Medium | Small-medium | Low | Surface now |
| 8 | Stry memory and personalization | High | Medium | Medium | Medium | Build next |
| 9 | Shareable insight cards | Medium | High | Small | Low | Build next |
| 10 | Barcode and OCR | Medium | High | Medium | Medium | Build after voice/photo |
| 11 | Workout templates and progression | Medium-high | Low | Medium-high | Low | Later |
| 12 | Wearable integrations | Medium | Medium | High | Low | Validate first |
| 13 | Social feed and community | Unclear | Medium | Very high | Low | Do not build |
| 14 | Medical or diagnostic coaching | Unclear | Low | Very high | High | Do not build |

### AI-cost policy

Use AI where it removes user effort or creates differentiated judgment.

Do not use AI for:

- Basic goal arithmetic.
- Streak calculations.
- Repeated food lookups.
- Deterministic normalization.
- Static educational content.
- Simple weekly totals.

Use deterministic systems first, then AI for:

- Parsing natural language.
- Image interpretation.
- Summarization.
- Personalized recommendations.
- Conversational coaching.

Cost controls:

- Cache repeated inputs.
- Store normalized results.
- Ask for confirmation before expensive follow-up calls.
- Use small models for extraction and classification.
- Reserve Sonnet-class calls for high-value coaching.
- Set per-user monthly AI budgets.
- Track cost per event and cost per retained user.
- Degrade to deterministic summaries when AI budgets are exceeded.

### Surface existing backend investment

Gamification should appear in the daily dashboard as:

- Today’s progress.
- One attainable mission.
- XP earned for consistency.
- A streak rescue option after a missed day.
- Weekly progress toward a personally chosen behavior.

Metabolic calibration should appear as:

- “Stride is learning your real maintenance needs.”
- Confidence level.
- Data completeness.
- What changed this week.
- A plain-language recommendation.
- A clear disclaimer that it is an estimate, not medical advice.

Daily goals should become the primary habit loop, not a buried API.

## 5. GROWTH ENGINE

### Analytics recommendation

Use PostHog for product analytics across React web and Expo mobile.

Use:

- PostHog client SDKs for web and mobile events.
- Convex server-side events for canonical writes, AI costs, parse failures, and entitlement changes.
- Sentry for crashes and technical exceptions.
- UTM, referral, invite, and campaign attribution on every signup.
- No raw food photos, voice recordings, or sensitive health text in analytics payloads.

PostHog is preferable for a solo developer because it combines event analytics, funnels, cohorts, feature flags, and lightweight session inspection in one system.

### Required funnel events

Acquisition:

- `landing_viewed`
- `cta_clicked`
- `waitlist_joined`
- `invite_sent`
- `invite_accepted`
- `referral_link_opened`

Onboarding:

- `signup_started`
- `signup_completed`
- `goal_selected`
- `preferences_completed`
- `onboarding_completed`

Logging:

- `log_started`
- `log_submitted`
- `log_parsed`
- `log_confirmed`
- `log_corrected`
- `log_failed`
- `capture_mode_selected`
- `voice_transcribed`
- `photo_analyzed`
- `barcode_scanned`

Value:

- `daily_summary_viewed`
- `daily_goal_completed`
- `stry_opened`
- `stry_recommendation_accepted`
- `weekly_narrative_viewed`
- `calibration_viewed`
- `mission_started`
- `mission_completed`

Retention and monetization:

- `day_returned`
- `streak_rescued`
- `share_card_created`
- `share_card_opened`
- `paywall_viewed`
- `trial_started`
- `subscription_started`
- `subscription_cancelled`
- `subscription_renewed`

### Activation metric

Primary activation:

> A new user completes onboarding, creates three valid logs across at least two days in the first seven days, and views one personalized daily summary or Stry response.

Supporting early-aha metric:

> First valid log successfully confirmed within ten minutes of signup.

Track both. The first metric measures immediate product quality. The second measures habit formation.

Planning targets:

- Signup-to-first-log: 60%+.
- First-log confirmation: 85%+.
- Seven-day activation: 35%+.
- Activated-user D30 retention: 15%+.
- Free-to-paid conversion within 30 days: 5–8%.
- Monthly paid churn: below 8%.
- AI cost per paid user: below 15% of net revenue.

### Retention loops

1. Daily loop  
   Log something, see progress, receive one useful next action.

2. Weekly loop  
   Review narrative, identify one pattern, adjust one behavior.

3. Memory loop  
   Reuse prior meals, workouts, and preferences to reduce future effort.

4. Progress loop  
   Earn XP and complete missions for consistency, not perfection.

5. Recovery loop  
   After a missed day, show a low-friction restart rather than punishment.

6. Sharing loop  
   Share a useful insight or streak artifact without exposing private health data.

### Sharing and referrals

Build privacy-safe artifacts:

- “This week I hit my protein goal four times.”
- “My average dinner prep time fell by 18 minutes.”
- “Stride found my most consistent workout window.”
- “Seven-day consistency report.”

Never make the default share card reveal:

- Weight.
- Calories.
- Medical information.
- Food photos.
- Body measurements.

Referral mechanic:

- Every user receives three beta invites.
- Referrer gets one week of premium AI credits when a friend becomes activated.
- Friend receives seven days of premium capture.
- Unlock additional invites after the referrer reaches two active weeks.
- Cap rewards to prevent abuse.

### Waitlist and beta mechanics

Use a simple ladder:

- Join waitlist.
- Select primary goal.
- Select preferred capture mode.
- Receive position and expected access window.
- Invite one friend to move up one tier.
- Receive an onboarding survey after access.
- Automatically request feedback after the third confirmed log and first weekly narrative.

Do not optimize for a large waitlist. Optimize for activated users who generate useful product evidence.

## 6. DISTRIBUTION & ADVERTISING

### ASO

Primary store positioning:

- “AI food and fitness tracker”
- “Log meals by voice”
- “Photo calorie tracker with coaching”
- “Personal AI nutrition coach”
- “Macro tracker without manual searching”

Screenshot sequence:

1. Say or photograph what you ate.
2. Confirm the result.
3. See today’s goals.
4. Ask Stry what to do next.
5. Review your weekly pattern.

Avoid generic screenshots of dashboards without a clear user outcome.

### SEO and content

Build high-intent pages:

- AI calorie tracker.
- Voice food diary.
- Photo meal logger.
- Macro tracker for beginners.
- Food tracker for strength training.
- Calorie tracker for Indian food.
- Protein tracker without weighing every ingredient.
- How to track restaurant meals.
- How to restart after falling off a diet.
- AI workout and nutrition journal.
- MacroFactor alternatives.
- MyFitnessPal alternatives for effortless logging.

Each page needs:

- A working interactive demo.
- One concrete example.
- Honest limitations.
- A signup CTA.
- Structured metadata.
- Internal links to related use cases.

Do not build hundreds of thin programmatic SEO pages.

### TikTok, Reels, and Shorts

The strongest creative is proof of effort reduction:

- Speak a chaotic meal into the phone.
- Show the parsed result.
- Correct one assumption.
- Show the updated daily goal.
- Ask Stry for dinner advice.
- Show the weekly narrative.

Other angles:

- “I stopped searching food databases.”
- “What I ate today, logged in 30 seconds.”
- “Can AI understand a homemade Indian meal?”
- “I missed three days. Here’s how Stride handled it.”
- “The difference between a calorie counter and a coach.”

Publish three short videos weekly for 12 weeks before judging the channel.

### Reddit and communities

Participate where users already discuss:

- Macro tracking.
- Strength training.
- Weight-loss plateaus.
- Meal prep.
- ADHD-friendly habits.
- Fitness technology.
- Calorie tracking frustration.

Lead with transparent build-in-public posts, experiments, and useful findings.

Do not spam links or pretend to be a neutral user.

### Product Hunt

Launch only after:

- Mobile app is store-ready.
- Onboarding is stable.
- At least 50 users have completed two weeks.
- There are five credible testimonials.
- The product has one memorable demo.
- Support response can be handled personally for 72 hours.

Use Product Hunt for credibility, not as the primary growth engine.

### Paid acquisition

Do not buy traffic before activation and D30 retention are credible.

Test budgets:

- Month 1: $300 maximum.
- Month 2: $750 maximum.
- Month 3: $1,500 maximum only if cohort quality improves.
- Never scale more than 25% week over week.

Initial channels:

- TikTok Spark Ads for the best organic demo.
- Meta short-form video retargeting.
- Apple Search Ads only for high-intent terms after ASO conversion is known.

Planning guardrails:

- Landing visitor-to-signup: 8%+.
- Signup-to-first-log: 60%+.
- Paid CAC to activated user: below $15.
- Paid CAC to subscriber: below $40 initially.
- Three-month gross contribution must exceed acquisition cost.
- Stop any creative with high installs but less than 20% D7 retention.

Treat published fitness-app CAC figures as noisy. Use cohort economics and Stride’s own funnel as the source of truth. Industry retention benchmarks vary substantially by category and geography; Adjust, for example, reports Health & Fitness Day-1 retention reaching 24% in APAC and Europe. citeturn0search1

### Micro-influencers

Recruit 20 creators with 5,000–50,000 followers:

- Strength coaches.
- Busy-parent fitness creators.
- Nutrition educators.
- ADHD/productivity creators.
- Recreational runners and lifters.

Offer:

- Free annual Pro access.
- Custom referral link.
- 20% of first-year net subscription revenue for referred paid users.
- Direct founder support.
- No guaranteed claims about weight loss.

Prefer creators who demonstrate routines and decision-making over creators who only post physique content.

## 7. MONETIZATION

### Recommended pricing

Launch with:

- Free: unlimited manual logging, 10 AI-assisted logs per month, basic daily totals, limited Stry access.
- Pro monthly: $12.99.
- Pro annual: $79.99.
- Beta founder annual: $59.99 for the first 500 paid users.
- No lifetime plan.

MacroFactor currently prices one app at $11.99 monthly and $71.99 annually, with an $89.99 nutrition/workouts bundle. citeturn2search0 Stride can charge slightly more annually only if the AI coach and multi-modal capture demonstrably save time.

### Freemium line

Keep the habit-forming core free:

- Manual logging.
- Basic history.
- Basic goals.
- Limited recent-item reuse.
- A small number of AI logs.

Charge for:

- High-volume voice/photo/OCR parsing.
- Stry conversations beyond a monthly allowance.
- Weekly narratives.
- Metabolic calibration.
- Advanced history and exports.
- Personalized missions.
- Premium sharing templates.

Never make data export or account deletion paid.

### When to introduce payment

Do not monetize before:

- 300 activated beta users.
- At least 100 users completing two weeks.
- At least 30 users asking for more AI usage or deeper insights.
- AI cost per activated user is known.
- The correction loop is reliable.

Use a 7-day trial after the user has experienced:

- Three confirmed logs.
- One Stry interaction.
- One daily summary.
- One weekly or multi-day pattern.

Do not show a paywall before the first clear product moment.

### Unit economics

Model revenue after platform fees, refunds, support, AI inference, transcription, image processing, storage, and email.

At $12.99 monthly:

- 15% platform fee leaves approximately $11.04 before other costs.
- Target AI and variable infrastructure cost below $1.65 per paid user monthly.
- Target contribution margin above 70%.
- Set hard monthly AI budgets for free users.

Apple’s Small Business Program offers a 15% commission rate for eligible developers. citeturn3search0 Google Play lists a 15% fee for automatically renewing subscriptions. citeturn3search2

## 8. RISKS & KILL CRITERIA

### 1. AI logging is impressive but not trustworthy

Leading indicators:

- Correction rate above 25%.
- Users abandon after the first incorrect result.
- Support tickets mention “I don’t trust the calories.”
- Photo estimates vary wildly for common meals.

Kill or narrow the claim if:

- Fewer than 70% of first logs are accepted without major correction.
- Users do not return after experiencing the core capture flow.

### 2. The product becomes a generic chatbot

Leading indicators:

- Stry sessions increase but logging does not.
- Users ask general fitness questions but do not use personal data.
- Narrative views do not predict return behavior.

Kill criterion:

- Stry-active users do not retain at least 20% better than non-Stry active users after two cohorts.

### 3. AI cost scales faster than revenue

Leading indicators:

- AI cost exceeds $0.50 per WAU during beta.
- Free users generate excessive image or voice calls.
- High-cost conversations have low retention impact.

Kill criterion:

- Paid-user gross contribution remains below 50% after model, storage, and platform costs.

### 4. Mobile quality damages trust

Leading indicators:

- Crash-free sessions below 99.5%.
- Capture failure above 5%.
- App-store reviews mention login, sync, or lost data.
- Mobile D7 retention is below web retention by more than 30%.

Kill criterion:

- Pause acquisition and store expansion until the mobile reliability gap closes.

### 5. Effortlessness does not create habit

Leading indicators:

- First-log conversion is strong but D7 collapses.
- Users log only during onboarding.
- Weekly narratives are ignored.
- Users do not reuse saved meals or repeat workouts.

Core-bet falsification:

- After three onboarding and capture iterations, activated D30 retention remains below 8%.
- Users report that logging is easy but do not change behavior or return.
- No input mode produces a materially higher second-week retention cohort.

## 9. 90-DAY ACTION PLAN

Assumption: the beta hardening plan is complete before Week 1.

| Week | Work |
|---|---|
| 1 | S / web: finalize beta onboarding and first-log copy. S / growth: define PostHog event taxonomy. S / content: write beta invitation and feedback scripts. |
| 2 | M / web: ship daily goals and first personalized summary. S / growth: instrument signup-to-first-log funnel. S / content: create three AI-logging demo scripts. |
| 3 | S / web: ship correction UX and recent-item shortcuts. S / growth: add waitlist, invite attribution, and referral tracking. |
| 4 | M / web: surface metabolic calibration with confidence and explanation. S / growth: launch first 25-user cohort review. S / content: publish first build-in-public post. |
| 5 | M / web: surface gamification as missions, XP, and streak rescue. S / growth: create activation cohort dashboard. M / mobile: implement real Clerk auth and route states. |
| 6 | M / mobile: remove hard-coded identity and connect real user data. S / mobile: add loading/error/empty states. S / growth: add mobile Sentry and source attribution. |
| 7 | M / web: ship weekly Stry narrative. M / mobile: implement shared contracts and date utilities. S / content: publish two use-case SEO pages. |
| 8 | M / mobile: implement text logging with canonical writes. S / web: add shareable insight cards. S / growth: start referral reward experiment. |
| 9 | M / mobile: implement voice capture and transcription. S / web: add privacy-safe sharing controls. S / content: record three short-form capture demos. |
| 10 | M / mobile: implement photo capture and confirmation. S / growth: compare text, voice, and photo activation cohorts. M / shared: extract normalizers and DTO validation. |
| 11 | M / mobile: implement barcode scanning and failure recovery. S / web: ship remaining SEO metadata, sitemap, and social previews. |
| 12 | L / mobile: add core parity for goals, history, Stry, and recent meals. M / mobile: create EAS beta builds. S / growth: recruit first 10 micro-influencers. |
| 13 | L / mobile: begin TestFlight and Android closed testing. M / QA: run invited-user reliability cohort. S / monetization: instrument trial and paywall without charging broadly. |

### 90-day gates

At Day 30:

- Web activation funnel is measurable.
- Mobile authentication is real.
- Daily goals, calibration, gamification, and weekly narrative are surfaced.
- At least 100 invited users have usable event histories.

At Day 60:

- Voice and photo logging work on mobile.
- Shared contracts and normalizers are extracted.
- Referral and share-card experiments are live.
- Three content channels have repeatable publishing formats.

At Day 90:

- Mobile is in TestFlight and closed testing.
- At least 35% of beta users meet the activation definition.
- Activated D30 retention is at least 15% or shows a clear upward trend.
- AI cost per active user is understood.
- Stride has evidence for whether effortless logging creates durable habit.

The strategic decision at Day 90 is not “what feature comes next.” It is whether Stride has earned the right to scale distribution.


---

# Appendix A — Codebase recon snapshot (2026-07-20, gpt-5.6-luna)

Condensed findings that ground the plan above; full evidence paths verified against the repo at recon time.

## Web (apps/web)
Near feature-complete: Home, Nutrition, Recipes, Workouts, Coach (Stry), Insights, History, Onboarding all solid or rough-solid. Gaps: nutrition modality picker just routes into Coach; meal/workout creation centralized in Coach/Home rather than native page forms; mobile-settings parity TODO (`ProfilePage.tsx:890`); landing demos are static.

## Mobile (apps/mobile)
Functional signed-in data shell, ~40% of web surface. Clerk+Convex providers wired (`app/_layout.tsx`), but:
- No auth flow — root always redirects to tabs (`app/index.tsx`); identity hard-coded in `app/account.tsx`; sign-out button has no handler.
- Voice/photo/barcode/OCR capture are stubs; add sheet never opened by any control (`app/(tabs)/nutrition.tsx`).
- Workouts read-only (`getWorkouts` only); `RecipeCreateModal` exists but never rendered.
- Settings/account are local component state only; no mobile Sentry.

## Backend (packages/backend/convex)
Full domain coverage: meals/recipes/workouts CRUD + drafts, coach/AI, personas, food/workout memory, wellness/recovery, check-ins/nudges, insights/history/patterns, plans/TDEE, gamification, canonical envelopes/undo/telemetry.

Built but unsurfaced by any client: `calibration.ts`, `gamification.ts`, `goals.ts` public API, `history.getHistoryInsights`, `wellness.getTodaySummary`, `meals.setMealCalorieSource`. Telemetry is lifecycle-only, not product analytics.

## Shared code
`packages/shared` = design tokens only; neither app imports it. Duplicated: `localDateStr`, exercise parsing/normalization, DTO shapes. Missing seams: contracts, date/timezone utils, normalizers, data hooks.

## Growth surfaces
All absent: product analytics, referrals, sharing, invite/waitlist, OG/Twitter metadata, sitemap/robots. Landing page exists; web Sentry only; mobile "analytics sharing" toggle is a dead local switch.

## Top 10 gaps (ranked)
1. Mobile: no auth flow, real identity, or sign-out.
2. Mobile: voice/photo/barcode/OCR capture unimplemented shells.
3. Mobile: workouts read-only.
4. Mobile: no meal/recipe create/edit/delete.
5. Mobile: settings/profile hard-coded or local-only.
6. Mobile: missing memory approvals, nudges, check-ins, barcode, insights, charts.
7. Shared-code extraction insufficient — duplicate logic will drift.
8. Backend gamification + calibration have no client surface.
9. No product analytics or funnel measurement.
10. No referral, invite, sharing, social-proof, or SEO/social metadata.
