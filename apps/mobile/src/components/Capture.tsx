import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Image, Linking, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { launchImageLibraryAsync } from 'expo-image-picker'
import { cameraColors, motion, radii } from '@stride/ui-tokens'
import { MAX_VOICE_MS } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton, Tag } from './Controls'
import { Tap } from './Tap'

// Mono AAC in an .m4a file: small enough for long notes, and Whisper reads it as audio/mp4.
const RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
}
const BARS = Array.from({ length: 22 }, (_, i) => 14 + Math.abs(Math.sin(i * 1.7)) * 56)
const CAM_HEIGHT = 340

// One waveform bar that grows with the microphone level.
function WaveBar({ level, max, index }: { level: SharedValue<number>; max: number; index: number }) {
  const s = useStyles()
  const style = useAnimatedStyle(() => {
    const wobble = 0.75 + 0.25 * Math.sin(index * 2.3 + level.value * 9)
    return { height: 10 + level.value * max * wobble }
  })
  return <Animated.View style={[s.bar, style]} />
}

// Records a voice note with a live waveform. Done hands back the file; it also stops itself at one minute.
export function VoiceCapture({ onDone, onCancel }: { onDone: (uri: string) => void; onCancel: () => void }) {
  const s = useStyles()
  const recorder = useAudioRecorder(RECORDING)
  const state = useAudioRecorderState(recorder, 80)
  const [problem, setProblem] = useState<string | null>(null)
  const stopped = useRef(false)
  const level = useSharedValue(0)

  useEffect(() => {
    let alive = true
    // Starts recording only while this capture is still active.
    const start = async () => {
      const permission = await requestRecordingPermissionsAsync()
      if (!alive || stopped.current) return
      if (!permission.granted) {
        setProblem('Stride needs the microphone to hear you. Allow it in Settings, or type instead.')
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      if (!alive || stopped.current) return
      await recorder.prepareToRecordAsync()
      if (alive && !stopped.current) recorder.record()
    }
    const startup = start().catch(async () => {
      if (alive) setProblem("Couldn't start the microphone. Try again, or type instead.")
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    })
    void startup.catch(() => undefined)
    return () => {
      alive = false
      const wasStopped = stopped.current
      stopped.current = true
      void startup.catch(() => undefined).then(async () => {
        try {
          if (!wasStopped) await recorder.stop()
        } finally {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
        }
      }).catch(() => undefined)
    }
  }, [recorder])

  useEffect(() => {
    const db = state.metering ?? -60
    level.value = withTiming(Math.min(1, Math.max(0, (db + 55) / 50)), { duration: 90 })
  }, [state.metering, level])

  // Stops the recorder and hands the file back, or explains why there is nothing to send.
  async function finish() {
    if (stopped.current) return
    stopped.current = true
    const tooShort = state.durationMillis < 700
    try {
      try {
        await recorder.stop()
      } finally {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
      }
    } catch {
      setProblem("Couldn't save that recording. Try again, or type instead.")
      return
    }
    const uri = recorder.uri
    if (!uri || tooShort) setProblem("I didn't catch anything. Tap the mic and try again.")
    else onDone(uri)
  }

  useEffect(() => {
    if (state.isRecording && state.durationMillis >= MAX_VOICE_MS) void finish()
  }, [state.durationMillis])

  const seconds = Math.floor(state.durationMillis / 1000)
  return (
    <View style={s.voice}>
      <View style={s.wave}>
        {BARS.map((max, i) => (
          <WaveBar key={i} level={level} max={max} index={i} />
        ))}
      </View>
      <Text style={[s.transcript, s.ghost]}>{problem ?? 'Listening…'}</Text>
      <View style={s.lang}>
        <Tag text={problem ? 'Not recording' : `0:${String(seconds).padStart(2, '0')} · up to a minute`} />
      </View>
      <View style={s.row}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        {problem ? null : <Button label="Done" onPress={() => void finish()} disabled={!state.isRecording} />}
      </View>
    </View>
  )
}

// Shows the camera only after permission, with a clear way forward when it is denied.
function CameraGate({ children, onLibrary, onCancel, problem }: { children: ReactNode; onLibrary?: () => void; onCancel: () => void; problem?: string | null }) {
  const s = useStyles()
  const [permission, request] = useCameraPermissions()
  const [accessProblem, setAccessProblem] = useState<string | null>(null)

  // Requests camera access and explains a failed permission call.
  async function allowCamera() {
    setAccessProblem(null)
    try {
      await request()
    } catch {
      setAccessProblem("Couldn't request camera access. Try again, or type instead.")
    }
  }

  // Opens system settings and explains when the operating system cannot open them.
  async function openSettings() {
    setAccessProblem(null)
    try {
      await Linking.openSettings()
    } catch {
      setAccessProblem("Couldn't open Settings. Open them on your device, or type instead.")
    }
  }

  if (permission === null) return <View style={s.cam} />
  if (permission.granted) return <>{children}</>
  return (
    <View style={[s.cam, s.camAsk]}>
      <Text style={s.askTitle}>Camera is off.</Text>
      <Text style={s.askBody}>Stride uses it to see your plate or scan a barcode. Nothing is saved to your gallery.</Text>
      {problem ? <Text style={s.askBody}>{problem}</Text> : null}
      {accessProblem ? <Text style={s.askBody}>{accessProblem}</Text> : null}
      <View style={s.row}>
        {permission.canAskAgain ? (
          <Button label="Allow camera" variant="coral" onPress={() => void allowCamera()} />
        ) : (
          <Button label="Open settings" variant="coral" onPress={() => void openSettings()} />
        )}
        {onLibrary ? <Button label="Pick a photo" variant="ghost" onPress={onLibrary} /> : null}
      </View>
      <Text style={s.link} onPress={onCancel} suppressHighlighting>
        Type it instead
      </Text>
    </View>
  )
}

// White flash over the viewfinder when the shutter fires.
function useFlash() {
  const flash = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ opacity: flash.value }))
  const fire = () => {
    flash.value = withSequence(withTiming(0.9, { duration: 40 }), withTiming(0, { duration: 360 }))
  }
  return { style, fire }
}

