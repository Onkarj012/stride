export type AppConfig =
  | { ok: true; clerkPublishableKey: string; convexUrl: string }
  | { ok: false; problems: string[] }

// Reads the public env values Expo inlines at bundle time and reports anything missing or malformed.
export function readConfig(): AppConfig {
  const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? ''
  const problems: string[] = []

  if (!clerkPublishableKey) problems.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set.')
  else if (!clerkPublishableKey.startsWith('pk_'))
    problems.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY should start with pk_.')

  if (!convexUrl) problems.push('EXPO_PUBLIC_CONVEX_URL is not set.')
  else if (!/^https:\/\/\S+$/.test(convexUrl))
    problems.push('EXPO_PUBLIC_CONVEX_URL should be an https:// URL.')

  return problems.length ? { ok: false, problems } : { ok: true, clerkPublishableKey, convexUrl }
}
