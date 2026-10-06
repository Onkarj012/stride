---
name: mobile-quality-gaps
description: Mobile app scaffold is ~60% faithful to ui-kit — icons, animations, and some screens still missing
metadata:
  type: project
---

Mobile scaffold built (branch: feat/mobile-scaffold) but quality gaps remain vs `docs/ui-kit/src/mobile/MobileApp.tsx`.

**Why:** react-native-svg not in dev client build (crash), moti not wired, full animation parity not done yet.

**How to apply:** Before starting any mobile polish/M1 work, check `docs/MOBILE_TODO.md` for the full gap list. Prioritize: (1) rebuild dev client with react-native-svg, (2) swap lucide-react-native icons, (3) add AnimatePresence-equivalent for chat messages.

Key gaps:
- Icons: StrideMark is `S` text placeholder; tab icons are unicode; chat composer uses emoji
- Animations: bare Reanimated entering only, no repeating animations (typing dots, streak bars), no exit animations
- Styling: dark mode untested on device, dashed borders may fail Android, no backdrop blur on tab bar
- Missing screens: History, Account, Recipe modal, Add-meal sheet, Chat history drawer