// In-sheet camera with a shutter, a gallery button and a back button (mock #/photo).
export function PhotoCapture({ onPhoto, onCancel, hint = "Get the whole plate in. I'll estimate, you confirm.", quality = 0.5 }: { onPhoto: (uri: string) => void; onCancel: () => void; hint?: string; quality?: number }) {
  const t = useTheme()
  const s = useStyles()
  const camera = useRef<CameraView>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const flash = useFlash()

  // Opens the gallery and hands back the chosen photo.
  async function pickFromLibrary() {
    try {
      const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality })
      const asset = picked.canceled ? undefined : picked.assets[0]
      if (asset) onPhoto(asset.uri)
    } catch {
      setProblem("Couldn't open the gallery. Try again, or take a photo.")
    }
  }

  // Takes the picture at a size the photo model accepts.
  async function shoot() {
    if (!camera.current || busy) return
    setBusy(true)
    flash.fire()
    try {
      const picture = await camera.current.takePictureAsync({ quality })
      onPhoto(picture.uri)
    } catch {
      setProblem("Couldn't take the photo. Try again, or pick one from the gallery.")
      setBusy(false)
    }
  }

  return (
    <View>
      <CameraGate onLibrary={() => void pickFromLibrary()} onCancel={onCancel} problem={problem}>
        <View style={s.cam}>
          <CameraView
            ref={camera}
            style={s.fill}
            facing="back"
            onCameraReady={() => setReady(true)}
            onMountError={() => setProblem('The camera would not start. Pick a photo from the gallery instead.')}
          />
          <View style={s.frame} />
          <Animated.View style={[s.flash, flash.style]} />
        </View>
        <Text style={s.hint}>{problem ?? hint}</Text>
        <View style={s.shutterRow}>
          <RoundButton icon="image" label="Pick from gallery" tone="card" size={46} onPress={() => void pickFromLibrary()} />
          <Tap
            onPress={() => void shoot()}
            disabled={!ready || busy}
            scale={0.9}
            style={[s.shutter, { borderColor: t.c.ink }, (!ready || busy) && s.dim]}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            <View style={s.shutterDot} />
          </Tap>
          <RoundButton icon="x" label="Back to typing" tone="card" size={46} onPress={onCancel} />
        </View>
      </CameraGate>
    </View>
  )
}

