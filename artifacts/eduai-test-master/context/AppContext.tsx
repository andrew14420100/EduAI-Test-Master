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
  useStartQuizSession,
  useCompleteQuizSession,
  useGenerateFlashcards,
  useGetQuickExplanation,
  useGetRecoverySummary,
  useRequestUploadUrl,
  useStartRecoverySession,
  useUpdateLevel,
  useUpsertProfile,
  useUseInviteCode,
  type FriendEntry,
  type LeaderboardEntry,
  type Profile,
  type Ticket,
  type QuizSessionResponse,
  type QuizAttempt,
  type Flashcard,
  type MaterialExtractionStatus,
} from '@workspace/api-client-react';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import React, { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type Level = string;
export type Account = { username: string; email: string };
export type ShopItem = {
  id: string;
  title: string;
  subtitle: string;
  cost: number;
  icon: 'moon' | 'zap' | 'award' | 'star';
  itemType: 'tema' | 'distintivo';
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

type AppState = {
  level: Level | null;
  ready: boolean;
  account: Account | null;
  isAuthenticated: boolean;
  // Profile bootstrap state — lets the UI show a recoverable error instead of a blank loop.
  profileSyncing: boolean;
  profileSyncError: string | null;
  retryProfileSync: () => void;
  wallet: number;
  streak: number;
  quizzes: QuizRecord[];
  materials: Material[];
  studyGroups: StudyGroup[];
  shop: ShopItem[];
  tickets: Ticket[];
  leaderboard: LeaderboardEntry[];
  friends: FriendEntry[];
  inviteCode: string;
  refreshing: boolean;
  logout: () => Promise<void>;
  completeOnboarding: (level: Level) => Promise<ActionResult>;
  startQuizSession: (materialIds: string[], totalQuestions: 10 | 20 | 30) => Promise<{ ok: true; session: StartQuizResult } | { ok: false; message: string }>;
  startRecoverySession: () => Promise<{ ok: true; session: StartQuizResult } | { ok: false; message: string }>;
  completeQuizSession: (sessionId: string, answers: (number | null)[], idempotencyKey: string) => Promise<{ ok: true; attempt: CompleteQuizResult } | { ok: false; message: string }>;
  recoveryCount: number;
  getQuickExplanation: (sessionId: string, questionIndex: number) => Promise<{ ok: true; explanation: string; chargedPoints: number } | { ok: false; message: string }>;
  generateFlashcards: (materialIds: string[]) => Promise<{ ok: true; flashcards: StudyFlashcard[] } | { ok: false; message: string }>;
  uploadMaterials: (files: UploadMaterialInput[], groupTitle: string, onProgress: UploadProgress) => Promise<ActionResult>;
  removeMaterial: (id: string) => Promise<ActionResult>;
  buyItem: (id: string) => Promise<ActionResult>;
  equipItem: (id: string) => Promise<ActionResult>;
  createTicket: (subject: string, category: string, message: string) => Promise<ActionResult>;
  useInvite: (code: string) => Promise<ActionResult>;
  refresh: () => Promise<void>;
};

// Server catalog mirrors SHOP_CATALOG in the backend (single source of truth on the server;
// this client copy is display-only — price/type are never trusted by the server).
const shopCatalog: Omit<ShopItem, 'owned' | 'equipped' | 'ownedItemId'>[] = [
  { id: 'dark', title: 'Tema modalità scura', subtitle: 'Un ambiente concentrato e profondo', cost: 15, icon: 'moon', itemType: 'tema' },
  { id: 'neon', title: 'Palette Neon Cyberpunk', subtitle: 'Energia elettrica per studiare', cost: 30, icon: 'zap', itemType: 'tema' },
  { id: 'brilliant', title: 'Studente brillante', subtitle: 'Distintivo del profilo', cost: 10, icon: 'award', itemType: 'distintivo' },
  { id: 'professor', title: 'Professore supremo', subtitle: 'Distintivo del profilo', cost: 25, icon: 'star', itemType: 'distintivo' },
];

function messageFromError(error: unknown) {
  const candidate = error as { data?: { error?: string }; message?: string } | null;
  return candidate?.data?.error ?? candidate?.message ?? 'Operazione non riuscita. Riprova.';
}

function kindFromContentType(contentType: string): MaterialKind {
  if (contentType.startsWith('image/')) return 'immagine';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'documento';
}

function accountName(user: ReturnType<typeof useUser>['user']) {
  const metadataName = user?.unsafeMetadata?.eduaiUsername;
  if (typeof metadataName === 'string' && metadataName.trim().length >= 2) return metadataName.trim();
  const prefix = user?.primaryEmailAddress?.emailAddress.split('@')[0]?.trim();
  if (prefix && prefix.length >= 2) return `${prefix}-${user?.id.slice(-4)}`;
  return `Studente-${user?.id.slice(-4) ?? 'EduAI'}`;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
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
    query: { queryKey: getListTicketsQueryKey(), enabled: dataEnabled },
  });
  const leaderboardQuery = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey(), enabled: dataEnabled },
  });
  const inviteQuery = useGetInviteSummary({
    query: { queryKey: getGetInviteSummaryQueryKey(), enabled: dataEnabled },
  });

  const updateLevelMutation = useUpdateLevel();
  const requestUploadMutation = useRequestUploadUrl();
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
  const createTicketMutation = useCreateTicketMutation();
  const useInviteMutation = useUseInviteCode();

  useEffect(() => {
    if (!isSignedIn || !user) {
      syncAttemptedForRef.current = null;
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

    const sync = async () => {
      try {
        const synced = await upsertProfile.mutateAsync({ data: { username: preferredUsername, email } });
        setProfileSeed(synced);
        setProfileSyncError(null);
        queryClient.setQueryData(getGetProfileQueryKey(), synced);
      } catch (error) {
        // Do NOT clear the attempt ref — keeps us out of a blank retry loop.
        // The error is surfaced for a user-triggered retry via retryProfileSync().
        const message = messageFromError(error);
        setProfileSyncError(message);
        console.error('Sincronizzazione profilo non riuscita', message);
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
    // Ready once auth is loaded and either signed-out, profile present, or the
    // profile sync has errored (so the UI can render a recoverable error state
    // rather than a perpetual loading screen).
    ready: Boolean(isLoaded && (!isSignedIn || profile || profileSyncError)),
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
    streak: profile?.streak ?? 0,
    quizzes,
    materials,
    studyGroups,
    shop,
    tickets: ticketsQuery.data ?? [],
    leaderboard: leaderboardQuery.data ?? [],
    friends: inviteQuery.data?.friends ?? [],
    inviteCode: inviteQuery.data?.inviteCode ?? profile?.inviteCode ?? '',
    refreshing: profileQuery.isFetching
      || materialsQuery.isFetching
      || groupsQuery.isFetching
      || quizzesQuery.isFetching
      || inventoryQuery.isFetching,
    logout: async () => {
      await signOut();
      queryClient.clear();
      setProfileSeed(null);
      setProfileSyncError(null);
      syncAttemptedForRef.current = null;
    },
    completeOnboarding: async (nextLevel) => {
      try {
        const updated = await updateLevelMutation.mutateAsync({ data: { level: nextLevel } });
        setProfileSeed(updated);
        queryClient.setQueryData(getGetProfileQueryKey(), updated);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    startQuizSession: async (materialIds, totalQuestions) => {
      try {
        const session = await startQuizSessionMutation.mutateAsync({
          data: { materialIds, totalQuestions },
        });
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
    generateFlashcards: async (materialIds) => {
      try {
        const response = await generateFlashcardsMutation.mutateAsync({
          data: { materialIds },
        });
        return { ok: true, flashcards: response.flashcards };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    uploadMaterials: async (files, groupTitle, onProgress) => {
      try {
        const group = await createGroupMutation.mutateAsync({ data: { name: groupTitle } });
        await Promise.all(files.map(async (file) => {
          onProgress(file.clientId, 8);
          const nativeFile = new File(file.uri);
          onProgress(file.clientId, 24);
          const size = Math.max(file.size ?? nativeFile.size, 1);
          const upload = await requestUploadMutation.mutateAsync({
            data: { name: file.name, size, contentType: file.contentType },
          });
          onProgress(file.clientId, 42);
          const response = await expoFetch(upload.uploadURL, {
            method: 'PUT',
            headers: { 'Content-Type': file.contentType },
            body: nativeFile,
          });
          if (!response.ok) throw new Error(`Caricamento di ${file.name} non riuscito.`);
          onProgress(file.clientId, 88);
          await finalizeMaterialMutation.mutateAsync({
            data: {
              contentType: file.contentType,
              objectPath: upload.objectPath,
              size,
              groupId: group.id,
            },
          });
          onProgress(file.clientId, 100);
        }));
        await Promise.all([materialsQuery.refetch(), groupsQuery.refetch()]);
        return { ok: true };
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
      try {
        await buyItemMutation.mutateAsync({
          data: { itemId: item.id },
        });
        await Promise.all([inventoryQuery.refetch(), profileQuery.refetch()]);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    equipItem: async (id) => {
      const item = shop.find((candidate) => candidate.id === id);
      if (!item?.ownedItemId) return { ok: false, message: 'Prima devi sbloccare questo oggetto.' };
      try {
        await equipItemMutation.mutateAsync({ data: { ownedItemId: item.ownedItemId } });
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
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    useInvite: async (code) => {
      try {
        await useInviteMutation.mutateAsync({ data: { code: code.trim().toUpperCase() } });
        await Promise.all([inviteQuery.refetch(), leaderboardQuery.refetch()]);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageFromError(error) };
      }
    },
    refresh,
  }), [
    buyItemMutation,
    completeQuizSessionMutation,
    createGroupMutation,
    createTicketMutation,
    dataEnabled,
    deleteMaterialMutation,
    equipItemMutation,
    finalizeMaterialMutation,
    generateFlashcardsMutation,
    groupsQuery,
    inventoryQuery,
    inviteQuery,
    isLoaded,
    isSignedIn,
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
    shop,
    signOut,
    startRecoverySessionMutation,
    startQuizSessionMutation,
    studyGroups,
    ticketsQuery,
    updateLevelMutation,
    useInviteMutation,
    user,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve essere usato all\'interno di AppProvider');
  return context;
}
