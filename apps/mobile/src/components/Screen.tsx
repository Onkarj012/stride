import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { layout, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Polo } from './Polo'

// Scrolling page with the v5 paddings, room for the dock, and the soft fade under the status bar.
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const fade = insets.top + 6

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + layout.screenTop,
          paddingBottom: layout.screenBottom + insets.bottom,
          paddingHorizontal: layout.screenX,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <Svg style={[s.fade, { height: fade }]} width="100%" height={fade}>
        <Defs>
          <LinearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.62" stopColor={t.c.bg} stopOpacity={1} />
            <Stop offset="1" stopColor={t.c.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#topfade)" />
      </Svg>
    </View>
  )
}

// Eyebrow label plus large screen title, the header used on Log, Progress and Coach.
export function ScreenTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  const s = useStyles()
  return (
    <View>
      <Text style={[s.eyebrow, s.eyebrowTop]}>{eyebrow}</Text>
      <View style={s.titleRow}>
        <Text style={s.title}>{title}</Text>
        {aside}
      </View>
    </View>
  )
}

// Section heading row with an optional quiet link on the right.
export function Section({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  const s = useStyles()
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {link ? (
        <Text style={s.link} onPress={onLink} suppressHighlighting accessibilityRole={onLink ? 'link' : undefined}>
          {link}
        </Text>
      ) : null}
    </View>
  )
}

// Friendly holding card for tabs that later slices fill in.
export function Placeholder({ title, body }: { title: string; body: string }) {
  const s = useStyles()
  return (
    <View style={s.placeholder}>
      <Polo size={64} hop={1} />
      <Text style={s.placeholderTitle}>{title}</Text>
      <Text style={s.placeholderBody}>{body}</Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  eyebrowTop: { marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  title: { ...font('screenTitle'), color: t.c.ink },
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: layout.sectionTop,
    marginBottom: layout.sectionBottom,
    marginHorizontal: 2,
  },
  sectionTitle: { ...font('section'), color: t.c.ink },
  link: { ...font('link'), color: t.c.ink2, paddingVertical: 4 },
  placeholder: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 10,
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
  },
  placeholderTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  placeholderBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center' },
}))
