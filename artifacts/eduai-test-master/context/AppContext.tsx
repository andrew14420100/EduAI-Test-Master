import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Level = 'Liceo Scientifico' | 'Liceo Classico' | 'Istituto Tecnico' | 'Medicine' | 'Engineering' | 'Law' | 'Economics';
export type ShopItem = { id: string; title: string; subtitle: string; cost: number; icon: string; owned: boolean; equipped: boolean };
export type QuizRecord = { id: string; title: string; score: number; passed: boolean; date: string };

type AppState = {
  level: Level;
  wallet: number;
  streak: number;
  quizzes: QuizRecord[];
  shop: ShopItem[];
  completeOnboarding: (level: Level) => void;
  addQuiz: (record: QuizRecord) => void;
  buyItem: (id: string) => void;
  equipItem: (id: string) => void;
};

const starterShop: ShopItem[] = [
  { id: 'dark', title: 'Dark Mode Theme', subtitle: 'A focused midnight canvas', cost: 15, icon: 'moon', owned: false, equipped: false },
  { id: 'neon', title: 'Neon Cyberpunk Palette', subtitle: 'Electric energy for study sessions', cost: 30, icon: 'zap', owned: false, equipped: false },
  { id: 'brilliant', title: 'Brilliant Student', subtitle: 'Profile badge', cost: 10, icon: 'award', owned: false, equipped: false },
  { id: 'professor', title: 'Supreme Professor', subtitle: 'Profile badge', cost: 25, icon: 'star', owned: false, equipped: false },
];

const defaultState = { level: null as Level | null, wallet: 24, streak: 4, quizzes: [] as QuizRecord[], shop: starterShop };
const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<Level | null>(defaultState.level);
  const [wallet, setWallet] = useState(defaultState.wallet);
  const [streak] = useState(defaultState.streak);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>(defaultState.quizzes);
  const [shop, setShop] = useState<ShopItem[]>(starterShop);

  useEffect(() => {
    AsyncStorage.getItem('eduai-state').then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<typeof defaultState>;
      setLevel(saved.level ?? null); setWallet(saved.wallet ?? 24); setQuizzes(saved.quizzes ?? []);
      setShop(saved.shop?.length ? saved.shop : starterShop);
    });
  }, []);
  useEffect(() => { AsyncStorage.setItem('eduai-state', JSON.stringify({ level, wallet, quizzes, shop })); }, [level, wallet, quizzes, shop]);

  const value = useMemo<AppState>(() => ({
    level: level ?? 'Liceo Scientifico',
    wallet, streak, quizzes, shop,
    completeOnboarding: (next) => setLevel(next),
    addQuiz: (record) => {
      setQuizzes((items) => [record, ...items]);
      if (record.passed) setWallet((value) => value + record.score);
    },
    buyItem: (id) => { const item = shop.find((entry) => entry.id === id); if (!item || item.owned || wallet < item.cost) return; setWallet((value) => value - item.cost); setShop((items) => items.map((entry) => entry.id === id ? { ...entry, owned: true } : entry)); },
    equipItem: (id) => setShop((items) => items.map((item) => ({ ...item, equipped: item.id === id ? true : item.equipped }))),
  }), [level, wallet, streak, quizzes, shop]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}