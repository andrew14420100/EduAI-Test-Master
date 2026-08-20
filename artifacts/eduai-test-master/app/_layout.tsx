import React, { useCallback, useEffect, useState } from 'react';
import { ClerkLoaded, ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider, useApp } from '@/context/AppContext';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();
const domain = process.env.EXPO_PUBLIC_DOMAIN;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (domain) setBaseUrl(`https://${domain}`);

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoaded, isSignedIn } = useAuth();
  const { level, ready } = useApp();

  useEffect(() => {
    if (!isLoaded || !ready) return;
    const currentRoute = segments[0];
    if (!isSignedIn) {
      if (currentRoute !== 'accesso') router.replace('/accesso');
      return;
    }
    if (!level) {
      if (currentRoute !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (currentRoute === 'accesso') router.replace('/(tabs)');
  }, [isLoaded, isSignedIn, level, ready, router, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="quiz" options={{ presentation: 'modal' }} />
      <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
      <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
      <Stack.Screen name="accesso" options={{ animation: 'fade' }} />
    </Stack>
  );
}

function AuthTokenBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken({ skipCache: true }));
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return children;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [themeReady, setThemeReady] = useState(false);
  const handleThemeReady = useCallback(() => setThemeReady(true), []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && themeReady) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, themeReady]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) {
    throw new Error('Configurazione di autenticazione non disponibile.');
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <AuthTokenBridge>
                    <AppProvider onThemeReady={handleThemeReady}>
                      <RootLayoutNav />
                    </AppProvider>
                  </AuthTokenBridge>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}