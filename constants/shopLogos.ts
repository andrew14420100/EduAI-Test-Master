import type { ImageSourcePropType } from 'react-native';

/**
 * Logo personalizzati del negozio.
 * L'ordine segue gli asset ricevuti: Mezzanotte, Neon, Studioso, Aurora, Leggenda.
 */
export const SHOP_LOGO_SOURCES: Record<string, ImageSourcePropType> = {
  app_icon_midnight: require('@/assets/images/shop-logo-midnight.png'),
  app_icon_neon: require('@/assets/images/shop-logo-neon.png'),
  app_icon_scholar: require('@/assets/images/shop-logo-scholar.png'),
  app_icon_aurora: require('@/assets/images/shop-logo-aurora.png'),
  app_icon_legend: require('@/assets/images/shop-logo-legend.png'),
};