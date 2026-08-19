import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Level = string;
export type Account = { username: string; email: string };
export type ShopItem = { id: string; title: string; subtitle: string; cost: number; icon: 'moon' | 'zap' | 'award' | 'star'; owned: boolean; equipped: boolean };
export type QuizRecord = { id: string; title: string; score: number; passed: boolean; date: string };
export type MaterialKind = 'documento' | 'immagine' | 'video' | 'audio';
export type Material = {
  id: string;
  name: string;
  uri: string;
  kind: MaterialKind;
  size?: number;
  batchId?: string;
  addedAt: string;
};
export type StudyGroup = {
  id: string;
  title: string;
  materialIds: string[];
  createdAt: string;
};

type AuthResult = { ok: true } | { ok: false; message: string };

type AppState = {
  level: Level | null;
  ready: boolean;
  account: Account | null;
  isAuthenticated: boolean;
  authNoticePending: boolean;
  wallet: number;
  streak: number;
  quizzes: QuizRecord[];
  materials: Material[];
  studyGroups: StudyGroup[];
  shop: ShopItem[];
  register: (username: string, email: string, password: string) => AuthResult;
  login: (email: string, password: string) => AuthResult;
  finishAuthentication: () => void;
  logout: () => void;
  completeOnboarding: (level: Level) => void;
  addQuiz: (record: QuizRecord) => void;
  addMaterials: (materials: Material[]) => void;
  addStudyGroup: (group: StudyGroup) => void;
  removeMaterial: (id: string) => void;
  buyItem: (id: string) => boolean;
  equipItem: (id: string) => boolean;
};

type PersistedState = {
  level: Level | null;
  account: Account | null;
  passwordDigest: string | null;
  sessionActive: boolean;
  wallet: number;
  streak: number;
  quizzes: QuizRecord[];
  materials: Material[];
  studyGroups: StudyGroup[];
  shop: ShopItem[];
};

const STORAGE_KEY = 'eduai-state-v4';
const LEGACY_STORAGE_KEY = 'eduai-state-v3';

const starterShop: ShopItem[] = [
  { id: 'dark', title: 'Tema modalità scura', subtitle: 'Un ambiente concentrato e profondo', cost: 15, icon: 'moon', owned: false, equipped: false },
  { id: 'neon', title: 'Palette Neon Cyberpunk', subtitle: 'Energia elettrica per studiare', cost: 30, icon: 'zap', owned: false, equipped: false },
  { id: 'brilliant', title: 'Studente brillante', subtitle: 'Distintivo del profilo', cost: 10, icon: 'award', owned: false, equipped: false },
  { id: 'professor', title: 'Professore supremo', subtitle: 'Distintivo del profilo', cost: 25, icon: 'star', owned: false, equipped: false },
];

const defaultState: PersistedState = {
  level: null,
  account: null,
  passwordDigest: null,
  sessionActive: false,
  wallet: 0,
  streak: 0,
  quizzes: [],
  materials: [],
  studyGroups: [],
  shop: starterShop,
};

function digestPassword(password: string) {
  let hash = 2166136261;
  for (let index = 0; index < password.length; index += 1) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `locale-${(hash >>> 0).toString(16)}`;
}

