// Sends the Google callback to home, so Expo Router never shows "Unmatched route" for it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return path.includes('sso-callback') ? '/' : path
}
