import { Feather } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  const c = useColors();
  return <View style={[styles.pill, { backgroundColor: color ?? c.accent }]}><Text style={[styles.pillText, { color: color ? c.primaryForeground : c.accentForeground }]}>{children}</Text></View>;
}
export function IconButton({ name, onPress, label }: { name: keyof typeof Feather.glyphMap; onPress: () => void; label: string }) {
  const c = useColors();
  return <Pressable accessibilityLabel={label} testID={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: c.card, opacity: pressed ? 0.72 : 1 }]}><Feather name={name} size={19} color={c.foreground} /></Pressable>;
}
export function PrimaryButton({ children, onPress, disabled = false }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return <Pressable testID="primary-button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primary, { backgroundColor: c.primary, opacity: disabled ? 0.45 : pressed ? 0.76 : 1 }]}><Text style={[styles.primaryText, { color: c.primaryForeground }]}>{children}</Text><Feather name="arrow-up-right" size={18} color={c.primaryForeground} /></Pressable>;
}
export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  const c = useColors();
  return <View style={styles.sectionTitle}><View><Text style={[styles.eyebrow, { color: c.primary }]}>{eyebrow}</Text><Text style={[styles.title, { color: c.foreground }]}>{title}</Text></View>{action ? <Text style={[styles.action, { color: c.mutedForeground }]}>{action}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  action: { fontFamily: 'Inter_500Medium', fontSize: 12, paddingBottom: 3 },
});
export const uiStyles = styles;