function titleFromMaterials(materials: Material[]) {
  const names = materials.map((material) => material.name.replace(/\.[^/.]+$/, '').trim()).filter(Boolean);
  if (!names.length) return 'Pacchetto di studio';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names[1]} e altri ${names.length - 2}`;
}

function groupsFromMaterialBatches(materials: Material[]) {
  const batches = new Map<string, Material[]>();
  materials.forEach((material) => {
    if (!material.batchId) return;
    const batch = batches.get(material.batchId) ?? [];
    batch.push(material);
    batches.set(material.batchId, batch);
  });
  return Array.from(batches.entries()).map(([id, batchMaterials]): StudyGroup => ({
    id,
    title: titleFromMaterials(batchMaterials),
    materialIds: batchMaterials.map((material) => material.id),
    createdAt: batchMaterials[0]?.addedAt ?? new Date().toISOString(),
  }));
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<Level | null>(defaultState.level);
  const [account, setAccount] = useState<Account | null>(defaultState.account);
  const [passwordDigest, setPasswordDigest] = useState<string | null>(defaultState.passwordDigest);
  const [sessionActive, setSessionActive] = useState(defaultState.sessionActive);
  const [authNoticePending, setAuthNoticePending] = useState(false);
  const [wallet, setWallet] = useState(defaultState.wallet);
  const [streak, setStreak] = useState(defaultState.streak);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>(defaultState.quizzes);
  const [materials, setMaterials] = useState<Material[]>(defaultState.materials);
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>(defaultState.studyGroups);
  const [shop, setShop] = useState<ShopItem[]>(starterShop);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restore = async () => {
      try {
        const current = await AsyncStorage.getItem(STORAGE_KEY);
        if (current) {
          const saved = JSON.parse(current) as Partial<PersistedState>;
          const restoredMaterials = (saved.materials ?? []).map((item) => ({ ...item, addedAt: item.addedAt ?? new Date().toISOString() }));
          setLevel(saved.level ?? null);
          setAccount(saved.account ?? null);
          setPasswordDigest(saved.passwordDigest ?? null);
          setSessionActive(Boolean(saved.account && saved.sessionActive));
          setWallet(saved.wallet ?? 0);
          setStreak(saved.streak ?? 0);
          setQuizzes(saved.quizzes ?? []);
          setMaterials(restoredMaterials);
          setStudyGroups(saved.studyGroups?.length ? saved.studyGroups : groupsFromMaterialBatches(restoredMaterials));
          setShop(saved.shop?.length ? saved.shop : starterShop);
          return;
        }

        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const saved = JSON.parse(legacy) as Partial<PersistedState>;
          const restoredMaterials = (saved.materials ?? []).map((item) => ({ ...item, addedAt: item.addedAt ?? new Date().toISOString() }));
          setLevel(saved.level ?? null);
          setWallet(saved.wallet ?? 0);
          setStreak(saved.streak ?? 0);
          setQuizzes(saved.quizzes ?? []);
          setMaterials(restoredMaterials);
          setStudyGroups(groupsFromMaterialBatches(restoredMaterials));
          setShop(saved.shop?.length ? saved.shop : starterShop);
        }
      } catch {
        setLevel(null);
        setAccount(null);
        setPasswordDigest(null);
        setSessionActive(false);
        setWallet(0);
        setStreak(0);
        setQuizzes([]);
        setMaterials([]);
        setStudyGroups([]);
        setShop(starterShop);
      } finally {
        setHydrated(true);
      }
    };

    void restore();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedState = {
      level,
      account,
      passwordDigest,
      sessionActive,
      wallet,
      streak,
      quizzes,
      materials,
      studyGroups,
      shop,
    };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [account, hydrated, level, materials, passwordDigest, quizzes, sessionActive, shop, streak, studyGroups, wallet]);

  const value = useMemo<AppState>(() => ({
    level,
    ready: hydrated,
    account,
    isAuthenticated: Boolean(account && sessionActive),
    authNoticePending,
    wallet,
    streak,
    quizzes,
    materials,
    studyGroups,
    shop,
    register: (username, email, password) => {
      if (account) return { ok: false, message: 'Su questo dispositivo esiste già un account. Accedi con le credenziali salvate.' };
      const cleanUsername = username.trim();
      const cleanEmail = email.trim().toLowerCase();
      if (cleanUsername.length < 2) return { ok: false, message: 'Inserisci un nome utente di almeno 2 caratteri.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, message: 'Inserisci un indirizzo email valido.' };
      if (password.length < 6) return { ok: false, message: 'La password deve contenere almeno 6 caratteri.' };
      setAccount({ username: cleanUsername, email: cleanEmail });
      setPasswordDigest(digestPassword(password));
      setSessionActive(true);
      setAuthNoticePending(true);
      return { ok: true };
    },
    login: (email, password) => {
      if (!account || !passwordDigest) return { ok: false, message: 'Non esiste ancora un account su questo dispositivo.' };
      if (account.email !== email.trim().toLowerCase() || passwordDigest !== digestPassword(password)) {
        return { ok: false, message: 'Email o password non corretti.' };
      }
      setSessionActive(true);
      setAuthNoticePending(true);
      return { ok: true };
    },
    finishAuthentication: () => setAuthNoticePending(false),
    logout: () => {
      setAuthNoticePending(false);
      setSessionActive(false);
    },
    completeOnboarding: (next) => setLevel(next),
    addQuiz: (record) => {
      setQuizzes((items) => [record, ...items]);
      if (record.passed) {
        setWallet((currentWallet) => currentWallet + record.score);
        setStreak((currentStreak) => currentStreak + 1);
      }
    },
    addMaterials: (newMaterials) => setMaterials((items) => [...newMaterials, ...items]),
    addStudyGroup: (group) => setStudyGroups((groups) => [group, ...groups]),
    removeMaterial: (id) => {
      setMaterials((items) => items.filter((item) => item.id !== id));
      setStudyGroups((groups) => groups
        .map((group) => ({ ...group, materialIds: group.materialIds.filter((materialId) => materialId !== id) }))
        .filter((group) => group.materialIds.length));
    },
    buyItem: (id) => {
      const item = shop.find((entry) => entry.id === id);
      if (!item || item.owned || wallet < item.cost) return false;
      setWallet((currentWallet) => currentWallet - item.cost);
      setShop((items) => items.map((entry) => entry.id === id ? { ...entry, owned: true } : entry));
      return true;
    },
    equipItem: (id) => {
      const item = shop.find((entry) => entry.id === id);
      if (!item?.owned) return false;
      setShop((items) => items.map((entry) => ({ ...entry, equipped: entry.id === id })));
      return true;
    },
  }), [account, authNoticePending, hydrated, level, materials, passwordDigest, quizzes, sessionActive, shop, streak, studyGroups, wallet]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve essere usato all’interno di AppProvider');
  return context;
}