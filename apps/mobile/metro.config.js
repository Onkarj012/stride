// Metro config: keeps Sentry source maps and debug IDs working in EAS builds.
// The dev source-context endpoint is off because it serves local files to the LAN.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

module.exports = getSentryExpoConfig(__dirname, { enableSourceContextInDevelopment: false })
