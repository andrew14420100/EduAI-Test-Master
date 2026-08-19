import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import React from 'react';

export type AppIconName =
  | 'home'
  | 'generate'
  | 'shop'
  | 'profile'
  | 'close'
  | 'check'
  | 'book-open'
  | 'chevron-right'
  | 'bell'
  | 'book'
  | 'chart'
  | 'upload'
  | 'file'
  | 'image'
  | 'video'
  | 'audio'
  | 'trash'
  | 'lock'
  | 'shield'
  | 'edit'
  | 'award'
  | 'zap'
  | 'moon'
  | 'star'
  | 'folder'
  | 'circle-check'
  | 'logout'
  | 'plus'
  | 'arrow-up-right'
  | 'email'
  | 'password'
  | 'eye'
  | 'eye-slash'
  | 'graduation-cap'
  | 'warning'
  | 'info'
  | 'flashcards'
  | 'question'
  | 'layers';

const iconMap: Record<AppIconName, React.ComponentProps<typeof FontAwesome6>['name']> = {
  home: 'house',
  generate: 'wand-magic-sparkles',
  shop: 'bag-shopping',
  profile: 'user',
  close: 'xmark',
  check: 'check',
  'book-open': 'book-open',
  'chevron-right': 'chevron-right',
  bell: 'bell',
  book: 'book',
  chart: 'chart-column',
  upload: 'arrow-up-from-bracket',
  file: 'file-lines',
  image: 'image',
  video: 'film',
  audio: 'music',
  trash: 'trash-can',
  lock: 'lock',
  shield: 'shield-halved',
  edit: 'pen',
  award: 'award',
  zap: 'bolt',
  moon: 'moon',
  star: 'star',
  folder: 'folder',
  'circle-check': 'circle-check',
  logout: 'right-from-bracket',
  plus: 'plus',
  'arrow-up-right': 'arrow-up-right-from-square',
  email: 'envelope',
  password: 'key',
  eye: 'eye',
  'eye-slash': 'eye-slash',
  'graduation-cap': 'graduation-cap',
  warning: 'triangle-exclamation',
  info: 'circle-info',
  flashcards: 'note-sticky',
  question: 'circle-question',
  layers: 'layer-group',
};

export function AppIcon({ name, size = 18, color }: { name: AppIconName; size?: number; color: string }) {
  return <FontAwesome6 name={iconMap[name]} size={size} color={color} iconStyle="solid" />;
}