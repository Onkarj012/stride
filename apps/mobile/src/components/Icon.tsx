import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { layout } from '@stride/ui-tokens'

// Stroke icons drawn on a 24-unit grid, copied from the v5 mock.
const shapes = {
  today: (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  log: (
    <>
      <Rect x={3.5} y={5} width={17} height={15} rx={3} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  progress: (
    <>
      <Path d="M3.5 17 9 11l4 4 7.5-8" />
      <Path d="M15 7h5.5v5.5" />
    </>
  ),
  coach: <Path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4A8 8 0 1 1 20 12z" />,
  mic: (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  play: <Path d="M8 5.5v13l10-6.5z" />,
  chevron: <Path d="m9 6 6 6-6 6" />,
}

export type IconName = keyof typeof shapes

// One mock icon at a given size and stroke color.
export function Icon({ name, size = layout.icon, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={layout.iconStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </Svg>
  )
}
