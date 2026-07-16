import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, useColorScheme } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ClerkProvider, useAuth } from '@clerk/clerk-expo'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import { requireMobileConfig } from '../lib/mobile-config'
import '../global.css'

const { convexUrl, clerkPublishableKey } = requireMobileConfig()
const convex = new ConvexReactClient(convexUrl)

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  })

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colorScheme === 'dark' ? '#0c0e16' : '#f8f8f8' }} />
  }

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="stry"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="history"
              options={{
                animation: 'slide_from_right',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="account"
              options={{
                animation: 'slide_from_right',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                animation: 'slide_from_right',
                headerShown: false,
              }}
            />
          </Stack>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </SafeAreaProvider>
  )
}
