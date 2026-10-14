import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Stack, ThemeProvider, DarkTheme, DefaultTheme, type Theme as NavTheme } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as Sentry from '@sentry/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ClerkProvider, useAuth } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { api } from 'stride-backend/convex/_generated/api'
import { layout } from '@stride/ui-tokens'
import { Polo } from '@/components/Polo'
import { readConfig } from '@/lib/config'
import { initSentry } from '@/lib/sentry'
import { HoldAppContext, HoldOnboardingContext } from '@/lib/profile'
import { font, fontAssets, themedStyles, useTheme } from '@/theme'

initSentry()
void SplashScreen.preventAutoHideAsync()

const config = readConfig()
// Created once; slice 6 starts issuing queries through it.
const convex = config.ok ? new ConvexReactClient(config.convexUrl) : null

// Root: holds the splash until fonts load, then wires theme, Clerk and Convex.
function RootLayout() {
  const t = useTheme()
  const [fontsLoaded, fontError] = useFonts(fontAssets)
  const ready = fontsLoaded || fontError !== null

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.c.bg)
  }, [t.c.bg])

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme
  const navTheme: NavTheme = {
    ...base,
    colors: { ...base.colors, background: t.c.bg, card: t.c.bg, text: t.c.ink, border: t.c.line, primary: t.c.polo },
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
        {config.ok && convex ? (
          <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={tokenCache}>
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <AuthGate />
            </ConvexProviderWithClerk>
          </ClerkProvider>
        ) : (
          <ConfigError problems={config.ok ? [] : config.problems} />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(RootLayout)

// Tabs once signed in with a complete profile, onboarding until then, sign-in when signed out. Polo waits while Clerk and the profile load.
function AuthGate() {
  const s = useStyles()
  const { isLoaded, isSignedIn } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.progress_v2.profileStatus, isAuthenticated ? {} : 'skip')
  // Set by onboarding while it saves, so the reveal stays mounted after the profile turns complete.
  const [holdOnboarding, setHoldOnboarding] = useState(false)
  // Set by Settings while an account delete runs, so its screen and error stay mounted after the data clears.
  const [holdApp, setHoldApp] = useState(false)

  const signedIn = isSignedIn === true
  const waiting = !isLoaded || (signedIn && (isLoading || (isAuthenticated && status === undefined)))
  if (waiting)
    return (
      <View style={s.center}>
        <Polo size={64} />
      </View>
    )

  const complete = status?.complete === true
  return (
    <HoldOnboardingContext.Provider value={setHoldOnboarding}>
      <HoldAppContext.Provider value={setHoldApp}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Protected guard={signedIn && (complete || holdApp)}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !holdApp && (!complete || holdOnboarding)}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </HoldAppContext.Provider>
    </HoldOnboardingContext.Provider>
  )
}

// Clear message instead of a crash when the public env values are missing.
function ConfigError({ problems }: { problems: string[] }) {
  const s = useStyles()
  return (
    <View style={[s.center, s.pad]}>
      <Polo size={64} mood="wow" />
      <Text style={s.title}>Stride needs its keys.</Text>
      {problems.map((p) => (
        <Text key={p} style={s.problem}>
          {p}
        </Text>
      ))}
      <Text style={s.body}>
        Add them to apps/mobile/.env.local (see .env.example), then restart Metro with expo start --clear.
      </Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg },
  pad: { paddingHorizontal: layout.screenX },
  title: { ...font('emptyTitle'), color: t.c.ink, marginTop: 16, marginBottom: 10 },
  problem: { ...font('calloutStrong'), color: t.c.poloInk, textAlign: 'center', marginTop: 4 },
  body: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 12 },
}))
