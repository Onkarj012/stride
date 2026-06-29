# Landing device showcase — parked for later refinement

These components render the phone + desktop app mockups that previously
appeared on the signed-out landing page. They've been pulled from the live
page for now and kept here so they can be refined before re-adding.

Files:

- `DeviceShowcase.tsx` — the phone/desktop frames + auto-cycling screen selector.
- `mockScreens.tsx` — the mocked Home / Nutrition / Coach / Insights screens.

The mock screens were updated to track the real app pages (HomePage /
AssistantConsole, NutritionPage, CoachPage, InsightsPage) but still need
design polish.

## To re-enable

1. Move both files back up one level into `src/components/landing/`.
2. In `src/pages/LandingPage.tsx`:
   - re-add `import { DeviceShowcase } from "@/components/landing/DeviceShowcase";`
   - drop the showcase back in before the closing CTA section:
     ```tsx
     <section className="sl-section" style={{ paddingBottom: 0 }}>
       <DeviceShowcase />
     </section>
     ```

The `@/` imports inside these files resolve from anywhere under `src`, so
they keep compiling while parked here (they're just not imported anywhere).
