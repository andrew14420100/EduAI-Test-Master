import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faArrowUpFromBracket,
  faArrowUpRightFromSquare,
  faAward,
  faBagShopping,
  faBell,
  faBolt,
  faBook,
  faBookOpen,
  faChartColumn,
  faCheck,
  faChevronRight,
  faCircleCheck,
  faCircleInfo,
  faCircleQuestion,
  faClock,
  faCopy,
  faEnvelope,
  faEye,
  faEyeSlash,
  faFileLines,
  faFilm,
  faFire,
  faFlask,
  faFolder,
  faGlobe,
  faGraduationCap,
  faHeadset,
  faHouse,
  faImage,
  faKey,
  faLayerGroup,
  faLock,
  faMedal,
  faMoon,
  faMusic,
  faNoteSticky,
  faPaintbrush,
  faPen,
  faPlus,
  faRightFromBracket,
  faShieldHalved,
  faStar,
  faStore,
  faSun,
  faTag,
  faTrashCan,
  faTriangleExclamation,
  faUser,
  faUserGroup,
  faWandMagicSparkles,
  faXmark,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
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
  | 'sun'
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
  | 'layers'
  | 'clock'
  | 'support'
  | 'globe'
  | 'users'
  | 'copy'
  | 'medal'
  | 'sparkles'
  | 'flame'
  | 'paintbrush'
  | 'tag'
  | 'flask';

const iconMap: Record<AppIconName, IconDefinition> = {
  home: faHouse,
  generate: faWandMagicSparkles,
  shop: faStore,
  profile: faUser,
  close: faXmark,
  check: faCheck,
  'book-open': faBookOpen,
  'chevron-right': faChevronRight,
  bell: faBell,
  book: faBook,
  chart: faChartColumn,
  upload: faArrowUpFromBracket,
  file: faFileLines,
  image: faImage,
  video: faFilm,
  audio: faMusic,
  trash: faTrashCan,
  lock: faLock,
  shield: faShieldHalved,
  edit: faPen,
  award: faAward,
  zap: faBolt,
  moon: faMoon,
  sun: faSun,
  star: faStar,
  folder: faFolder,
  'circle-check': faCircleCheck,
  logout: faRightFromBracket,
  plus: faPlus,
  'arrow-up-right': faArrowUpRightFromSquare,
  email: faEnvelope,
  password: faKey,
  eye: faEye,
  'eye-slash': faEyeSlash,
  'graduation-cap': faGraduationCap,
  warning: faTriangleExclamation,
  info: faCircleInfo,
  flashcards: faNoteSticky,
  question: faCircleQuestion,
  layers: faLayerGroup,
  clock: faClock,
  support: faHeadset,
  globe: faGlobe,
  users: faUserGroup,
  copy: faCopy,
  medal: faMedal,
  sparkles: faWandMagicSparkles,
  flame: faFire,
  paintbrush: faPaintbrush,
  tag: faTag,
  flask: faFlask,
};

export function AppIcon({ name, size = 18, color }: { name: AppIconName; size?: number; color: string }) {
  return <FontAwesomeIcon icon={iconMap[name]} size={size} color={color} />;
}