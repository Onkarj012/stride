import { useState, useRef } from 'react'
import { View, Text, Pressable, Animated as RNAnimated, Dimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import * as Haptics from '../lib/haptics'
import { ChatPanel } from '../components/ChatPanel'
import { AgentBadge } from '../components/AgentBadge'
import { Icon } from '../components/Icon'
import { useTheme } from '../components/theme'

const SCREEN_WIDTH = Dimensions.get('window').width

function ChatHistoryDrawer({ visible, onClose, onSelectSession, onNewChat }: { visible: boolean; onClose: () => void; onSelectSession: (id: string) => void; onNewChat: () => void }) {
  const translateX = useRef(new RNAnimated.Value(-SCREEN_WIDTH)).current
  const overlayOpacity = useRef(new RNAnimated.Value(0)).current
  const insets = useSafeAreaInsets()
  const t = useTheme()
  const sessions = useQuery(api.chat.getSessions) as Array<{ id: string; title: string }> | undefined

  if (visible) {
    RNAnimated.parallel([
      RNAnimated.spring(translateX, {
        toValue: 0, stiffness: 220, damping: 26, useNativeDriver: true,
      }),
      RNAnimated.timing(overlayOpacity, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }),
    ]).start()
  }

  function close() {
    RNAnimated.parallel([
      RNAnimated.spring(translateX, {
        toValue: -SCREEN_WIDTH, stiffness: 220, damping: 26, useNativeDriver: true,
      }),
      RNAnimated.timing(overlayOpacity, {
        toValue: 0, duration: 180, useNativeDriver: true,
      }),
    ]).start(() => onClose())
  }

  if (!visible) return null

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 50, flexDirection: 'row' }}>
      <RNAnimated.View
        style={{
          width: '82%',
          maxWidth: 320,
          height: '100%',
          backgroundColor: t.bg,
          shadowColor: '#000',
          shadowOffset: { width: 20, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 30,
          elevation: 20,
          transform: [{ translateX }],
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}>
          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: t.text, letterSpacing: -0.5 }}>
            Chats
          </Text>
          <Pressable
            onPress={close}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: t.card,
              ...t.cardShadow,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="close" size={20} color={t.textMuted} />
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 24 }}>
          {/* New chat */}
          <Pressable
            onPress={() => { onNewChat(); close() }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 48,
              borderRadius: 14,
              backgroundColor: t.accent,
              overflow: 'hidden',
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Icon name="plus" size={18} color={t.fabIcon} />
            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.fabIcon }}>
              New chat
            </Text>
          </Pressable>
          <View style={{ height: 20 }} />

          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 10, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 1.5, paddingHorizontal: 12, marginBottom: 6 }}>
            Recent sessions
          </Text>
          {!sessions ? <Text style={{ paddingHorizontal: 12, color: t.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 13 }}>Loading chats…</Text> : sessions.length === 0 ? <Text style={{ paddingHorizontal: 12, color: t.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 13 }}>No saved chats yet.</Text> : sessions.map(session => (
            <Pressable key={session.id} onPress={() => { onSelectSession(session.id); close() }} style={({ pressed }) => ({ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 2, backgroundColor: pressed ? t.dimBg : 'transparent' })}>
              <Text numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold', fontSize: 13, color: t.textMuted }}>{session.title}</Text>
            </Pressable>
          ))}
        </View>
      </RNAnimated.View>

      <RNAnimated.View style={{ flex: 1, opacity: overlayOpacity }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={close}
        />
      </RNAnimated.View>
    </View>
  )
}

export default function StryScreen() {
  const router = useRouter()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const t = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHistoryOpen(true) }}
          style={({ pressed }) => ({
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: t.card,
            ...t.cardShadow,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="history" size={19} color={t.textMuted} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: t.text, letterSpacing: -0.5 }}>
              Stry
            </Text>
            <AgentBadge type="overall" />
          </View>
          <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 11, color: t.textSubtle, lineHeight: 16 }}>
            ask anything about your day
          </Text>
        </View>

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back() }}
          style={({ pressed }) => ({
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: t.card,
            ...t.cardShadow,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="close" size={20} color={t.textMuted} />
        </Pressable>
      </View>

      <ChatPanel key={selectedSessionId ?? 'new'} initialSessionId={selectedSessionId ?? undefined} />

      <ChatHistoryDrawer
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectSession={(id: string) => setSelectedSessionId(id)}
        onNewChat={() => setSelectedSessionId(null)}
      />
    </SafeAreaView>
  )
}
