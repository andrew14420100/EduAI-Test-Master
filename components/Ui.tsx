import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, AppIconName } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  const c = useColors();
  return <View style={[styles.pill, { backgroundColor: color ?? c.accent }]}><Text style={[styles.pillText, { color: color ? c.primaryForeground : c.accentForeground }]}>{children}</Text></View>;
}

export function IconButton({ name, onPress, label }: { name: AppIconName; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} testID={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: c.card, opacity: pressed ? 0.72 : 1 }]}>
      <AppIcon name={name} size={18} color={c.foreground} />
    </Pressable>
  );
}

export function PrimaryButton({ children, onPress, disabled = false, icon = 'arrow-up-right', loading = false }: { children: ReactNode; onPress: () => void; disabled?: boolean; icon?: AppIconName; loading?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" testID="primary-button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primary, { backgroundColor: c.primary, opacity: disabled ? 0.45 : pressed ? 0.76 : 1 }]}>
      <Text style={[styles.primaryText, { color: c.primaryForeground }]}>{children}</Text>
      {loading ? <ActivityIndicator size="small" color={c.primaryForeground} /> : <AppIcon name={icon} size={17} color={c.primaryForeground} />}
    </Pressable>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  const c = useColors();
  return <View style={styles.sectionTitle}><View><Text style={[styles.eyebrow, { color: c.primary }]}>{eyebrow}</Text><Text style={[styles.title, { color: c.foreground }]}>{title}</Text></View>{action ? <Text style={[styles.action, { color: c.mutedForeground }]}>{action}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 54, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  primaryText: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 15 },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  action: { fontFamily: 'Inter_500Medium', fontSize: 12, paddingBottom: 3 },
});

export const uiStyles = styles;