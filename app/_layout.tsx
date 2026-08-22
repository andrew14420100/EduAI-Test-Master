import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ClerkLoaded, ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import Constants from 'expo-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppIcon } from '@/components/AppIcon';
import { AppProvider, useApp } from '@/context/AppContext';
import { customFetch, setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

SplashScreen.preventAutoHideAsync();
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
const queryClient = new QueryClient();
const buildExtra = (Constants.expoConfig?.extra ?? {}) as {
  apiDomain?: string;
  clerkPublishableKey?: string;
  clerkProxyUrl?: string;
};
const domain = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_DOMAIN || buildExtra.apiDomain;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || buildExtra.clerkPublishableKey;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || buildExtra.clerkProxyUrl || undefined;

if (domain) setBaseUrl(domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`);

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoaded, isSignedIn } = useAuth();
  const { level, ready, refreshing, rewardEvent, completionAnimation, dismissRewardEvent } = useApp();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(true);
    const timer = setTimeout(() => setNavigating(false), 350);
    return () => clearTimeout(timer);
  }, [segments.join('/')]);

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

  useEffect(() => {
    if (!isSignedIn || Platform.OS === 'web') return;
    void (async () => {
      const current = await Notifications.getPermissionsAsync();
      if (!current.granted && current.canAskAgain) {
        await Notifications.requestPermissionsAsync();
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('eduai', {
          name: 'EduAI Test Master',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        });
      }
      if ((await Notifications.getPermissionsAsync()).granted) {
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId;
          const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
          await customFetch('/api/push-tokens', {
            method: 'POST',
            responseType: 'json',
            body: JSON.stringify({ token, platform: Platform.OS }),
          });
        } catch {
          // Push registration is best-effort; local notifications remain available.
        }
      }
    })();
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || Platform.OS === 'web') return;
    const openTicketFromNotification = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { type?: string; ticketId?: string } | undefined;
      if (data?.type === 'ticket-reply' && data.ticketId) {
        router.push({ pathname: '/(tabs)/profile', params: { ticketId: data.ticketId } });
      }
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openTicketFromNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openTicketFromNotification(response);
    });
    return () => subscription.remove();
  }, [isSignedIn, router]);

  useEffect(() => {
    if (!rewardEvent || rewardEvent.kind !== 'assistenza' || Platform.OS === 'web') return;
    void Notifications.scheduleNotificationAsync({
      content: {
        title: 'EduAI Test Master',
        body: rewardEvent.message || 'Ti è arrivata una risposta al ticket.',
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'eduai' } : {}),
      },
      trigger: null,
    });
  }, [rewardEvent]);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quiz" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
        <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accesso" options={{ animation: 'fade' }} />
      </Stack>
      {(navigating || refreshing) ? (
        <View pointerEvents="none" style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#0D8F72" />
          <Text style={styles.loadingText}>{refreshing ? 'Aggiornamento…' : 'Caricamento…'}</Text>
        </View>
      ) : null}
      {rewardEvent ? (
        <RewardToast
          key={rewardEvent.id}
          event={rewardEvent}
          animation={completionAnimation}
          onDismiss={dismissRewardEvent}
        />
      ) : null}
    </View>
  );
}

function RewardToast({
  event,
  animation,
  onDismiss,
}: {
  event: NonNullable<ReturnType<typeof useApp>['rewardEvent']>;
  animation: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2800);
    return () => clearTimeout(timer);
  }, [event.id, onDismiss]);

  const icon = event.kind === 'flashcard'
    ? 'flashcards'
    : event.kind === 'laboratorio'
      ? 'flask'
      : event.kind === 'amico'
        ? 'users'
        : event.kind === 'livello' || event.kind === 'livello_successivo'
          ? 'award'
          : event.kind === 'negozio' || event.kind === 'ricompensa'
            ? 'sparkles'
            : event.kind === 'accesso'
              ? 'lock'
              : animation === 'anim_fire'
                ? 'flame'
                : animation === 'anim_stars'
                  ? 'star'
                  : animation === 'anim_crown'
                    ? 'award'
                    : 'circle-check';

  return (
    <View pointerEvents="none" style={styles.rewardToast}>
      <View style={styles.rewardIcon}>
        <AppIcon name={icon} size={18} color="#08111F" />
      </View>
      <View style={styles.rewardCopy}>
        <Text style={styles.rewardTitle}>{event.title}</Text>
        <Text style={styles.rewardMessage}>{event.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingBar: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  loadingText: { color: '#153A35', fontSize: 12, fontWeight: '600' },
  rewardToast: {
    position: 'absolute',
    top: 56,
    left: 18,
    right: 18,
    minHeight: 62,
    borderRadius: 18,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#D5F4E8',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  rewardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7CF6D3' },
  rewardCopy: { flex: 1, gap: 2 },
  rewardTitle: { color: '#086E55', fontSize: 13, fontWeight: '700' },
  rewardMessage: { color: '#28584B', fontSize: 12, lineHeight: 16 },
  configurationError: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#F4FAF7' },
  configurationTitle: { color: '#153A35', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  configurationBody: { color: '#55716B', fontSize: 16, lineHeight: 24 },
});

function AuthTokenBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
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
    if (!fontsLoaded && !fontError) return;
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 250);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey || !domain) {
    return (
      <SafeAreaProvider>
        <View style={styles.configurationError}>
          <Text style={styles.configurationTitle}>Configurazione incompleta</Text>
          <Text style={styles.configurationBody}>
            Questa versione dell’app non contiene la configurazione necessaria per collegarsi al servizio.
            Installa una build di produzione aggiornata.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <AuthTokenBridge>
                  <AppProvider onThemeReady={handleThemeReady}>
                    <RootLayoutNav />
                  </AppProvider>
                </AuthTokenBridge>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}