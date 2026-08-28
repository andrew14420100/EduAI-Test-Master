import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProfileQueryKey,
  getGetInventoryQueryKey,
  getGetInviteSummaryQueryKey,
  getGetLeaderboardQueryKey,
  getGetRecoverySummaryQueryKey,
  getListGroupsQueryKey,
  getListMaterialsQueryKey,
  getListQuizAttemptsQueryKey,
  getListTicketsQueryKey,
  getListLabExercisesQueryKey,
  getListLabAttemptsQueryKey,
  useBuyShopItem,
  useCreateGroup,
  useCreateTicket as useCreateTicketMutation,
  useDeleteMaterial,
  useEquipShopItem,
  useFinalizeMaterial,
  useGetInventory,
  useGetInviteSummary,
  useGetLeaderboard,
  useGetProfile,
  useListGroups,
  useListMaterials,
  useListQuizAttempts,
  useListTickets,
  useMarkTicketRead,
  useListLabExercises,
  useListLabAttempts,
  useSubmitLabAttempt,
  useSetLabsEnabled,
  useStartQuizSession,
  useCompleteQuizSession,
  useGenerateFlashcards,
  useGetQuickExplanation,
  useGetRecoverySummary,
  useRequestUploadUrl,
  useRetryMaterialAnalysis,
  useStartRecoverySession,
  useUpdateLevel,
  useUpsertProfile,
  useCompleteOnboarding,
  useUseInviteCode,
  useUseLightTheme,
  customFetch,
  type FriendEntry,
  type LeaderboardEntry,
  type Profile,
  type Ticket,
  type QuizSessionResponse,
  type QuizAttempt,
  type Flashcard,
  type MaterialExtractionStatus,
  type LabExercise,
  type LabAttemptResult,
  type LabAttemptHistory,
} from '@workspace/api-client-react';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import React, { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { ThemeProvider, type AppTheme } from '@/context/ThemeContext';
import {
  GAMIFICATION_BADGES,
  gamificationGradeFromXp,
  gamificationLevelFromXp,
  type GamificationBadge,
} from '@/constants/progression';
import { setNativeAppIcon, type NativeAppIconId } from '@/lib/nativeAppIcon';
import {
  nativeIconErrorMessage,
  nativeIconRecoveryMessage,
  restoreNativeIconSelection,
  type IconSelectionSnapshot,
} from '@/lib/nativeIconRecovery';

const configuredApiDomain = process.env.EXPO_PUBLIC_API_URL
  || process.env.EXPO_PUBLIC_DOMAIN
  || (Constants.expoConfig?.extra as { apiDomain?: string } | undefined)?.apiDomain
  || '';
const configuredApiBaseUrl = configuredApiDomain.startsWith('http://') || configuredApiDomain.startsWith('https://')
  ? configuredApiDomain
  : configuredApiDomain ? `https://${configuredApiDomain}` : '';

export type Level = string;
export type Account = { username: string; email: string };
export type ShopItem = {
  id: string;
  title: string;
  subtitle: string;
  cost: number;
  icon: 'moon' | 'zap' | 'award' | 'star' | 'sparkles' | 'layers' | 'flame' | 'shield' | 'paintbrush' | 'tag' | 'upload';
  itemType: 'tema' | 'distintivo' | 'collezionabile' | 'icona_futura' | 'animazione' | 'animazione_completamento' | 'animazione_livello' | 'animazione_streak' | 'animazione_upload' | 'animazione_risposta' | 'animazione_sblocco' | 'animazione_interfaccia' | 'stile_carta' | 'cornice_avatar' | 'decorazione_profilo' | 'titolo';
  rarity?: 'comune' | 'non_comune' | 'raro' | 'epico' | 'leggendario';
  owned: boolean;
  equipped: boolean;
  ownedItemId?: string;
};
export type QuizRecord = {
  id: string;
  title: string;
  score: number;
  totalQuestions: number;
  passed: boolean;
  date: string;
  earnedPoints: number;
  materialId: string;
};
export type MaterialKind = 'documento' | 'immagine' | 'video' | 'audio';
export type Material = {
  id: string;
  name: string;
  uri: string;
  kind: MaterialKind;
  contentType: string;
  size?: number;
  batchId?: string;
  addedAt: string;
  // Content readiness (never exposes raw extracted text).
  extractionStatus: MaterialExtractionStatus;
  extractionMessage: string;
  isStudyReady: boolean;
};
export type StudyGroup = {
  id: string;
  title: string;
  materialIds: string[];
  createdAt: string;
};
export type UploadMaterialInput = {
  clientId: string;
  name: string;
  uri: string;
  kind: MaterialKind;
  size?: number;
  contentType: string;
};

export type StartQuizResult = {
  sessionId: string;
  questions: QuizSessionResponse['questions'];
  expiresAt: string;
};

export type CompleteQuizResult = QuizAttempt;

export type StudyFlashcard = Flashcard;

type ActionResult = { ok: true } | { ok: false; message: string };
type UploadProgress = (clientId: string, progress: number) => void;
type NativeIconApplyResult =
  | { ok: true }
  | { ok: false; error: unknown; message: string };
export type RewardEvent = {
  id: number;
  kind: 'accesso' | 'livello' | 'livello_successivo' | 'amico' | 'verifica' | 'flashcard' | 'laboratorio' | 'negozio' | 'ricompensa' | 'assistenza';
  title: string;
  message: string;
  effectId?: string | null;
};

const MAX_MEDIA_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_PARALLEL_UPLOADS = 2;

type AppState = {
  level: Level | null;
  learnerProfile: Profile | null;
  onboardingComplete: boolean;
  profileNeedsOnboarding: boolean;
  ready: boolean;
  account: Account | null;
  isAuthenticated: boolean;
  // Profile bootstrap state — lets the UI show a recoverable error instead of a blank loop.
  profileSyncing: boolean;
  profileSyncError: string | null;
  retryProfileSync: () => void;
  wallet: number;
  xp: number;
  theme: AppTheme;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  streak: number;
  quizzes: QuizRecord[];
  materials: Material[];
  studyGroups: StudyGroup[];
  shop: ShopItem[];
  badges: GamificationBadge[];
  gamificationLevel: number;
  gamificationGrade: string;
  appIconId: string | null;
  nativeIconError: string | null;
  retryNativeIcon: () => Promise<ActionResult>;
  useStandardIcon: () => Promise<ActionResult>;
  completionAnimation: string | null;
  rewardEvent: RewardEvent | null;
  dismissRewardEvent: () => void;
  tickets: Ticket[];
  unreadSupportCount: number;
  markTicketRead: (ticketId: string) => Promise<ActionResult>;
  deleteAccount: () => Promise<ActionResult>;
  leaderboard: LeaderboardEntry[];
  friends: FriendEntry[];
  inviteCode: string;
  refreshing: boolean;
  logout: () => Promise<void>;
  completeOnboarding: (data: {
    firstName: string;
    lastName: string;
    birthDate: string;
    level: Level;
    institutionType: 'scuola_superiore' | 'universita' | 'altro';
    institutionName: string;
    studyYear: string;
    studyAddress: string;
    learningGoals?: string;
    studyInterests?: string;
    examGoals?: string;
  }) => Promise<ActionResult>;
  startQuizSession: (materialIds: string[], totalQuestions: 10 | 20 | 30, variant?: string) => Promise<{ ok: true; session: StartQuizResult } | { ok: false; message: string }>;
  startRecoverySession: () => Promise<{ ok: true; session: StartQuizResult } | { ok: false; message: string }>;
  completeQuizSession: (sessionId: string, answers: (number | null)[], idempotencyKey: string) => Promise<{ ok: true; attempt: CompleteQuizResult } | { ok: false; message: string }>;
  recoveryCount: number;
  getQuickExplanation: (sessionId: string, questionIndex: number) => Promise<{ ok: true; explanation: string; chargedPoints: number } | { ok: false; message: string }>;
  generateFlashcards: (materialIds: string[], variant?: string) => Promise<{ ok: true; flashcards: StudyFlashcard[] } | { ok: false; message: string }>;
  uploadMaterials: (files: UploadMaterialInput[], groupTitle: string, onProgress: UploadProgress) => Promise<ActionResult>;
  retryMaterialAnalysis: (id: string) => Promise<ActionResult>;
  generateLabsForMaterial: (id: string) => Promise<ActionResult>;
  generateLabsForMaterials: (regenerate?: boolean) => Promise<ActionResult & { created?: number; existing?: number; materialCount?: number }>;
  removeMaterial: (id: string) => Promise<ActionResult>;
  buyItem: (id: string) => Promise<ActionResult>;
  equipItem: (id: string) => Promise<ActionResult>;
  useLightTheme: () => Promise<ActionResult>;
  createTicket: (subject: string, category: string, message: string) => Promise<ActionResult>;
  useInvite: (code: string) => Promise<ActionResult>;
  refresh: () => Promise<void>;
  // Labs
  labExercises: LabExercise[];
  labAttempts: LabAttemptHistory[];
  labsEnabled: boolean;
  hasLabsByDefault: boolean;
  labsLoading: boolean;
  submitLabAttempt: (exerciseId: string, userAnswer: string) => Promise<{ ok: true; result: { score: number; feedback: string; solution?: string; earnedPoints: number; totalPoints: number } } | { ok: false; message: string }>;
  deleteLabExercise: (exerciseId: string) => Promise<ActionResult>;
  deleteLabExercises: (exerciseIds: string[]) => Promise<ActionResult>;
  enableLabs: (enabled: boolean) => Promise<ActionResult>;
};

// Server catalog mirrors SHOP_CATALOG in the backend (single source of truth on the server;
// this client copy is display-only — price/type are never trusted by the server).
const shopCatalog: Omit<ShopItem, 'owned' | 'equipped' | 'ownedItemId'>[] = [
  // ── TEMI (palette colori, equipaggiabili — uno attivo alla volta) ──────────
  { id: 'dark',     title: 'Modalità scura',       subtitle: 'Sfondo scuro, riposo visivo garantito',   cost: 15,  icon: 'moon',       itemType: 'tema' },
  { id: 'neon',     title: 'Neon Cyberpunk',        subtitle: 'Viola e verde elettrico ad alta energia',  cost: 40,  icon: 'zap',        itemType: 'tema' },
  { id: 'ocean',    title: 'Oceano',                subtitle: 'Blu profondi e accenti acqua',             cost: 55,  icon: 'moon',       itemType: 'tema' },
  { id: 'forest',   title: 'Foresta',               subtitle: 'Verde morbido, studio nella natura',       cost: 65,  icon: 'moon',       itemType: 'tema' },
  { id: 'sunset',   title: 'Tramonto',              subtitle: 'Arancio caldo e rosa al crepuscolo',       cost: 75,  icon: 'moon',       itemType: 'tema' },
  { id: 'midnight', title: 'Mezzanotte',            subtitle: 'Blu cobalto per sessioni notturne',        cost: 90,  icon: 'moon',       itemType: 'tema' },
  { id: 'ember',    title: 'Brace',                 subtitle: 'Rosso e ambra per studiare con fuoco',     cost: 110, icon: 'flame',      itemType: 'tema' },
  { id: 'arctic',   title: 'Artico',                subtitle: 'Bianco ghiaccio e accenti ciano',          cost: 130, icon: 'moon',       itemType: 'tema' },

  // ── ANIMAZIONI DI COMPLETAMENTO (effetto visivo fine verifica, equipaggiabili) ──
  { id: 'anim_confetti',  title: 'Coriandoli',       subtitle: 'Animazione completamento · equipaggiabile', cost: 25,  icon: 'sparkles',   itemType: 'animazione_completamento' },
  { id: 'anim_stars',     title: 'Pioggia di stelle', subtitle: 'Animazione completamento · equipaggiabile', cost: 35,  icon: 'star',       itemType: 'animazione_completamento' },
  { id: 'anim_fire',      title: 'Fiamme del successo', subtitle: 'Animazione completamento · equipaggiabile', cost: 50,  icon: 'flame',      itemType: 'animazione_completamento' },
  { id: 'anim_aurora',    title: 'Aurora boreale',   subtitle: 'Passaggio di livello · equipaggiabile', cost: 70,  icon: 'sparkles',   itemType: 'animazione_livello' },
  { id: 'anim_lightning', title: 'Lampi di genio',   subtitle: 'Passaggio di livello · equipaggiabile', cost: 90,  icon: 'zap',        itemType: 'animazione_livello' },
  { id: 'anim_crown',     title: 'Incoronazione',    subtitle: 'Animazione completamento · equipaggiabile', cost: 120, icon: 'award',      itemType: 'animazione_completamento' },
  { id: 'event_levelup', title: 'Salto stellare', subtitle: 'Passaggio di livello · equipaggiabile', cost: 45, icon: 'star', itemType: 'animazione_livello' },
  { id: 'event_streak', title: 'Fiamma quotidiana', subtitle: 'Login e serie giornaliera · equipaggiabile', cost: 40, icon: 'flame', itemType: 'animazione_streak' },
  { id: 'event_upload', title: 'Materiale pronto', subtitle: 'Upload riuscito · equipaggiabile', cost: 35, icon: 'upload', itemType: 'animazione_upload' },
  { id: 'event_answer', title: 'Colpo di genio', subtitle: 'Risposta corretta o sbagliata · equipaggiabile', cost: 30, icon: 'zap', itemType: 'animazione_risposta' },
  { id: 'event_unlock', title: 'Mappa sbloccata', subtitle: 'Mappa e flashcard · equipaggiabile', cost: 55, icon: 'layers', itemType: 'animazione_sblocco' },
  { id: 'event_interface', title: 'Bordo luminoso', subtitle: 'Interfaccia e tema schede · equipaggiabile', cost: 60, icon: 'sparkles', itemType: 'animazione_interfaccia' },
  { id: 'avatar_gold_frame', title: 'Cornice Aurea', subtitle: 'Cornice avatar · equipaggiabile', cost: 95, icon: 'award', itemType: 'cornice_avatar', rarity: 'epico' },
  { id: 'avatar_glow_frame', title: 'Aureola luminosa', subtitle: 'Cornice avatar animata · equipaggiabile', cost: 160, icon: 'sparkles', itemType: 'cornice_avatar', rarity: 'leggendario' },
  { id: 'profile_stats_glow', title: 'Statistiche Neon', subtitle: 'Decorazione contatori profilo · equipaggiabile', cost: 75, icon: 'zap', itemType: 'decorazione_profilo', rarity: 'raro' },
  { id: 'profile_stats_glitch', title: 'Glitch Leggendario', subtitle: 'Bordo animato statistiche · equipaggiabile', cost: 180, icon: 'zap', itemType: 'decorazione_profilo', rarity: 'leggendario' },

  // ── STILI CARTA (aspetto delle card materiali e quiz, equipaggiabili) ────────
  { id: 'card_glass',     title: 'Vetro smerigliato', subtitle: 'Stile carta · equipaggiabile',          cost: 30,  icon: 'layers',     itemType: 'stile_carta' },
  { id: 'card_gradient',  title: 'Sfumatura viva',    subtitle: 'Stile carta · equipaggiabile',          cost: 45,  icon: 'paintbrush', itemType: 'stile_carta' },
  { id: 'card_minimal',   title: 'Minimalismo puro',  subtitle: 'Stile carta · equipaggiabile',          cost: 55,  icon: 'layers',     itemType: 'stile_carta' },
  { id: 'card_neon',      title: 'Bordo neon',        subtitle: 'Stile carta · equipaggiabile',          cost: 80,  icon: 'zap',        itemType: 'stile_carta' },
  { id: 'card_paper',     title: 'Carta da quaderno',  subtitle: 'Stile carta · equipaggiabile',         cost: 60,  icon: 'paintbrush', itemType: 'stile_carta' },

  // ── TITOLI / RANGHI PROFILO (testo sotto al nome, equipaggiabili) ────────────
  { id: 'title_studioso',   title: '"Lo Studioso"',        subtitle: 'Titolo profilo · equipaggiabile',  cost: 20,  icon: 'tag',        itemType: 'titolo' },
  { id: 'title_stratega',   title: '"Il Stratega"',        subtitle: 'Titolo profilo · equipaggiabile',  cost: 35,  icon: 'tag',        itemType: 'titolo' },
  { id: 'title_pioniere',   title: '"Il Pioniere"',        subtitle: 'Titolo profilo · equipaggiabile',  cost: 50,  icon: 'tag',        itemType: 'titolo' },
  { id: 'title_genio',      title: '"Il Genio"',           subtitle: 'Titolo profilo · equipaggiabile',  cost: 75,  icon: 'tag',        itemType: 'titolo' },
  { id: 'title_maratoneta', title: '"Il Maratoneta"',      subtitle: 'Titolo profilo · equipaggiabile',  cost: 95,  icon: 'tag',        itemType: 'titolo' },
  { id: 'title_maestro',    title: '"Maestro del Sapere"', subtitle: 'Titolo profilo · equipaggiabile',  cost: 130, icon: 'tag',        itemType: 'titolo' },
  { id: 'title_leggenda',   title: '"La Leggenda"',        subtitle: 'Titolo profilo · equipaggiabile',  cost: 200, icon: 'tag',        itemType: 'titolo' },
  { id: 'title_professore', title: '"Il Professore"',      subtitle: 'Titolo profilo · equipaggiabile',  cost: 160, icon: 'tag',        itemType: 'titolo' },

  // ── DISTINTIVI SIGNIFICATIVI (pochi, guadagnati con impegno) ────────────────
  { id: 'app_icon_midnight', title: 'Icona Mezzanotte', subtitle: 'Simbolo profilo e accento · equipaggiabile', cost: 110, icon: 'moon',       itemType: 'icona_futura' },
  { id: 'app_icon_neon',     title: 'Icona Neon',       subtitle: 'Simbolo profilo e accento · equipaggiabile', cost: 140, icon: 'zap',        itemType: 'icona_futura' },
  { id: 'app_icon_scholar',  title: 'Icona Studioso',   subtitle: 'Simbolo profilo e accento · equipaggiabile', cost: 170, icon: 'award',      itemType: 'icona_futura' },
  { id: 'app_icon_aurora',   title: 'Icona Aurora',     subtitle: 'Simbolo profilo e accento · equipaggiabile', cost: 210, icon: 'sparkles',   itemType: 'icona_futura' },
  { id: 'app_icon_legend',   title: 'Icona Leggenda',   subtitle: 'Simbolo profilo e accento · equipaggiabile', cost: 260, icon: 'star',       itemType: 'icona_futura' },
];

function messageFromError(error: unknown) {
  const candidate = error as {
    data?: { error?: string };
    message?: string;
    method?: string;
    status?: number;
    url?: string;
  } | null;
  if (
    candidate?.status === 404
    && candidate.method === 'PATCH'
    && candidate.url?.includes('/api/profile/onboarding')
  ) {
    return 'Il servizio del profilo non è aggiornato. Chiudi e riapri l’app, quindi riprova. I dati inseriti sono stati conservati.';
  }
  return candidate?.data?.error ?? candidate?.message ?? 'Operazione non riuscita. Riprova.';
}

type UploadStep = 'preparazione' | 'trasferimento' | 'finalizzazione';

function uploadStepError(step: UploadStep, fileName: string, error: unknown): Error {
  const detail = messageFromError(error);

  const isNetworkError = error instanceof TypeError
    || /failed to fetch|network request failed|network error/i.test(detail);
  if (isNetworkError) {
    if (step === 'trasferimento') {
      return new Error(
        `Trasferimento di ${fileName} verso lo storage non riuscito. `
        + 'Controlla la connessione e il CORS del bucket, quindi riprova.',
      );
    }
    return new Error(
      `${step === 'preparazione' ? 'Preparazione' : 'Salvataggio'} di ${fileName} non riuscito. `
      + 'Il server API non è raggiungibile: controlla la connessione e riprova.',
    );
  }

  const labels: Record<UploadStep, string> = {
    preparazione: `Preparazione dell'upload di ${fileName} non riuscita`,
    trasferimento: `Trasferimento di ${fileName} verso lo storage non riuscito`,
    finalizzazione: `Salvataggio del materiale ${fileName} non riuscito`,
  };
  return new Error(`${labels[step]}: ${detail}`);
}

function kindFromContentType(contentType: string): MaterialKind {
  if (contentType.startsWith('image/')) return 'immagine';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'documento';
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item) await worker(item);
    }
  }));
}

