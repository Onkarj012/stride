import { View } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme, SPACE, RADIUS } from '../theme'

interface CardProps {
  children: ReactNode
  elevated?: boolean
  padded?: boolean
}

export function Card({ children, elevated = false, padded = true }: CardProps) {
  const t = useTheme()
  return (
    <View style={[
      {
        backgroundColor: elevated ? t.cardElev : t.card,
        borderRadius: RADIUS.lg,
        ...(padded && { padding: SPACE.lg }),
      },
      t.cardShadow,
    ]}>
      {children}
    </View>
  )
}
