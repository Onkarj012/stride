import React from 'react'
import { Feather } from '@expo/vector-icons'

export type IconName =
  | 'today' | 'nutrition' | 'workouts' | 'insights'
  | 'calendar' | 'back' | 'close' | 'plus'
  | 'chevronRight' | 'chevronLeft' | 'history'
  | 'sun' | 'moon' | 'chat' | 'mic' | 'camera'
  | 'barcode' | 'ocr' | 'signal' | 'wifi' | 'send' | 'check'
  | 'settings' | 'user' | 'bell' | 'droplet' | 'mail'
  | 'target' | 'flame' | 'protein' | 'activity' | 'weight'
  | 'sparkles' | 'chip' | 'brain' | 'download' | 'link'
  | 'chart' | 'trash' | 'star' | 'shield' | 'info'

type FeatherName = React.ComponentProps<typeof Feather>['name']

const MAP: Record<IconName, FeatherName> = {
  today:         'home',
  nutrition:     'pie-chart',
  workouts:      'activity',
  insights:      'bar-chart-2',
  calendar:      'calendar',
  back:          'arrow-left',
  close:         'x',
  plus:          'plus',
  chevronRight:  'chevron-right',
  chevronLeft:   'chevron-left',
  history:       'clock',
  sun:           'sun',
  moon:          'moon',
  chat:          'message-circle',
  mic:           'mic',
  camera:        'camera',
  barcode:       'grid',
  ocr:           'file-text',
  signal:        'activity',
  wifi:          'wifi',
  send:          'send',
  check:         'check',
  settings:      'settings',
  user:          'user',
  bell:          'bell',
  droplet:       'droplet',
  mail:          'mail',
  target:        'target',
  flame:         'zap',
  protein:       'layers',
  activity:      'trending-up',
  weight:        'sliders',
  sparkles:      'star',
  chip:          'cpu',
  brain:         'hard-drive',
  download:      'download',
  link:          'link',
  chart:         'bar-chart',
  trash:         'trash-2',
  star:          'star',
  shield:        'shield',
  info:          'info',
}

interface IconProps {
  name: IconName
  size?: number
  color?: string
  sw?: number
}

export function Icon({ name, size = 22, color = '#0d101b', sw }: IconProps) {
  return <Feather name={MAP[name]} size={size} color={color} strokeWidth={sw} />
}
