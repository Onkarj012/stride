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
  back: <Path d="m15 6-6 6 6 6" />,
  x: <Path d="M6 6l12 12M18 6 6 18" />,
  up: <Path d="M12 19V5M6 11l6-6 6 6" />,
  trash: <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  cam: (
    <>
      <Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8L10 4h4l1.7 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <Circle cx={12} cy={12.3} r={3.3} />
    </>
  ),
  barcode: (
    <Path d="M4 7.5V6a2 2 0 0 1 2-2h1.5M16.5 4H18a2 2 0 0 1 2 2v1.5M20 16.5V18a2 2 0 0 1-2 2h-1.5M7.5 20H6a2 2 0 0 1-2-2v-1.5M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7" />
  ),
  image: (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={3} />
      <Circle cx={9} cy={10} r={1.6} />
      <Path d="m20.5 16-5-5-9 8.5" />
    </>
  ),
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
