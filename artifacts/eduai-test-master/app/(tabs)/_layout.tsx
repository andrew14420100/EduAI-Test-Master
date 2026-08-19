import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => isIOS
          ? <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          : isWeb
            ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            : null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Oggi', tabBarIcon: ({ color }) => <Feather name="home" size={21} color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Materiali', tabBarIcon: ({ color }) => <Feather name="folder" size={21} color={color} /> }} />
      <Tabs.Screen name="shop" options={{ title: 'Negozio', tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo', tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} /> }} />
    </Tabs>
  );
}