import type { ConfigContext, ExpoConfig } from 'expo/config'

// app.json is the alpha app. APP_VARIANT=dev builds Stride Dev: its own app id, icon and link scheme, so both install side by side.
// Stride Dev is built with `expo run:android`, not EAS Build, so its update channel is set here. A dev profile in eas.json would change the alpha's fingerprint.
export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = { ...config, name: config.name ?? 'Stride', slug: config.slug ?? 'stride-workspace' }
  if (process.env.APP_VARIANT !== 'dev') return base
  // The splash image is native, so it has to follow the dev icon too. Otherwise Stride Dev opens on the alpha's logo.
  const splash = { image: './assets/icon-dev.png', imageWidth: 160, backgroundColor: '#1B1A17' }
  return {
    ...base,
    name: 'Stride Dev',
    scheme: 'stride-dev',
    icon: './assets/icon-dev.png',
    plugins: base.plugins?.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen' ? ['expo-splash-screen', splash] : plugin,
    ),
    updates: { ...base.updates, requestHeaders: { 'expo-channel-name': 'dev' } },
    android: {
      ...base.android,
      package: 'com.stride.mobile.dev',
      adaptiveIcon: { backgroundColor: '#1B1A17', foregroundImage: './assets/icon-dev.png' },
    },
  }
}
