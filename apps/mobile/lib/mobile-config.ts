import Constants from 'expo-constants'

type MobileExtra = {
  convexUrl?: string
  clerkPublishableKey?: string
}

const extra = (Constants.expoConfig?.extra ?? {}) as MobileExtra

function configuredValue(value: string | undefined, placeholder: string): string | undefined {
  return value && value !== placeholder ? value : undefined
}

export const CONVEX_URL = configuredValue(
  process.env.EXPO_PUBLIC_CONVEX_URL ?? extra.convexUrl,
  '__EXPO_PUBLIC_CONVEX_URL__',
)

export const CLERK_PUBLISHABLE_KEY = configuredValue(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? extra.clerkPublishableKey,
  '__EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY__',
)

/**
 * Set these public values in the Expo environment before running the app.
 * The app.json values are documentation-only placeholders and contain no
 * deployment or Clerk secret.
 */
export function requireMobileConfig(): { convexUrl: string; clerkPublishableKey: string } {
  if (!CONVEX_URL || !CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing EXPO_PUBLIC_CONVEX_URL or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Set both in the Expo environment.',
    )
  }
  return { convexUrl: CONVEX_URL, clerkPublishableKey: CLERK_PUBLISHABLE_KEY }
}
