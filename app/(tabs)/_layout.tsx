import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { useApp } from '@/context/AppContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const colors = useColors();
  const theme = useAppTheme();
  const { labsEnabled } = useApp();
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
          ? <BlurView intensity={100} tint={theme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          : isWeb
            ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            : null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Oggi', tabBarIcon: ({ color }) => <AppIcon name="home" size={20} color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Genera', tabBarIcon: ({ color }) => <AppIcon name="generate" size={20} color={color} /> }} />
      <Tabs.Screen
        name="labs"
        options={{
          title: 'Laboratori',
          // href: null removes the tab entirely when labs are disabled
          href: labsEnabled ? undefined : null,
          tabBarIcon: ({ color }) => <AppIcon name="flask" size={20} color={color} />,
        }}
      />
      <Tabs.Screen name="shop" options={{ title: 'Negozio', tabBarIcon: ({ color }) => <AppIcon name="shop" size={20} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo', tabBarIcon: ({ color }) => <AppIcon name="profile" size={20} color={color} /> }} />
    </Tabs>
  );
}