import { Tabs, useRouter } from 'expo-router'
import { Pressable, View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from '../../lib/haptics'
import { StrideMark } from '../../components/StrideMark'
import { Icon } from '../../components/Icon'
import { useTheme } from '../../components/theme'

const LEFT_TABS = [
  { name: 'index',     label: 'Today',    icon: 'today' as const },
  { name: 'nutrition', label: 'Food',     icon: 'nutrition' as const },
]
const RIGHT_TABS = [
  { name: 'workouts', label: 'Train',    icon: 'workouts' as const },
  { name: 'insights', label: 'Insights', icon: 'insights' as const },
]

// Web UI kit: flex-1 py-1, gap-1, size-24 icon, font-bold text-[10px]
function TabButton({
  label, icon, active, onPress,
}: {
  label: string; icon: 'today' | 'nutrition' | 'workouts' | 'insights'
  active: boolean; onPress: () => void
}) {
  const t = useTheme()
  const color = active ? t.tabIconActive : t.tabIconInactive

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress() }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,   // py-1 = 4px
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={24} color={color} />
      <Text style={{
        fontFamily: 'Manrope_800ExtraBold',
        fontSize: 10,
        color,
        marginTop: 4,
        letterSpacing: 0.2,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const t = useTheme()
  const activeRouteName = state.routes[state.index]?.name

  // Circle pokes above the bar: half over the top border, half inside.
  const CIRCLE = 56
  // Reserve center slot = circle + px-2 each side, so the row dips around the FAB.
  const CENTER_SLOT = CIRCLE + 16

  return (
    // Web: relative, px-4 pt-2 pb-6, bg-surface/80 backdrop-blur border-t
    // position relative + overflow visible so the FAB can overlap the top border
    <View
      style={{
        position: 'relative',
        overflow: 'visible',
        paddingHorizontal: 16,   // px-4
        paddingTop: 8,           // pt-2
        paddingBottom: Math.max(insets.bottom, 24),  // pb-6 + safe area
        backgroundColor: t.tabBg,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      {/* Bar row = icons only. FAB is pulled out of flow (absolute) so the bar
          collapses to icon height instead of stretching around the circle. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>

        {LEFT_TABS.map(tab => (
          <TabButton
            key={tab.name}
            label={tab.label}
            icon={tab.icon}
            active={activeRouteName === tab.name}
            onPress={() => navigation.navigate(tab.name)}
          />
        ))}

        {/* Center spacer — holds open the slot the FAB floats over */}
        <View style={{ width: CENTER_SLOT }} />

        {RIGHT_TABS.map(tab => (
          <TabButton
            key={tab.name}
            label={tab.label}
            icon={tab.icon}
            active={activeRouteName === tab.name}
            onPress={() => navigation.navigate(tab.name)}
          />
        ))}
      </View>

      {/* Stry launcher wrapper — full-width, centered, lifted half above the border.
          Wrapper owns position+centering; Pressable owns press feedback. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -(CIRCLE * 0.30),   // 30% poke above the border
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/stry') }}
          style={({ pressed }) => ({
            alignItems: 'center',
            transform: [{ scale: pressed ? 0.9 : 1 }],
          })}
        >
          <View style={{
            width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
            backgroundColor: t.fabBg,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: t.fabBg,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
            elevation: 10,
          }}>
            <StrideMark size={32} color={t.fabIcon} />
          </View>
          <Text style={{
            fontFamily: 'Manrope_800ExtraBold',
            fontSize: 10,
            color: t.textSubtle,
            marginTop: 4,
            textAlign: 'center',
            width: CIRCLE,
          }}>
            Stry
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="workouts" />
      <Tabs.Screen name="insights" />
    </Tabs>
  )
}
