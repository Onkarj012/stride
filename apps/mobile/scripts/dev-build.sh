#!/usr/bin/env bash
# Builds Stride Dev as a release APK, installs it on the phone over USB, and records its runtime for the Phone test workflow.
# Needs: a phone on `adb devices`, `eas login`, and the EAS "development" environment with the EXPO_PUBLIC_* values.
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_VARIANT=dev

adb get-state >/dev/null 2>&1 || { echo "No phone found. Plug it in and allow USB debugging." >&2; exit 1; }

# Regenerate android/ every time, so a leftover alpha project never builds under the dev app id.
npx expo prebuild --platform android --clean --no-install

# Release mode, signed with the local debug key. Stride Dev is never shared, so it needs no release key.
npx --yes eas-cli@latest env:exec development "npx expo run:android --variant release --no-bundler"

runtime=$(npx expo-updates fingerprint:generate --platform android | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).hash))')
gh variable set DEV_ANDROID_RUNTIME --body "$runtime"
echo "Stride Dev installed. Runtime $runtime is recorded for the Phone test workflow."
