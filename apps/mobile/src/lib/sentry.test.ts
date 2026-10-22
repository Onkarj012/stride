import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react-native'
import type { Breadcrumb } from '@sentry/react-native'
import { initSentry } from './sentry'

vi.mock('@sentry/react-native', () => ({ init: vi.fn() }))

type InitOptions = Parameters<typeof Sentry.init>[0]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.mocked(Sentry.init).mockClear()
})

// Runs initSentry and returns the options it passed to Sentry.init.
function initOptions(): InitOptions {
  initSentry()
  const options = vi.mocked(Sentry.init).mock.calls[0]?.[0]
  if (!options) throw new Error('Sentry.init was not called')
  return options
}

// Reporting stays off without a DSN, and typed text or food names never leave in breadcrumbs.
describe('initSentry', () => {
  it.each([undefined, '', '   '])('does not start Sentry when the DSN is %j', (dsn) => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', dsn)
    initSentry()
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('enables production reporting with a DSN and no PII', () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    expect(initOptions()).toMatchObject({ enabled: true, sendDefaultPii: false, environment: 'production' })
  })

  it('keeps dev builds off unless EXPO_PUBLIC_SENTRY_DEV is 1', () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DEV', undefined)
    expect(initOptions()).toMatchObject({ enabled: false, environment: 'development' })
  })

  it('turns dev reporting on with EXPO_PUBLIC_SENTRY_DEV set to 1', () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DEV', '1')
    expect(initOptions()).toMatchObject({ enabled: true, environment: 'development' })
  })

  it('drops console and touch breadcrumbs', () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    const beforeBreadcrumb = initOptions().beforeBreadcrumb
    if (!beforeBreadcrumb) throw new Error('beforeBreadcrumb is not set')
    expect(beforeBreadcrumb({ category: 'console', message: 'chicken 200 g' })).toBeNull()
    expect(beforeBreadcrumb({ category: 'touch' })).toBeNull()
  })

  it('keeps other breadcrumbs unchanged', () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    const beforeBreadcrumb = initOptions().beforeBreadcrumb
    if (!beforeBreadcrumb) throw new Error('beforeBreadcrumb is not set')
    const crumb: Breadcrumb = { category: 'navigation', data: { to: '/tabs' } }
    expect(beforeBreadcrumb(crumb)).toBe(crumb)
  })
})
