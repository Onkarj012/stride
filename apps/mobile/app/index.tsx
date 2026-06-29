import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  // M0: verify Convex is wired — returns [] without auth (M1 adds Clerk)
  const recentFoods = useQuery(api.foods.getRecentFoods);

  const convexStatus = recentFoods !== undefined ? 'connected' : 'connecting…';

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <View className="flex-1 items-center justify-center px-6 gap-4">
        <Text
          style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 40, color: '#b3a0ff' }}
        >
          Stride
        </Text>
        <Text
          style={{ fontFamily: 'Manrope_400Regular', fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}
        >
          M0 scaffold
        </Text>
        <View className="mt-6 gap-2">
          <StatusRow label="tokens" ok />
          <StatusRow label="Manrope" ok />
          <StatusRow label={`Convex ${convexStatus}`} ok={recentFoods !== undefined} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text style={{ fontSize: 13, color: ok ? '#b8e5c0' : '#fdb572' }}>
        {ok ? '✓' : '○'}
      </Text>
      <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
        {label}
      </Text>
    </View>
  );
}