function accountName(user: ReturnType<typeof useUser>['user']) {
  const metadataName = user?.unsafeMetadata?.eduaiUsername;
  if (typeof metadataName === 'string' && metadataName.trim().length >= 2) {
    return metadataName.trim().slice(0, 32);
  }
  const suffix = `-${user?.id.slice(-4) ?? 'EduAI'}`;
  const prefix = user?.primaryEmailAddress?.emailAddress.split('@')[0]?.trim();
  if (prefix && prefix.length >= 2) {
    return `${prefix.slice(0, 32 - suffix.length)}${suffix}`;
  }
  return `Studente-${user?.id.slice(-4) ?? 'EduAI'}`;
}

function initialStoredTheme(): AppTheme | null {
  if (Platform.OS !== 'web') return null;
  try {
    const value = globalThis.localStorage?.getItem('eduai:last-theme');
    return isAppTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light'
    || value === 'dark'
    || value === 'neon'
    || value === 'ocean'
    || value === 'forest'
    || value === 'sunset'
    || value === 'midnight'
    || value === 'ember'
    || value === 'arctic';
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({
  children,
  onThemeReady,
}: {
  children: ReactNode;
  onThemeReady?: () => void;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  // Tracks which user id we have *attempted* to sync (regardless of outcome).
  // Set BEFORE the async call and never cleared on failure, so a failed sync
  // does not immediately re-trigger the effect into a tight retry loop.
  const syncAttemptedForRef = useRef<string | null>(null);
  const [profileSeed, setProfileSeed] = useState<Profile | null>(null);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);
  // Bumping this manually re-arms a single retry attempt for the current user.
  const [profileSyncNonce, setProfileSyncNonce] = useState(0);
  const [storedTheme, setStoredTheme] = useState<AppTheme | null>(initialStoredTheme);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [rewardEvent, setRewardEvent] = useState<RewardEvent | null>(null);
  const [nativeIconError, setNativeIconError] = useState<string | null>(null);
  const nativeIconTargetRef = useRef<NativeAppIconId | null>(null);
  const rewardEventIdRef = useRef(0);
  const triggerReward = (
    kind: RewardEvent['kind'],
    title: string,
    message: string,
    effectId: string | null = null,
  ) => {
    rewardEventIdRef.current += 1;
    setRewardEvent({ id: rewardEventIdRef.current, kind, title, message, effectId });
  };

  useEffect(() => {
    if (!user?.id) {
      setSoundEnabledState(true);
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(`eduai:sound:${user.id}`).then((value) => {
      if (!cancelled) setSoundEnabledState(value !== 'off');
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!rewardEvent || !soundEnabled || Platform.OS === 'web') return;
    void Haptics.notificationAsync(
      rewardEvent.kind === 'verifica' || rewardEvent.kind === 'livello' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Success,
    );
  }, [rewardEvent, soundEnabled]);

  const upsertProfile = useUpsertProfile();
  const profileQuery = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: Boolean(isSignedIn && profileSeed), retry: 2 },
  });
  const profile = profileQuery.data ?? profileSeed;
  const dataEnabled = Boolean(isSignedIn && profile);

  const materialsQuery = useListMaterials({
    query: { queryKey: getListMaterialsQueryKey(), enabled: dataEnabled },
  });
  const groupsQuery = useListGroups({
    query: { queryKey: getListGroupsQueryKey(), enabled: dataEnabled },
  });
  const quizzesQuery = useListQuizAttempts({
    query: { queryKey: getListQuizAttemptsQueryKey(), enabled: dataEnabled },
  });
  const recoveryQuery = useGetRecoverySummary({
    query: { queryKey: getGetRecoverySummaryQueryKey(), enabled: dataEnabled },
  });
  const inventoryQuery = useGetInventory({
    query: { queryKey: getGetInventoryQueryKey(), enabled: dataEnabled },
  });
  const ticketsQuery = useListTickets({
    // A support reply is written by a separate admin session. Poll while the
    // user is signed in so the profile cannot remain on a stale open thread.
    query: {
      queryKey: getListTicketsQueryKey(),
      enabled: dataEnabled,
      refetchInterval: dataEnabled ? 15_000 : false,
    },
  });
  const leaderboardQuery = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey(), enabled: dataEnabled },
  });
  const inviteQuery = useGetInviteSummary({
    query: { queryKey: getGetInviteSummaryQueryKey(), enabled: dataEnabled },
  });
  // Labs — the list endpoint also returns labsEnabled/hasLabsByDefault flags.
  // Enabled whenever data is enabled: the server responds 403 when labs are off,
  // so we rely on the profile flags below for visibility and keep retry low.
  const labsEnabledFlag = Boolean(profile?.labsEnabled);
  const labExercisesQuery = useListLabExercises({
    query: { queryKey: getListLabExercisesQueryKey(), enabled: dataEnabled && labsEnabledFlag, retry: 1 },
  });
  const labAttemptsQuery = useListLabAttempts({
    query: { queryKey: getListLabAttemptsQueryKey(), enabled: dataEnabled && labsEnabledFlag, retry: 1 },
  });

  const updateLevelMutation = useUpdateLevel();
  const completeOnboardingMutation = useCompleteOnboarding();
  const requestUploadMutation = useRequestUploadUrl();
  const retryMaterialAnalysisMutation = useRetryMaterialAnalysis();
  const finalizeMaterialMutation = useFinalizeMaterial();
  const createGroupMutation = useCreateGroup();
  const deleteMaterialMutation = useDeleteMaterial();
  const startQuizSessionMutation = useStartQuizSession();
  const completeQuizSessionMutation = useCompleteQuizSession();
  const generateFlashcardsMutation = useGenerateFlashcards();
  const startRecoverySessionMutation = useStartRecoverySession();
  const quickExplanationMutation = useGetQuickExplanation();
  const buyItemMutation = useBuyShopItem();
  const equipItemMutation = useEquipShopItem();
  const useLightThemeMutation = useUseLightTheme();
  const createTicketMutation = useCreateTicketMutation();
  const markTicketReadMutation = useMarkTicketRead();
  const useInviteMutation = useUseInviteCode();
  const submitLabAttemptMutation = useSubmitLabAttempt();
  const setLabsEnabledMutation = useSetLabsEnabled();
  const seenUnreadAdminMessageIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unreadAdminMessageIds = new Set(
      (ticketsQuery.data ?? []).flatMap((ticket) => (ticket.unread
        ? (ticket.messages ?? [])
          .filter((message) => message.authorRole === 'admin' && (!ticket.readAt || new Date(message.createdAt) > new Date(ticket.readAt)))
          .map((message) => message.id)
        : [])),
    );
    if (seenUnreadAdminMessageIdsRef.current === null) {
      seenUnreadAdminMessageIdsRef.current = unreadAdminMessageIds;
      if (unreadAdminMessageIds.size > 0) {
        triggerReward('assistenza', 'Nuova risposta dall’assistenza', 'Apri il profilo per leggere la risposta al tuo ticket.');
      }
      return;
    }
    const hasNewReply = [...unreadAdminMessageIds].some((id) => !seenUnreadAdminMessageIdsRef.current?.has(id));
    seenUnreadAdminMessageIdsRef.current = unreadAdminMessageIds;
    if (hasNewReply) {
      triggerReward('assistenza', 'Nuova risposta dall’assistenza', 'Apri il profilo per leggere la risposta al tuo ticket.');
    }
  }, [ticketsQuery.data]);

  useEffect(() => {
    if (!isSignedIn || !user) {
      syncAttemptedForRef.current = null;
      seenUnreadAdminMessageIdsRef.current = null;
      setProfileSeed(null);
      setProfileSyncing(false);
      setProfileSyncError(null);
      return;
    }

    // A different signed-in user resets the attempt tracker.
    if (
      syncAttemptedForRef.current
      && !syncAttemptedForRef.current.startsWith(`${user.id}:`)
    ) {
      syncAttemptedForRef.current = null;
    }

    // Exactly one attempt per (user id + retry nonce). If we've already attempted
    // for this user at this nonce, do nothing — no automatic tight retries.
    const attemptKey = `${user.id}:${profileSyncNonce}`;
    if (syncAttemptedForRef.current === attemptKey || profileSyncing) return;

    syncAttemptedForRef.current = attemptKey;
    setProfileSyncing(true);
    setProfileSyncError(null);
    const email = user.primaryEmailAddress?.emailAddress ?? undefined;
    const preferredUsername = accountName(user);
    const metadata = user.unsafeMetadata as Record<string, unknown> | undefined;
    const metadataText = (key: string) => typeof metadata?.[key] === 'string' ? String(metadata[key]).trim() : undefined;

    const sync = async () => {
      try {
        const synced = await upsertProfile.mutateAsync({
          data: {
            username: preferredUsername,
            email,
            firstName: user.firstName?.trim() || metadataText('eduaiFirstName'),
            lastName: user.lastName?.trim() || metadataText('eduaiLastName'),
            birthDate: metadataText('eduaiBirthDate'),
          },
        });
        setProfileSeed(synced);
        setProfileSyncError(null);
        queryClient.setQueryData(getGetProfileQueryKey(), synced);
        triggerReward('accesso', 'Accesso effettuato', 'Bentornato nel tuo spazio di studio.');
      } catch (error) {
        // Do NOT clear the attempt ref — keeps us out of a blank retry loop.
        // The error is surfaced for a user-triggered retry via retryProfileSync().
        const message = messageFromError(error);
        setProfileSyncError(message);
      } finally {
        setProfileSyncing(false);
      }
    };

    void sync();
  }, [isSignedIn, profileSyncing, profileSyncNonce, queryClient, upsertProfile, user]);

  const materials = useMemo<Material[]>(() => (materialsQuery.data ?? []).map((item) => ({
    id: item.id,
    name: item.title,
    uri: item.objectPath,
    kind: kindFromContentType(item.contentType),
    contentType: item.contentType,
    size: item.size ?? undefined,
    batchId: item.groupId ?? undefined,
    addedAt: item.createdAt,
    extractionStatus: item.extractionStatus,
    extractionMessage: item.extractionMessage,
    isStudyReady: item.isStudyReady,
  })), [materialsQuery.data]);

  const studyGroups = useMemo<StudyGroup[]>(() => (groupsQuery.data ?? []).map((group) => ({
    id: group.id,
    title: group.name,
    materialIds: materials.filter((material) => material.batchId === group.id).map((material) => material.id),
    createdAt: group.createdAt,
  })), [groupsQuery.data, materials]);

  const quizzes = useMemo<QuizRecord[]>(() => (quizzesQuery.data ?? []).map((attempt) => {
    const related = materials.find((material) => material.id === attempt.materialId);
    return {
      id: attempt.id,
      title: related?.name ?? 'Verifica EduAI',
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      passed: attempt.score / attempt.totalQuestions >= 0.6,
      date: attempt.createdAt,
      earnedPoints: attempt.earnedCoins ?? attempt.score * 5,
      materialId: attempt.materialId,
    };
  }).sort((a, b) => b.date.localeCompare(a.date)), [materials, quizzesQuery.data]);

  const shop = useMemo<ShopItem[]>(() => shopCatalog.map((catalogItem) => {
    const owned = inventoryQuery.data?.find((item) => item.itemId === catalogItem.id);
    return {
      ...catalogItem,
      owned: Boolean(owned),
      equipped: Boolean(owned?.equipped),
      ownedItemId: owned?.id,
    };
  }), [inventoryQuery.data]);
  const badges = useMemo(() => {
    const ownedBadges = inventoryQuery.data?.filter((item) => item.itemType === 'distintivo') ?? [];
    return ownedBadges
      .map((item) => GAMIFICATION_BADGES.find((badge) => badge.id === item.itemId))
      .filter((badge): badge is GamificationBadge => Boolean(badge));
  }, [inventoryQuery.data]);
  const equippedAppIcon = inventoryQuery.data?.find((item) => item.itemType === 'icona_futura' && item.equipped);
  const appIconId = equippedAppIcon?.itemId ?? null;
  const gamificationLevel = gamificationLevelFromXp(profile?.xp ?? 0);
  const gamificationGrade = gamificationGradeFromXp(profile?.xp ?? 0);
  const completionAnimation = shop.find((item) => item.itemType.startsWith('animazione') && item.equipped)?.id ?? null;
  const serverTheme: AppTheme =
    (shop.find((item) => item.itemType === 'tema' && item.equipped)?.id as AppTheme | undefined)
    ?? 'light';
  const theme: AppTheme = storedTheme ?? serverTheme;

  const applyNativeIcon = async (iconId: NativeAppIconId): Promise<NativeIconApplyResult> => {
    try {
      await setNativeAppIcon(iconId);
      nativeIconTargetRef.current = iconId;
      setNativeIconError(null);
      return { ok: true };
    } catch (error) {
      nativeIconTargetRef.current = null;
      const message = `${nativeIconErrorMessage(error)} Puoi riprovare oppure usare “Icona standard originale”.`;
      setNativeIconError(message);
      return { ok: false, error, message };
    }
  };

  const restoreIconSelection = async (previous: IconSelectionSnapshot): Promise<{ ok: true } | { ok: false; error: unknown }> => {
    return restoreNativeIconSelection(previous, {
      restoreServerSelection: async () => {
        if (previous.iconId === 'standard') {
          await customFetch('/api/shop/icons/use-standard', {
            method: 'POST',
            responseType: 'auto',
          });
        } else if (previous.ownedItemId) {
          await equipItemMutation.mutateAsync({ data: { ownedItemId: previous.ownedItemId } });
        } else {
          throw new Error('Impossibile identificare l’icona precedente.');
        }
      },
      applyNativeIcon: setNativeAppIcon,
      refresh: async () => {
        await Promise.all([inventoryQuery.refetch(), profileQuery.refetch()]);
      },
      onNativeIconRestored: (iconId) => {
        nativeIconTargetRef.current = iconId;
      },
      onNativeIconRestoreFailed: () => {
        nativeIconTargetRef.current = null;
      },
    });
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!user?.id) {
      setStoredTheme(null);
      onThemeReady?.();
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(`eduai:theme:${user.id}`).then((value) => {
      if (cancelled) return;
      if (isAppTheme(value)) setStoredTheme(value);
      else setStoredTheme(null);
      onThemeReady?.();
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, onThemeReady, user?.id]);

  // Native visual tests seed the same persisted value through a deep link,
  // then cold-start the app again. This branch is stripped from production
  // builds and cannot change a user's theme outside development builds.
  useEffect(() => {
    if (!__DEV__ || !isLoaded || !user?.id) return;
    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (cancelled || !url) return;
      const value = Linking.parse(url).queryParams?.value;
      const key = `eduai:theme:${user.id}`;
      if (value === 'none') {
        void AsyncStorage.removeItem(key);
        return;
      }
      if (value !== 'dark' && value !== 'light') return;
      void AsyncStorage.setItem(key, value);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id]);

  useEffect(() => {
    if (!user?.id || !inventoryQuery.data) return;
    setStoredTheme(serverTheme);
    void AsyncStorage.setItem(`eduai:theme:${user.id}`, serverTheme);
  }, [inventoryQuery.data, serverTheme, user?.id]);

  useEffect(() => {
    if (!isSignedIn) {
      nativeIconTargetRef.current = null;
      setNativeIconError(null);
      return;
    }
    if (!inventoryQuery.data) return;
    const target = (appIconId ?? 'standard') as NativeAppIconId;
    if (nativeIconTargetRef.current === target) return;
    void applyNativeIcon(target);
  }, [appIconId, inventoryQuery.data, isSignedIn]);

  useEffect(() => {
    const analysisInProgress = (materialsQuery.data ?? []).some(
      (material) => material.extractionStatus === 'pending' || material.extractionStatus === 'processing',
    );
    if (!analysisInProgress) return;
    const interval = setInterval(() => {
      void materialsQuery.refetch();
    }, 4000);
    return () => clearInterval(interval);
  }, [materialsQuery, materialsQuery.data]);

  const refresh = async () => {
    if (!dataEnabled) return;
    await Promise.all([
      profileQuery.refetch(),
      materialsQuery.refetch(),
      groupsQuery.refetch(),
      quizzesQuery.refetch(),
      recoveryQuery.refetch(),
      inventoryQuery.refetch(),
      ticketsQuery.refetch(),
      leaderboardQuery.refetch(),
      inviteQuery.refetch(),
    ]);
  };

  const value = useMemo<AppState>(() => ({
    level: profile?.level ?? null,
    learnerProfile: profile ?? null,
    onboardingComplete: Boolean(
      profile?.firstName
      && profile?.lastName
      && profile?.birthDate
      && profile?.level
      && profile?.institutionType
      && profile?.institutionName
      && profile?.studyYear
      && profile?.studyAddress,
    ),
     profileNeedsOnboarding: Boolean(
       (profile
        && (!profile.firstName
        || !profile.lastName
        || !profile.birthDate
        || !profile.level
        || !profile.institutionType
        || !profile.institutionName
        || !profile.studyYear
         || !profile.studyAddress))
       || (isSignedIn && !profile && profileSyncError),
    ),
    // Ready once auth is loaded and either signed-out, profile present, or the
    // profile sync has errored (so the UI can render a recoverable error state
    // rather than a perpetual loading screen).
    ready: Boolean(
      isLoaded && (
        !isSignedIn
        || profileSyncError
        || (
          profile
          && materialsQuery.isSuccess
          && inventoryQuery.isSuccess
          && groupsQuery.isSuccess
          && quizzesQuery.isSuccess
          && recoveryQuery.isSuccess
          && inviteQuery.isSuccess
          && leaderboardQuery.isSuccess
          && ticketsQuery.isSuccess
        )
      ),
    ),
    account: profile ? {
      username: profile.username,
      email: user?.primaryEmailAddress?.emailAddress ?? '',
    } : null,
    isAuthenticated: Boolean(isSignedIn),
    profileSyncing,
    profileSyncError,
    retryProfileSync: () => {
      if (profileSyncing) return;
      setProfileSyncError(null);
      setProfileSyncNonce((n) => n + 1);
    },
    wallet: profile?.wallet ?? 0,
    xp: profile?.xp ?? 0,
    theme,
    soundEnabled,
    setSoundEnabled: async (enabled) => {
      setSoundEnabledState(enabled);
      if (user?.id) await AsyncStorage.setItem(`eduai:sound:${user.id}`, enabled ? 'on' : 'off');
    },
    streak: profile?.streak ?? 0,
    quizzes,
    materials,
    studyGroups,
    shop,
    badges,
    gamificationLevel,
    gamificationGrade,
    appIconId,
    nativeIconError,
    retryNativeIcon: async () => {
      const result = await applyNativeIcon((appIconId ?? 'standard') as NativeAppIconId);
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
    completionAnimation,
    rewardEvent,
    dismissRewardEvent: () => setRewardEvent(null),
    tickets: ticketsQuery.data ?? [],
    unreadSupportCount: (ticketsQuery.data ?? []).filter((ticket) => ticket.unread).length,
    leaderboard: leaderboardQuery.data ?? [],
    friends: inviteQuery.data?.friends ?? [],
    inviteCode: inviteQuery.data?.inviteCode ?? profile?.inviteCode ?? '',
    // Kept for compatibility with older screens; loading is intentionally local
    // so a background fetch never blocks tab navigation.
    refreshing: false,
    logout: async () => {
      await signOut();
      queryClient.clear();
      setProfileSeed(null);
      setProfileSyncError(null);
      syncAttemptedForRef.current = null;
       seenUnreadAdminMessageIdsRef.current = null;
    },
    completeOnboarding: async (data) => {
      try {
        const updated = await completeOnboardingMutation.mutateAsync({ data });
        setProfileSeed(updated);
        queryClient.setQueryData(getGetProfileQueryKey(), updated);
         await Promise.all([
           profileQuery.refetch(),
           materialsQuery.refetch(),
           quizzesQuery.refetch(),
           recoveryQuery.refetch(),
           inventoryQuery.refetch(),
           leaderboardQuery.refetch(),
           inviteQuery.refetch(),
         ]);
         triggerReward('livello', 'Profilo completato', 'Il tuo spazio di studio è pronto: puoi iniziare a studiare.');
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    startQuizSession: async (materialIds, totalQuestions, variant) => {
      try {
        const session = await startQuizSessionMutation.mutateAsync({
          // The generated client may be stale in an isolated Expo typecheck;
          // the server accepts the optional variant field and validates it.
          data: { materialIds, totalQuestions, variant: variant ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` } as never,
        });
        triggerReward('verifica', 'Verifica pronta', 'Le domande sono state costruite dai materiali selezionati.');
        return { ok: true, session };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    startRecoverySession: async () => {
      try {
        const session = await startRecoverySessionMutation.mutateAsync();
        return { ok: true, session };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    completeQuizSession: async (sessionId, answers, idempotencyKey) => {
      try {
        const attempt = await completeQuizSessionMutation.mutateAsync({
          sessionId,
          data: { answers, idempotencyKey },
        });
        await Promise.all([quizzesQuery.refetch(), recoveryQuery.refetch(), profileQuery.refetch(), leaderboardQuery.refetch()]);
        triggerReward('verifica', 'Verifica completata', 'Hai ricevuto punti e aggiornato i tuoi progressi.');
        return { ok: true, attempt };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    recoveryCount: recoveryQuery.data?.pendingCount ?? 0,
    getQuickExplanation: async (sessionId, questionIndex) => {
      try {
        const result = await quickExplanationMutation.mutateAsync({ data: { sessionId, questionIndex } });
        await profileQuery.refetch();
        return { ok: true, explanation: result.explanation, chargedPoints: result.chargedPoints };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    generateFlashcards: async (materialIds, variant) => {
      try {
        const response = await generateFlashcardsMutation.mutateAsync({
          data: { materialIds, variant: variant ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` } as never,
        });
        triggerReward('flashcard', 'Flashcard pronte', 'Un nuovo set di ripasso è stato generato dal contenuto.');
        return { ok: true, flashcards: response.flashcards };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    uploadMaterials: async (files, groupTitle, onProgress) => {
      try {
        const group = await createGroupMutation.mutateAsync({ data: { name: groupTitle } });
        await runWithConcurrency(files, MAX_PARALLEL_UPLOADS, async (file) => {
          try {
            onProgress(file.clientId, 8);
            let webBlob: Blob | null = null;
            let detectedSize = file.size ?? 0;
            if (Platform.OS === 'web') {
              const localResponse = await fetch(file.uri);
              if (!localResponse.ok) throw new Error(`Impossibile leggere ${file.name}.`);
              webBlob = await localResponse.blob();
              detectedSize = webBlob.size;
            } else {
              const info = await FileSystem.getInfoAsync(file.uri);
              if (info.exists && typeof info.size === 'number') {
                detectedSize = info.size;
              }
            }
            // The picker metadata can be stale (especially on web). The size
            // sent to the API must describe the bytes that will actually be
            // sent, otherwise finalization correctly rejects the upload.
            const size = detectedSize;
            if (!Number.isFinite(size) || size <= 0) {
              throw new Error(`Non è possibile determinare una dimensione valida per ${file.name}.`);
            }
            if (
              (file.contentType.startsWith('audio/') || file.contentType.startsWith('video/'))
              && size > MAX_MEDIA_UPLOAD_BYTES
            ) {
              throw new Error(`${file.name} supera il limite di 250 MB previsto per audio e video.`);
            }
            onProgress(file.clientId, 24);
            let upload: Awaited<ReturnType<typeof requestUploadMutation.mutateAsync>>;
            try {
              upload = await requestUploadMutation.mutateAsync({
                data: { name: file.name, size, contentType: file.contentType },
              });
            } catch (error) {
              throw uploadStepError('preparazione', file.name, error);
            }
            onProgress(file.clientId, 42);
            try {
              if (Platform.OS === 'web') {
                const response = await fetch(upload.uploadURL, {
                  method: 'PUT',
                  headers: { 'Content-Type': file.contentType },
                  body: webBlob,
                });
                if (!response.ok) {
                  const detail = await response.text().catch(() => '');
                  throw new Error(
                    `HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
                  );
                }
              } else {
                const task = FileSystem.createUploadTask(
                  upload.uploadURL,
                  file.uri,
                  {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: { 'Content-Type': file.contentType },
                  },
                  ({ totalBytesSent, totalBytesExpectedToSend }) => {
                    if (totalBytesExpectedToSend > 0) {
                      onProgress(
                        file.clientId,
                        Math.min(87, 42 + Math.round((totalBytesSent / totalBytesExpectedToSend) * 45)),
                      );
                    }
                  },
                );
                const response = await task.uploadAsync();
                if (!response || response.status < 200 || response.status >= 300) {
                  throw new Error(`HTTP ${response?.status ?? 'senza risposta'}`);
                }
              }
              onProgress(file.clientId, 87);
            } catch (error) {
              throw uploadStepError('trasferimento', file.name, error);
            }
            onProgress(file.clientId, 88);
            try {
              await finalizeMaterialMutation.mutateAsync({
                data: {
                  contentType: file.contentType,
                  objectPath: upload.objectPath,
                  size,
                  groupId: group.id,
                },
              });
            } catch (error) {
              throw uploadStepError('finalizzazione', file.name, error);
            }
            onProgress(file.clientId, 100);
          } catch (error) {
            onProgress(file.clientId, -1);
            throw error;
          }
        });
        await Promise.all([materialsQuery.refetch(), groupsQuery.refetch()]);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    retryMaterialAnalysis: async (id) => {
      try {
        await retryMaterialAnalysisMutation.mutateAsync({ materialId: id });
        await materialsQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    generateLabsForMaterial: async (id) => {
      try {
        const token = await getToken();
        const base = configuredApiBaseUrl;
        const response = await fetch(`${base}/api/materials/${id}/labs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) return { ok: false, message: body.error ?? 'Impossibile creare i laboratori.' };
        await labExercisesQuery.refetch();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Impossibile creare i laboratori. Controlla la connessione.' };
      }
    },
    generateLabsForMaterials: async (regenerate = false) => {
      try {
        const response = await customFetch<{ created: number; existing: number; materialCount: number }>('/api/labs/generate', {
          method: 'POST',
          body: JSON.stringify({ regenerate, variant: `${Date.now()}-${Math.random().toString(36).slice(2)}` }),
          responseType: 'json',
        });
        await labExercisesQuery.refetch();
        triggerReward('laboratorio', 'Laboratorio rigenerato', 'Sono disponibili nuovi esercizi pratici.');
        return { ok: true, ...response };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    removeMaterial: async (id) => {
      try {
        await deleteMaterialMutation.mutateAsync({ materialId: id });
        await materialsQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    buyItem: async (id) => {
      // Only send itemId — server resolves price and type from its catalog
      const item = shopCatalog.find((candidate) => candidate.id === id);
      if (!item) return { ok: false, message: 'Oggetto non trovato.' };
      const previousIcon: IconSelectionSnapshot = {
        iconId: (appIconId ?? 'standard') as NativeAppIconId,
        ownedItemId: shop.find((candidate) => candidate.id === appIconId)?.ownedItemId,
      };
      try {
        await buyItemMutation.mutateAsync({
          data: { itemId: item.id },
        });
        if (item.itemType === 'icona_futura') {
          const nativeResult = await applyNativeIcon(item.id as NativeAppIconId);
          if (!nativeResult.ok) {
            const rollback = await restoreIconSelection(previousIcon);
            return {
              ok: false,
              message: nativeIconRecoveryMessage('acquisto', item.id as NativeAppIconId, nativeResult.error, rollback),
            };
          }
        }
        await Promise.all([inventoryQuery.refetch(), profileQuery.refetch()]);
        triggerReward('negozio', 'Premio sbloccato', 'Il nuovo oggetto è nella tua collezione.', item.id);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    equipItem: async (id) => {
      const item = shop.find((candidate) => candidate.id === id);
      if (!item?.ownedItemId) return { ok: false, message: 'Prima devi sbloccare questo oggetto.' };
      const previousIcon: IconSelectionSnapshot = {
        iconId: (appIconId ?? 'standard') as NativeAppIconId,
        ownedItemId: shop.find((candidate) => candidate.id === appIconId)?.ownedItemId,
      };
      try {
        await equipItemMutation.mutateAsync({ data: { ownedItemId: item.ownedItemId } });
        if (item.itemType === 'tema' && user?.id) {
          const nextTheme: AppTheme = isAppTheme(item.id) ? item.id : 'light';
          setStoredTheme(nextTheme);
          await AsyncStorage.setItem(`eduai:theme:${user.id}`, nextTheme);
          if (Platform.OS === 'web') globalThis.localStorage?.setItem('eduai:last-theme', nextTheme);
        }
        if (item.itemType === 'icona_futura') {
          const nativeResult = await applyNativeIcon(item.id as NativeAppIconId);
          if (!nativeResult.ok) {
            const rollback = await restoreIconSelection(previousIcon);
            return {
              ok: false,
              message: nativeIconRecoveryMessage('equipaggiamento', item.id as NativeAppIconId, nativeResult.error, rollback),
            };
          }
        }
        await inventoryQuery.refetch();
        triggerReward('negozio', 'Oggetto equipaggiato', 'Il tuo nuovo effetto è attivo in tutta l’app.', item.id);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    useLightTheme: async () => {
      try {
        await useLightThemeMutation.mutateAsync();
        setStoredTheme('light');
        if (user?.id) await AsyncStorage.setItem(`eduai:theme:${user.id}`, 'light');
        if (Platform.OS === 'web') globalThis.localStorage?.setItem('eduai:last-theme', 'light');
        await inventoryQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    useStandardIcon: async () => {
      const previousIcon: IconSelectionSnapshot = {
        iconId: (appIconId ?? 'standard') as NativeAppIconId,
        ownedItemId: shop.find((candidate) => candidate.id === appIconId)?.ownedItemId,
      };
      try {
        await customFetch('/api/shop/icons/use-standard', {
          method: 'POST',
          responseType: 'auto',
        });
        const nativeResult = await applyNativeIcon('standard');
        if (!nativeResult.ok) {
          const rollback = await restoreIconSelection(previousIcon);
          return {
            ok: false,
            message: nativeIconRecoveryMessage('ripristino', 'standard', nativeResult.error, rollback),
          };
        }
        await inventoryQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    createTicket: async (subject, category, message) => {
      try {
        await createTicketMutation.mutateAsync({ data: { subject, category, message } });
        await ticketsQuery.refetch();
        triggerReward('assistenza', 'Ticket inviato', 'La richiesta è stata salvata e potrai seguirne lo stato.');
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    markTicketRead: async (ticketId) => {
      try {
        await markTicketReadMutation.mutateAsync({ ticketId });
        await ticketsQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    deleteAccount: async () => {
      try {
        await customFetch<void>('/api/profile', { method: 'DELETE', responseType: 'json' });
        try {
          await user?.delete();
        } catch {
          // Server data is already removed; sign out still blocks this session.
        }
        await signOut();
        queryClient.clear();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    useInvite: async (code) => {
      try {
        await useInviteMutation.mutateAsync({ data: { code: code.trim().toUpperCase() } });
        await Promise.all([inviteQuery.refetch(), leaderboardQuery.refetch()]);
        triggerReward('amico', 'Amico aggiunto', 'L’invito è stato accettato e la classifica è aggiornata.');
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    refresh,
    // ── Labs ──────────────────────────────────────────────────────────────
    labExercises: labExercisesQuery.data?.exercises ?? [],
    labAttempts: labAttemptsQuery.data ?? [],
    labsEnabled: Boolean(profile?.labsEnabled),
    hasLabsByDefault: Boolean(profile?.hasLabsByDefault),
    labsLoading: labExercisesQuery.isLoading,
    submitLabAttempt: async (exerciseId, userAnswer) => {
      try {
        const attempt = await submitLabAttemptMutation.mutateAsync({ data: { exerciseId, userAnswer } });
        // Wallet and history change server-side in the same transaction.
        await Promise.all([profileQuery.refetch(), labAttemptsQuery.refetch(), leaderboardQuery.refetch()]);
        triggerReward('laboratorio', 'Laboratorio completato', 'Hai guadagnato punti con la tua soluzione pratica.');
        return {
          ok: true,
          result: {
            score: attempt.score,
            feedback: attempt.feedback,
            solution: attempt.solution,
            earnedPoints: attempt.earnedPoints,
            totalPoints: attempt.totalPoints,
          },
        };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    deleteLabExercise: async (exerciseId) => {
      try {
        const token = await getToken();
        const base = configuredApiBaseUrl;
        const response = await fetch(`${base}/api/labs/exercises/${exerciseId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          return { ok: false, message: body.error ?? 'Impossibile eliminare il laboratorio.' };
        }
        await Promise.all([labExercisesQuery.refetch(), labAttemptsQuery.refetch()]);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    deleteLabExercises: async (exerciseIds) => {
      try {
        const response = await customFetch<{ deleted: number }>('/api/labs/exercises/delete-many', {
          method: 'POST',
          body: JSON.stringify({ ids: exerciseIds }),
          headers: { 'Content-Type': 'application/json' },
        });
        await Promise.all([labExercisesQuery.refetch(), labAttemptsQuery.refetch()]);
        return { ok: true, message: `${response.deleted} laboratori eliminati.` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Impossibile eliminare i laboratori.' };
      }
    },
    enableLabs: async (enabled) => {
      try {
        const updated = await setLabsEnabledMutation.mutateAsync({ data: { enabled } });
        queryClient.setQueryData(getGetProfileQueryKey(), updated);
        await profileQuery.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
  }), [
    buyItemMutation,
    badges,
    completeQuizSessionMutation,
    completeOnboardingMutation,
    createGroupMutation,
    createTicketMutation,
    markTicketReadMutation,
    dataEnabled,
    deleteMaterialMutation,
    equipItemMutation,
    finalizeMaterialMutation,
    generateFlashcardsMutation,
    gamificationGrade,
    gamificationLevel,
    groupsQuery,
    inventoryQuery,
    inviteQuery,
    isLoaded,
    isSignedIn,
    appIconId,
    nativeIconError,
    labAttemptsQuery,
    labExercisesQuery,
    leaderboardQuery,
    materials,
    materialsQuery,
    profile,
    profileSyncing,
    profileSyncError,
    profileQuery,
    queryClient,
    quickExplanationMutation,
    quizzes,
    quizzesQuery,
    recoveryQuery.data,
    requestUploadMutation,
    setLabsEnabledMutation,
    shop,
    completionAnimation,
    signOut,
    startRecoverySessionMutation,
    startQuizSessionMutation,
    submitLabAttemptMutation,
    studyGroups,
    ticketsQuery,
    updateLevelMutation,
    useInviteMutation,
    useLightThemeMutation,
    user,
  ]);

  return (
    <AppContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve essere usato all\'interno di AppProvider');
  return context;
}
