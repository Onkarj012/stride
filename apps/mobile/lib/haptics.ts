import { Platform } from 'react-native'

let _Haptics: typeof import('expo-haptics') | null = null
if (Platform.OS !== 'web') {
  try {
    _Haptics = require('expo-haptics')
  } catch {}
}

export const ImpactFeedbackStyle = {
  Light: 'light' as const,
  Medium: 'medium' as const,
  Heavy: 'heavy' as const,
}

export function impactAsync(style: 'light' | 'medium' | 'heavy' = 'light') {
  _Haptics?.impactAsync(style as any)?.catch?.(() => {})
}

export function selectionAsync() {
  _Haptics?.selectionAsync()?.catch?.(() => {})
}

export function notificationAsync(type?: 'success' | 'warning' | 'error') {
  _Haptics?.notificationAsync(type as any)?.catch?.(() => {})
}
