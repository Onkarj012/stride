# Mobile App — Known Gaps (post-scaffold)

Estimated completeness vs ui-kit: ~60%

## Icons
- `StrideMark` is placeholder `S` text — restore SVG once dev client rebuilt with `react-native-svg`
- No `lucide-react-native` icons anywhere — tab bar uses unicode chars (`⌂ ⊕ ◈ ▤`), should be lucide `Home / Salad / Dumbbell / BarChart3`
- Chat composer uses emoji (🎤 📷 📦 🏷️ ➜) instead of proper icon components

## Animations / Motion
- No `moti` — using bare Reanimated entering animations (`FadeInDown`, `ZoomIn`) only
- Progress bars use `scaleX + transformOrigin` hack — validate on device (iOS + Android); may need layout-measure approach
- No spring-driven layout transitions (`AnimatePresence` equivalent missing for conditional renders)
- StreakCard bars: `ZoomIn` only, no stagger wave like the web version
- ChatPanel: typing dots are static `FadeInDown` not the repeating bounce from ui-kit
- No `AnimatePresence` on chat messages — messages append without exit animation

## Styling gaps
- Dark mode: using `dark:bg-[#hex]` arbitrary NativeWind classes — verify they actually activate on device
- Shadows: iOS-only `shadowColor/Offset/Opacity/Radius` — Android relies on `elevation` which looks different
- Tab bar: no backdrop blur (RN doesn't support CSS `backdrop-filter`)
- `NarrativeCard` cursor blink uses pipe char `|` not an animated View — visible on dark bg
- `MilestoneCard` dashed borders may not render on Android (RN dashed border support is limited)
- Text opacity modifiers like `text-ink/35` — confirm NativeWind 4 + TW 3.4 handles these correctly

## Missing screens / features
- History overlay (calendar view + day detail)
- Account / profile overlay
- Recipe detail modal + create modal
- Add-meal bottom sheet (`AddSheet`)
- Chat history drawer (slide-in from left)
- Stry chat header: history button is decorative only

## Rebuild required before testing icons
```bash
cd apps/mobile/ios && pod install
# then:
pnpm --filter @stride/mobile add react-native-svg lucide-react-native
expo run:ios   # or expo run:android
```
