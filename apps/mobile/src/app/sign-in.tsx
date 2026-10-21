import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSignIn } from '@clerk/expo'
import { useSSO, type StartSSOFlowReturnType } from '@clerk/expo/experimental'
import * as WebBrowser from 'expo-web-browser'
import { layout, radii } from '@stride/ui-tokens'
import { Polo, type PoloMood } from '@/components/Polo'
import { Tap } from '@/components/Tap'
import { font, themedStyles, useTheme } from '@/theme'

// Lets the Google redirect finish the browser session that opened it.
WebBrowser.maybeCompleteAuthSession()

type ClerkFailure = { code?: string; message: string; longMessage?: string }
type SignInState = NonNullable<StartSSOFlowReturnType['signIn']>

const FRIENDLY: Record<string, string> = {
  form_password_incorrect: 'That password is not right. Try again.',
  form_identifier_not_found: 'No account uses that email.',
  form_param_format_invalid: 'That email does not look right.',
  form_code_incorrect: 'That code is not right. Check the email and try again.',
  verification_expired: 'That code expired. Go back and sign in again.',
}

// Turns a Clerk error into one short sentence for the form.
function describe(error: ClerkFailure): string {
  return (error.code && FRIENDLY[error.code]) || error.longMessage || 'Something went wrong. Try again.'
}

// Tells a Clerk error object apart from anything else a thrown value can be.
function isClerkFailure(err: unknown): err is ClerkFailure {
  return typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
}

// Google's four-colour G. Brand rules fix these colours, so they ignore the theme.
function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  )
}

