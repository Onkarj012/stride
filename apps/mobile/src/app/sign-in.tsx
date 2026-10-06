import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSignIn } from '@clerk/expo'
import { layout, radii } from '@stride/ui-tokens'
import { Polo, type PoloMood } from '@/components/Polo'
import { Tap } from '@/components/Tap'
import { font, themedStyles, useTheme } from '@/theme'

type ClerkFailure = { code?: string; message: string; longMessage?: string }

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

// Email and password sign-in, with the emailed code step Clerk asks for on a new device.
export default function SignInScreen() {
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { signIn, fetchStatus } = useSignIn()
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hop, setHop] = useState(1)
  const busy = fetchStatus === 'fetching'
  const mood: PoloMood = error ? 'wow' : 'idle'

  // Finishes the attempt or moves to the code step, depending on what Clerk needs next.
  async function advance() {
    if (signIn.status === 'complete') {
      const { error: err } = await signIn.finalize()
      if (err) setError(describe(err))
      return
    }
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      const { error: err } = await signIn.mfa.sendEmailCode()
      if (err) return setError(describe(err))
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
    await advance()
  }

  // Submits the emailed code.
  async function submitCode() {
    setError(null)
    const { error: err } = await signIn.mfa.verifyEmailCode({ code: code.trim() })
    if (err) return setError(describe(err))
    await advance()
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
            : `We sent a code to ${email.trim()}. It keeps this phone trusted.`}
        </Text>

        <View style={s.form}>
          {step === 'password' ? (
            <>
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
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={t.c.ink3}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && void submitPassword()}
              />
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
            {busy ? (
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
  buttonOff: { opacity: 0.45 },
  buttonText: { ...font('button'), fontSize: 15.5, color: t.c.bg },
  back: { ...font('link'), color: t.c.ink2, textAlign: 'center', paddingVertical: 12 },
}))