// Coral band sweeping down a frame, for scanning and for a photo being read.
function ScanSweep({ height = CAM_HEIGHT }: { height?: number }) {
  const t = useTheme()
  const s = useStyles()
  const y = useSharedValue(-90)
  useEffect(() => {
    y.value = withRepeat(withTiming(height, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1)
  }, [y, height])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return (
    <Animated.View style={[s.sweep, style]}>
      <Svg width="100%" height={90}>
        <Defs>
          <LinearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.c.polo} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.c.polo} stopOpacity={0.35} />
            <Stop offset="1" stopColor={t.c.polo} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={90} fill="url(#sweep)" />
      </Svg>
    </Animated.View>
  )
}

// The photo just taken, with the scan sweep while Polo reads it.
export function ScanningPhoto({ uri }: { uri: string }) {
  const s = useStyles()
  const pop = useSharedValue(0.96)
  useEffect(() => {
    pop.value = withSpring(1, motion.spring.bouncy)
  }, [pop])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  return (
    <Animated.View style={[s.cam, style]}>
      <Image source={{ uri }} style={s.fill} resizeMode="cover" accessibilityLabel="Your photo" />
      <View style={s.frame} />
      <ScanSweep />
    </Animated.View>
  )
}

// Live barcode scanner for packaged food. Reports the first code it reads.
export function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const s = useStyles()
  const seen = useRef(false)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <View>
      <CameraGate onCancel={onCancel}>
        <View style={s.cam}>
          <CameraView
            style={s.fill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={(result) => {
              if (seen.current) return
              seen.current = true
              onCode(result.data)
            }}
            onMountError={() => setProblem('The camera would not start. Type the food instead.')}
          />
          <View style={[s.frame, s.codeFrame]} />
          <ScanSweep />
        </View>
        <Text style={s.hint}>{problem ?? 'Point at the barcode on the pack. Open Food Facts fills in the rest.'}</Text>
        <View style={s.row}>
          <Button label="Type instead" variant="ghost" onPress={onCancel} />
        </View>
      </CameraGate>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  voice: { alignItems: 'center', paddingTop: 10 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 70, marginTop: 26, marginBottom: 14 },
  bar: { width: 5, borderRadius: 4, backgroundColor: t.c.polo },
  transcript: { ...font('emptyTitle'), fontSize: 24, lineHeight: 30, letterSpacing: -0.5, textAlign: 'center', minHeight: 62, maxWidth: 320 },
  ghost: { color: t.c.ink3 },
  lang: { marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 22 },
  cam: {
    height: CAM_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: cameraColors.bg,
    marginTop: 8,
  },
  camAsk: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  askTitle: { ...font('emptyTitle'), color: cameraColors.ink },
  askBody: { ...font('callout'), color: cameraColors.ink2, textAlign: 'center', marginTop: 6 },
  link: { ...font('link'), color: cameraColors.ink2, marginTop: 16, paddingVertical: 4 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  frame: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 26,
    left: 26,
    right: 26,
    bottom: 26,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: cameraColors.frame,
  },
  codeFrame: { top: 110, bottom: 110 },
  flash: { pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: cameraColors.flash, opacity: 0 },
  sweep: { pointerEvents: 'none', position: 'absolute', left: 0, right: 0, top: 0, height: 90 },
  hint: { ...font('caption'), color: t.c.ink3, textAlign: 'center', marginTop: 12 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 18 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDot: { width: 56, height: 56, borderRadius: radii.pill, backgroundColor: t.c.polo },
  dim: { opacity: 0.5 },
}))