// Email and password sign-in, Google sign-in, and the emailed code step Clerk asks for on a new device.
export default function SignInScreen() {
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { signIn, fetchStatus } = useSignIn()
  const { startSSOFlow } = useSSO()
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hop, setHop] = useState(1)
  const [googleBusy, setGoogleBusy] = useState(false)
  // The resource that sent the emailed code. The Google flow returns its own copy, so keep the one in use.
  const [codeSignIn, setCodeSignIn] = useState<SignInState | null>(null)
  const busy = fetchStatus === 'fetching' || googleBusy
  const mood: PoloMood = error ? 'wow' : 'idle'

  // Android opens the browser faster when it is warmed up while this screen is shown.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    void WebBrowser.warmUpAsync()
    return () => {
      void WebBrowser.coolDownAsync()
    }
  }, [])

  // Runs the Google flow. A finished session moves the auth gate on by itself. A second factor goes to the code step.
  async function continueWithGoogle() {
    setError(null)
    setGoogleBusy(true)
    try {
      const { createdSessionId, authSessionResult, signIn: result } = await startSSOFlow({ strategy: 'oauth_google' })
      const cancelled = authSessionResult?.type === 'cancel' || authSessionResult?.type === 'dismiss'
      if (createdSessionId || cancelled) return
      if (result && (result.status === 'needs_second_factor' || result.status === 'needs_client_trust')) {
        await advance(result)
        return
      }
      setError('Google sign-in failed. Try again.')
    } catch (err) {
      setError(isClerkFailure(err) ? describe(err) : 'Google sign-in failed. Try again.')
    } finally {
      setGoogleBusy(false)
    }
  }

  // Finishes the attempt or moves to the code step, depending on what Clerk needs next.
  async function advance(current: SignInState) {
    if (current.status === 'complete') {
      const { error: err } = await current.finalize()
      if (err) setError(describe(err))
      return
    }
    if (current.status === 'needs_second_factor' || current.status === 'needs_client_trust') {
      const { error: err } = await current.mfa.sendEmailCode()
      if (err) return setError(describe(err))
      setCodeSignIn(current)
      setStep('code')
      setHop((n) => n + 1)
      return
    }
    setError('This account needs a sign-in step the app does not support yet.')
  }

  // Submits email and password.
  async function submitPassword() {
    setError(null)
    const { error: err } = await signIn.password({ emailAddress: email.trim(), password })
    if (err) return setError(describe(err))
    await advance(signIn)
  }

  // Submits the emailed code to the resource that sent it.
  async function submitCode() {
    if (!codeSignIn) return setError('Start sign-in again.')
    setError(null)
    const { error: err } = await codeSignIn.mfa.verifyEmailCode({ code: code.trim() })
    if (err) return setError(describe(err))
    await advance(codeSignIn)
  }

  const canSubmit = !busy && (step === 'password' ? email.trim() !== '' && password !== '' : code.trim().length >= 6)

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Polo size={72} mood={mood} hop={hop} />
        <Text style={s.title}>{step === 'password' ? 'Hi. Sign in\nto Stride.' : 'Check your email.'}</Text>
        <Text style={s.lead}>
          {step === 'password'
            ? 'Same account as the web app. Polo keeps your log in sync.'
            : `We sent a code to ${codeSignIn?.identifier ?? 'your email'}. It keeps this phone trusted.`}
        </Text>

        <View style={s.form}>
          {step === 'password' ? (
            <>
              <Tap
                style={[s.googleButton, busy && s.buttonOff]}
                disabled={busy}
                onPress={() => void continueWithGoogle()}
                accessibilityRole="button"
              >
                {googleBusy ? (
                  <ActivityIndicator color={t.c.ink} />
                ) : (
                  <View style={s.googleRow}>
                    <GoogleLogo />
                    <Text style={s.googleText}>Continue with Google</Text>
                  </View>
                )}
              </Tap>
              <Text style={s.hint}>New here? Google creates your account.</Text>
              <View style={s.divider}>
                <View style={s.rule} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.rule} />
              </View>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={t.c.ink3}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <View style={s.passwordWrap}>
                <TextInput
                  style={[s.input, s.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={t.c.ink3}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => canSubmit && void submitPassword()}
                />
                <Text
                  style={s.reveal}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  suppressHighlighting
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </View>
            </>
          ) : (
            <TextInput
              style={[s.input, s.codeInput]}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={t.c.ink3}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              onSubmitEditing={() => canSubmit && void submitCode()}
            />
          )}

          {error ? <Text style={s.error}>{error}</Text> : null}

          <Tap
            style={[s.button, !canSubmit && s.buttonOff]}
            disabled={!canSubmit}
            onPress={() => void (step === 'password' ? submitPassword() : submitCode())}
            accessibilityRole="button"
          >
            {fetchStatus === 'fetching' ? (
              <ActivityIndicator color={t.c.bg} />
            ) : (
              <Text style={s.buttonText}>{step === 'password' ? 'Sign in' : 'Verify'}</Text>
            )}
          </Tap>

          {step === 'code' ? (
            <Text
              style={s.back}
              onPress={() => {
                setStep('password')
                setCode('')
                setError(null)
                setShowPassword(false)
                void signIn.reset()
              }}
            >
              Use a different account
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const useStyles = themedStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  content: { flexGrow: 1, paddingHorizontal: layout.screenX },
  title: { ...font('onboardTitle'), color: t.c.ink, marginTop: 26 },
  lead: { ...font('lead'), color: t.c.ink2, marginTop: 14 },
  form: { marginTop: 28, gap: 10 },
  input: {
    ...font('input'),
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
    color: t.c.ink,
  },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 64 },
  reveal: { ...font('link'), color: t.c.ink2, position: 'absolute', right: 0, paddingHorizontal: 16, paddingVertical: 14 },
  codeInput: { ...font('section'), letterSpacing: 6, textAlign: 'center' },
  error: { ...font('caption'), color: t.c.poloInk, marginTop: 2 },
  button: {
    height: 52,
    marginTop: 8,
    borderRadius: radii.pill,
    backgroundColor: t.c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButton: {
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.c.line2,
    backgroundColor: t.c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  googleText: { ...font('button'), fontSize: 15.5, color: t.c.ink },
  hint: { ...font('caption'), color: t.c.ink3, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  rule: { flex: 1, height: 1, backgroundColor: t.c.line2 },
  dividerText: { ...font('caption'), color: t.c.ink3 },
  buttonOff: { opacity: 0.45 },
  buttonText: { ...font('button'), fontSize: 15.5, color: t.c.bg },
  back: { ...font('link'), color: t.c.ink2, textAlign: 'center', paddingVertical: 12 },
}))
