import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Level = 'Liceo Scientifico' | 'Liceo Classico' | 'Istituto Tecnico' | 'Medicina' | 'Ingegneria' | 'Giurisprudenza' | 'Economia';
export type ShopItem = { id: string; title: string; subtitle: string; cost: number; icon: string; owned: boolean; equipped: boolean };
export type QuizRecord = { id: string; title: string; score: number; passed: boolean; date: string };
export type Material = { id: string; name: string; uri: string; kind: 'documento' | 'immagine' | 'video'; size?: number };

type AppState = {
  level: Level | null;
  ready: boolean;
  wallet: number;
  streak: number;
  quizzes: QuizRecord[];
  materials: Material[];
  shop: ShopItem[];
  completeOnboarding: (level: Level) => void;
  addQuiz: (record: QuizRecord) => void;
  addMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  buyItem: (id: string) => void;
  equipItem: (id: string) => void;
};

const starterShop: ShopItem[] = [
  { id: 'dark', title: 'Tema modalità scura', subtitle: 'Un ambiente concentrato e profondo', cost: 15, icon: 'moon', owned: false, equipped: false },
  { id: 'neon', title: 'Palette Neon Cyberpunk', subtitle: 'Energia elettrica per studiare', cost: 30, icon: 'zap', owned: false, equipped: false },
  { id: 'brilliant', title: 'Studente brillante', subtitle: 'Distintivo del profilo', cost: 10, icon: 'award', owned: false, equipped: false },
  { id: 'professor', title: 'Professore supremo', subtitle: 'Distintivo del profilo', cost: 25, icon: 'star', owned: false, equipped: false },
];

const defaultState = { level: null as Level | null, wallet: 0, streak: 0, quizzes: [] as QuizRecord[], materials: [] as Material[], shop: starterShop };
const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<Level | null>(defaultState.level);
  const [wallet, setWallet] = useState(defaultState.wallet);
  const [streak] = useState(defaultState.streak);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>(defaultState.quizzes);
  const [materials, setMaterials] = useState<Material[]>(defaultState.materials);
  const [shop, setShop] = useState<ShopItem[]>(starterShop);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('eduai-state-v3').then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<typeof defaultState>;
      setLevel(saved.level ?? null); setWallet(saved.wallet ?? 0); setQuizzes(saved.quizzes ?? []);
      setMaterials(saved.materials ?? []);
      setShop(saved.shop?.length ? saved.shop : starterShop);
    }).finally(() => setHydrated(true));
  }, []);
  useEffect(() => { if (hydrated) AsyncStorage.setItem('eduai-state-v3', JSON.stringify({ level, wallet, quizzes, materials, shop })); }, [hydrated, level, wallet, quizzes, materials, shop]);

  const value = useMemo<AppState>(() => ({
    level, ready: hydrated, wallet, streak, quizzes, materials, shop,
    completeOnboarding: (next) => setLevel(next),
    addQuiz: (record) => {
      setQuizzes((items) => [record, ...items]);
      if (record.passed) setWallet((value) => value + record.score);
    },
    addMaterial: (material) => setMaterials((items) => [material, ...items]),
    removeMaterial: (id) => setMaterials((items) => items.filter((item) => item.id !== id)),
    buyItem: (id) => { const item = shop.find((entry) => entry.id === id); if (!item || item.owned || wallet < item.cost) return; setWallet((value) => value - item.cost); setShop((items) => items.map((entry) => entry.id === id ? { ...entry, owned: true } : entry)); },
    equipItem: (id) => setShop((items) => items.map((item) => ({ ...item, equipped: item.id === id ? true : item.equipped }))),
  }), [level, wallet, streak, quizzes, materials, shop, hydrated]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}