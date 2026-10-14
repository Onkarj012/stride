import * as Sentry from '@sentry/react-native'

// Starts crash reporting when a DSN is set. Console and touch breadcrumbs are dropped because they can carry food names or typed text.
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? ''
  if (!dsn) return

  Sentry.init({
    dsn,
    enabled: Boolean(dsn) && (!__DEV__ || process.env.EXPO_PUBLIC_SENTRY_DEV === '1'),
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableNativeCrashHandling: true,
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category === 'touch') return null
      return breadcrumb
    },
  })
}
