import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';

export function CentralLoader({ message = 'Caricamento in corso…' }: { message?: string }) {
  const c = useColors();
  const rotation = useRef(new Animated.Value(0)).current;
  const counterRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (value: Animated.Value, duration: number, reverse = false) => Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const first = loop(rotation, 1700);
    const second = loop(counterRotation, 2300);
    first.start();
    second.start();
    return () => {
      first.stop();
      second.stop();
    };
  }, [counterRotation, rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterSpin = counterRotation.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.logoStage}>
        <Animated.View style={[styles.ringOuter, { borderTopColor: c.primary, borderRightColor: c.primary, transform: [{ rotate: spin }] }]} />
        <Animated.View style={[styles.ringInner, { borderBottomColor: c.accent, borderLeftColor: c.accent, transform: [{ rotate: counterSpin }] }]} />
        <View style={[styles.logo, { backgroundColor: c.primary }]}>
          <AppIcon name="graduation-cap" size={31} color={c.primaryForeground} />
        </View>
      </View>
      <Text style={[styles.message, { color: c.foreground }]}>{message}</Text>
      <Text style={[styles.hint, { color: c.mutedForeground }]}>Stiamo preparando il tuo spazio di studio</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 100 },
  logoStage: { width: 142, height: 142, alignItems: 'center', justifyContent: 'center' },
  ringOuter: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 4, borderColor: 'transparent' },
  ringInner: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: 'transparent' },
  logo: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  message: { fontFamily: 'Inter_700Bold', fontSize: 18, textAlign: 'center', marginTop: 25 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center', marginTop: 8 },
});