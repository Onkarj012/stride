// Metro config: keeps Sentry source maps and debug IDs working in EAS builds.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

module.exports = getSentryExpoConfig(__dirname)
