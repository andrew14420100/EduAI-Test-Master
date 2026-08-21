import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppIcon, AppIconName } from '@/components/AppIcon';

export type ModalAction = {
  label: string;
  onPress: () => void;
  variant?: 'primaria' | 'secondaria' | 'pericolo';
};

type AppModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  icon?: AppIconName;
  actions: ModalAction[];
  onDismiss?: () => void;
  children?: ReactNode;
};

export function AppModal({ visible, title, message, icon = 'info', actions, onDismiss, children }: AppModalProps) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Chiudi finestra" />
        <Animated.View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, transform: [{ scale }] }]}>
          <View style={[styles.iconWrap, { backgroundColor: c.accent }]}>
            <AppIcon name={icon} size={22} color={c.accentForeground} />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: c.mutedForeground }]}>{message}</Text> : null}
          {children}
          <View style={styles.actions}>
            {actions.map((action) => {
              const variant = action.variant ?? 'secondaria';
              const backgroundColor = variant === 'primaria' ? c.primary : variant === 'pericolo' ? c.destructive : c.secondary;
              const color = variant === 'primaria' ? c.primaryForeground : variant === 'pericolo' ? c.destructiveForeground : c.secondaryForeground;
              return (
                <Pressable
                  key={action.label}
                  testID={`modale-${action.label}`}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.action, { backgroundColor, opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={[styles.actionText, { color }]}>{action.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.82)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: 24, padding: 20 },
  iconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.4 },
  message: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, marginTop: 8 },
  actions: { gap: 9, marginTop: 20 },
  action: { minHeight: 48, borderRadius: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});