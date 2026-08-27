import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { IconButton, PrimaryButton } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import type { StartQuizResult, StudyFlashcard } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuizPhase =
  | 'setup'          // verifica config panel
  | 'flashcardLoad'  // fetching server flashcards
  | 'flashcardError' // server flashcards failed / not ready
  | 'flashcard'      // flashcard interactive mode
  | 'loading'        // fetching server questions
  | 'recoveryError'  // recovery questions could not be prepared
  | 'quiz'           // active quiz
  | 'submitting'     // completing quiz on server
  | 'result';        // finish screen

type MCQuestion = {
  question: string;
  options: string[];
  // NO correctIndex — that stays on the server
};

type FlashCard = StudyFlashcard;
type ExplanationModal = { title: string; message: string; icon: 'book-open' | 'warning' | 'zap' } | null;

// ─── Duration options ─────────────────────────────────────────────────────────

type DurationOption = { label: string; seconds: number | null };

const DURATION_OPTIONS: DurationOption[] = [
  { label: 'Nessun limite', seconds: null },
  { label: '5 min', seconds: 5 * 60 },
  { label: '15 min', seconds: 15 * 60 },
  { label: '30 min', seconds: 30 * 60 },
];

const COUNT_OPTIONS = [10, 20, 30] as const;

const LEVEL_LABELS: Record<string, string> = {
  elementare: 'elementare',
  medie: 'medie',
  superiori: 'superiori',
  universita: 'universitario',
  professionale: 'professionale',
};

// ─── Points computation ───────────────────────────────────────────────────────

function computePercentage(correct: number, total: number): number {
  return Math.round((correct / Math.max(total, 1)) * 100);
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ProgressBar({ current, total, color }: { current: number; total: number; color: string }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={progressStyles.track}>
      <View style={[progressStyles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: '#213650', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuizScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ materialIds?: string; mode?: string; title?: string }>();
  const {
    materials,
    level,
    wallet,
    completionAnimation,
    startQuizSession,
    startRecoverySession,
    completeQuizSession,
    getQuickExplanation,
    generateFlashcards,
  } = useApp();

  const rawIds = Array.isArray(params.materialIds) ? params.materialIds[0] : params.materialIds;
  const ids = rawIds?.split(',').filter(Boolean) ?? [];
  const selectedMaterials = materials.filter((m) => ids.includes(m.id));
  const materialNames = selectedMaterials.map((m) => m.name.replace(/\.[^/.]+$/, '').trim());
  const mode = params.mode === 'flashcard' ? 'flashcard' : params.mode === 'recovery' ? 'recovery' : 'verifica';
  const titleParam = Array.isArray(params.title) ? params.title[0] : params.title;
  const quizTitle = titleParam ?? (materialNames.length ? materialNames[0] : 'Pacchetto di studio');

  const levelLabel = level ? (LEVEL_LABELS[level] ?? level) : 'base';

  // ─── Phase state ────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<QuizPhase>(
    mode === 'flashcard' ? 'flashcardLoad' : mode === 'recovery' ? 'loading' : 'setup',
  );

  // ─── Setup panel state ───────────────────────────────────────────────────────

  const [selectedCount, setSelectedCount] = useState<10 | 20 | 30>(10);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(DURATION_OPTIONS[0]!);

  // ─── Flashcard state ─────────────────────────────────────────────────────────

  const [flashcards, setFlashcards] = useState<FlashCard[]>([]);
  const [fcIndex, setFcIndex] = useState(0);
  const [fcRevealed, setFcRevealed] = useState(false);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const flashcardsRequestedRef = useRef(false);

  // ─── Quiz session state ──────────────────────────────────────────────────────

  // Server-issued session data
  const [activeSession, setActiveSession] = useState<StartQuizResult | null>(null);
  const [questions, setQuestions] = useState<MCQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);

  // Stable idempotency key for this quiz attempt — generated once at start
  const idempotencyKeyRef = useRef<string>('');

  // ─── Timer state ─────────────────────────────────────────────────────────────

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Result display data ──────────────────────────────────────────────────────

  const displayRef = useRef<{
    correct: number;
    total: number;
    percentage: number;
    passed: boolean;
    earnedPoints: number;
  } | null>(null);

  // ─── Submit tracking ──────────────────────────────────────────────────────────

  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitRetrying, setSubmitRetrying] = useState(false);

  // ─── Loading error state ─────────────────────────────────────────────────────

  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const recoveryRequestedRef = useRef(false);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationModal, setExplanationModal] = useState<ExplanationModal>(null);

  // ─── finishQuiz — calls server to score and complete ─────────────────────────

  const finishQuiz = useCallback(
    async (answersSnapshot: (number | null)[], session: StartQuizResult) => {
      if (submittingRef.current) return;
      submittingRef.current = true;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setPhase('submitting');
      setSubmitError(null);

      const result = await completeQuizSession(
        session.sessionId,
        answersSnapshot,
        idempotencyKeyRef.current,
      );

      if (!result.ok) {
        submittingRef.current = false;
        setSubmitError(result.message);
        setPhase('quiz'); // return to quiz phase so user can retry
        return;
      }

      const { attempt } = result;
      const correct = attempt.score;
      const total = attempt.totalQuestions;
      const percentage = computePercentage(correct, total);
      const passed = percentage >= 60;
      const earnedPoints = attempt.earnedCoins ?? correct * 5;

      displayRef.current = { correct, total, percentage, passed, earnedPoints };
      setPhase('result');
    },
    [completeQuizSession],
  );

  // ─── Flashcard loading ────────────────────────────────────────────────────────

  const loadFlashcards = useCallback(async () => {
    if (ids.length === 0) {
      setFlashcardError('Nessun materiale selezionato per le flashcard.');
      setPhase('flashcardError');
      return;
    }
    setFlashcardError(null);
    setPhase('flashcardLoad');
    const result = await generateFlashcards(ids);
    if (!result.ok) {
      setFlashcardError(result.message);
      setPhase('flashcardError');
      return;
    }
    if (result.flashcards.length === 0) {
      setFlashcardError('Nessuna flashcard è stata generata dai materiali selezionati.');
      setPhase('flashcardError');
      return;
    }
    setFlashcards(result.flashcards);
    setFcIndex(0);
    setFcRevealed(false);
    setPhase('flashcard');
  }, [generateFlashcards, ids]);

  const loadRecoverySession = useCallback(async () => {
    setRecoveryError(null);
    setPhase('loading');
    submittingRef.current = false;
    idempotencyKeyRef.current = `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const result = await startRecoverySession();
    if (!result.ok) {
      setRecoveryError(result.message);
      setPhase('recoveryError');
      return;
    }

    const { session } = result;
    if (!session.questions.length) {
      setRecoveryError('Non ci sono domande da recuperare in questo momento.');
      setPhase('recoveryError');
      return;
    }
    setActiveSession(session);
    setQuestions(session.questions);
    setSelectedAnswers(new Array(session.questions.length).fill(null));
    setCurrentQ(0);
    setSubmitError(null);
    setTimeLeft(null);
    setPhase('quiz');
  }, [startRecoverySession]);

  // Fetch server flashcards once when entering flashcard mode.
  useEffect(() => {
    if (mode !== 'flashcard' || flashcardsRequestedRef.current) return;
    flashcardsRequestedRef.current = true;
    void loadFlashcards();
  }, [mode, loadFlashcards]);

  useEffect(() => {
    if (mode !== 'recovery' || recoveryRequestedRef.current) return;
    recoveryRequestedRef.current = true;
    void loadRecoverySession();
  }, [mode, loadRecoverySession]);

  // ─── Timer effect ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'quiz' || timeLeft === null || !activeSession) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          // auto-finish: gather current answers
          setSelectedAnswers((ans) => {
            void finishQuiz(ans, activeSession);
            return ans;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, timeLeft === null, finishQuiz, activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const close = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/library');
  };

  const startQuiz = async () => {
    if (ids.length === 0) return;

    setLoadError(null);
    setPhase('loading');
    submittingRef.current = false;
    displayRef.current = null;

    // Generate stable idempotency key for this attempt
    idempotencyKeyRef.current = `quiz-${ids.join('-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const result = await startQuizSession(ids, selectedCount);

    if (!result.ok) {
      setLoadError(result.message);
      setPhase('setup');
      return;
    }

    const { session } = result;
    setActiveSession(session);
    setQuestions(session.questions);
    setSelectedAnswers(new Array(selectedCount).fill(null));
    setCurrentQ(0);
    setSubmitError(null);
    setTimeLeft(selectedDuration.seconds);
    setPhase('quiz');
  };

  const selectAnswer = (qIndex: number, optionIndex: number) => {
    if (phase !== 'quiz') return;
    setSelectedAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = optionIndex;
      return next;
    });
  };

  const goNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((prev) => prev + 1);
    } else {
      // last question — finish
      if (!activeSession) return;
      setSelectedAnswers((ans) => {
        void finishQuiz(ans, activeSession);
        return ans;
      });
    }
  };

  const retrySubmit = async () => {
    if (!activeSession || submittingRef.current) return;
    submittingRef.current = false; // allow retry
    setSubmitRetrying(true);
    setSubmitError(null);
    await finishQuiz(selectedAnswers, activeSession);
    setSubmitRetrying(false);
  };

  const retry = () => {
    submittingRef.current = false;
    displayRef.current = null;
    setSubmitError(null);
    setSubmitRetrying(false);
    setActiveSession(null);
    setLoadError(null);
    if (mode === 'flashcard') {
      setFcIndex(0);
      setFcRevealed(false);
      void loadFlashcards();
    } else if (mode === 'recovery') {
      void loadRecoverySession();
    } else {
      setPhase('setup');
    }
  };

  const requestQuickExplanation = async () => {
    if (!activeSession || explanationLoading) return;
    setExplanationLoading(true);
    const result = await getQuickExplanation(activeSession.sessionId, currentQ);
    setExplanationLoading(false);
    if (result.ok) {
      setExplanationModal({
        title: result.chargedPoints > 0 ? 'Spiegazione rapida' : 'Spiegazione già sbloccata',
        message: `${result.explanation}${result.chargedPoints > 0 ? `\n\nSono stati usati ${result.chargedPoints} punti. Saldo aggiornato: ${Math.max(0, wallet - result.chargedPoints)} punti.` : '\n\nNon sono stati scalati altri punti.'}`,
        icon: 'book-open',
      });
      return;
    }
    const insufficientPoints = /punti|saldo|credito/i.test(result.message);
    setExplanationModal({
      title: insufficientPoints ? 'Punti insufficienti' : 'Spiegazione non disponibile',
      message: insufficientPoints
        ? `${result.message} Ti servono 2 punti per sbloccare una spiegazione rapida.`
        : result.message,
      icon: insufficientPoints ? 'zap' : 'warning',
    });
  };

  const goLibrary = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    router.replace('/(tabs)/library');
  };

  // ─── Format time ──────────────────────────────────────────────────────────────

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Renders ──────────────────────────────────────────────────────────────────

  // FLASHCARD LOADING PHASE
  if (phase === 'flashcardLoad') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
      >
        <View style={styles.top}><IconButton name="close" label="Chiudi" onPress={close} /></View>
        <View style={[styles.iconLarge, { backgroundColor: c.accent }]}>
          <AppIcon name="flashcards" size={26} color={c.accentForeground} />
        </View>
        <Text style={[styles.kicker, { color: c.primary }]}>FLASHCARD</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>Prepariamo il tuo ripasso</Text>
        <View style={[styles.loadingCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <ActivityIndicator size="small" color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.setupCardTitle, { color: c.foreground }]}>Analisi dei materiali in corso</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]}>Le flashcard stanno prendendo forma. Puoi attendere qui senza bloccare il resto dell’app.</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // FLASHCARD ERROR PHASE
  if (phase === 'flashcardError') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={close} />
        </View>

        <View style={[styles.resultIconWrap, { backgroundColor: c.secondary }]}>
          <AppIcon name="warning" size={30} color={c.destructive} />
        </View>
        <Text style={[styles.kicker, { color: c.destructive }]}>FLASHCARD NON DISPONIBILI</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>Impossibile generare le flashcard</Text>

        <View style={[styles.saveErrorBanner, { backgroundColor: c.secondary, borderColor: c.destructive }]}>
          <AppIcon name="warning" size={15} color={c.destructive} />
          <Text style={[styles.saveErrorText, { color: c.destructive }]}>
            {flashcardError ?? 'Si è verificato un errore imprevisto.'}
          </Text>
        </View>

        <View testID="flashcard-retry">
          <PrimaryButton onPress={() => { void loadFlashcards(); }} icon="arrow-up-right">
            Riprova
          </PrimaryButton>
        </View>

        <Pressable
          testID="flashcard-error-back"
          onPress={goLibrary}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.secondary, marginTop: 4, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: c.secondaryForeground }]}>
            Torna alla libreria
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // FLASHCARD PHASE
  if (phase === 'flashcard') {
    const card = flashcards[fcIndex];
    if (!card) return null;
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={close} />
          <Text style={[styles.counter, { color: c.mutedForeground }]}>
            {fcIndex + 1} / {flashcards.length}
          </Text>
        </View>

        <View style={[styles.fcKickerRow]}>
          <View style={[styles.iconSmall, { backgroundColor: c.accent }]}>
            <AppIcon name="flashcards" size={20} color={c.accentForeground} />
          </View>
          <Text style={[styles.kicker, { color: c.primary }]}>FLASHCARD</Text>
        </View>

        <ProgressBar current={fcIndex + 1} total={flashcards.length} color={c.primary} />

        <Pressable
          testID="flashcard-tap"
          onPress={() => setFcRevealed((v) => !v)}
          style={({ pressed }) => [
            styles.fcCard,
            { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.fcSide}>
            <Text style={[styles.fcSideLabel, { color: c.mutedForeground }]}>
              {fcRevealed ? 'RISPOSTA' : 'DOMANDA'}
            </Text>
            <Text style={[styles.fcText, { color: c.foreground }]}>
              {fcRevealed ? card.back : card.front}
            </Text>
            {!fcRevealed && (
              <View style={[styles.fcHint, { backgroundColor: c.accent }]}>
                <AppIcon name="eye" size={13} color={c.accentForeground} />
                <Text style={[styles.fcHintText, { color: c.accentForeground }]}>
                  Tocca per rivelare
                </Text>
              </View>
            )}
          </View>
        </Pressable>

        <View style={styles.fcNav}>
          <Pressable
            testID="flashcard-prev"
            onPress={() => { setFcIndex((i) => Math.max(0, i - 1)); setFcRevealed(false); }}
            disabled={fcIndex === 0}
            style={({ pressed }) => [
              styles.fcNavBtn,
              { backgroundColor: c.card, borderColor: c.border, opacity: fcIndex === 0 ? 0.35 : pressed ? 0.7 : 1 },
            ]}
          >
            <AppIcon name="chevron-right" size={16} color={c.foreground} />
            <Text style={[styles.fcNavText, { color: c.foreground }]}>Precedente</Text>
          </Pressable>

          <Pressable
            testID="flashcard-next"
            onPress={() => { setFcIndex((i) => Math.min(flashcards.length - 1, i + 1)); setFcRevealed(false); }}
            disabled={fcIndex === flashcards.length - 1}
            style={({ pressed }) => [
              styles.fcNavBtn,
              styles.fcNavBtnRight,
              {
                backgroundColor: fcIndex === flashcards.length - 1 ? c.muted : c.primary,
                borderColor: c.border,
                opacity: fcIndex === flashcards.length - 1 ? 0.35 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.fcNavText, { color: fcIndex === flashcards.length - 1 ? c.mutedForeground : c.primaryForeground }]}>
              Successiva
            </Text>
            <AppIcon
              name="chevron-right"
              size={16}
              color={fcIndex === flashcards.length - 1 ? c.mutedForeground : c.primaryForeground}
            />
          </Pressable>
        </View>

        <Pressable
          testID="flashcard-done"
          onPress={goLibrary}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: c.secondaryForeground }]}>
            Torna alla libreria
          </Text>
        </Pressable>
        <Pressable
          testID="flashcard-regenerate"
          onPress={() => { void loadFlashcards(); }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: c.accentForeground }]}>Rigenera flashcard</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // LOADING PHASE
  if (phase === 'loading') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
      >
        <View style={styles.top}><IconButton name="close" label="Chiudi" onPress={goLibrary} /></View>
        <View style={[styles.iconLarge, { backgroundColor: c.accent }]}>
          <AppIcon name={mode === 'recovery' ? 'book-open' : 'question'} size={26} color={c.accentForeground} />
        </View>
        <Text style={[styles.kicker, { color: c.primary }]}>{mode === 'recovery' ? 'RECUPERO ERRORI' : 'VERIFICA'}</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>
          {mode === 'recovery' ? 'Prepariamo il tuo ripasso' : 'Costruiamo la verifica'}
        </Text>
        <View style={[styles.loadingCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <ActivityIndicator size="small" color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.setupCardTitle, { color: c.foreground }]}>Generazione in corso</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]}>Stiamo organizzando domande e contenuti dai tuoi materiali.</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (phase === 'recoveryError') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={goLibrary} />
        </View>
        <View style={[styles.resultIconWrap, { backgroundColor: c.secondary }]}>
          <AppIcon name="warning" size={30} color={c.destructive} />
        </View>
        <Text style={[styles.kicker, { color: c.destructive }]}>RECUPERO ERRORI</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>Ripasso non disponibile</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>
          {recoveryError ?? 'Non è stato possibile preparare il ripasso. Riprova tra poco.'}
        </Text>
        <PrimaryButton onPress={() => { void loadRecoverySession(); }} icon="arrow-up-right">
          Riprova
        </PrimaryButton>
        <Pressable
          onPress={goLibrary}
          style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: c.secondary, opacity: pressed ? 0.72 : 1 }]}
        >
          <Text style={[styles.secondaryBtnText, { color: c.secondaryForeground }]}>Torna alla libreria</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // SETUP PHASE
  if (phase === 'setup') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={close} />
        </View>

        <View style={[styles.iconLarge, { backgroundColor: c.accent }]}>
          <AppIcon name="question" size={26} color={c.accentForeground} />
        </View>
        <Text style={[styles.kicker, { color: c.primary }]}>VERIFICA UNIFICATA</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>Personalizza la tua verifica</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>
          {selectedMaterials.length
            ? `${selectedMaterials.length} ${selectedMaterials.length === 1 ? 'materiale selezionato' : 'materiali selezionati'} · livello ${levelLabel}`
            : 'Nessun materiale disponibile.'}
        </Text>

        {/* Load error */}
        {loadError !== null && (
          <View style={[styles.saveErrorBanner, { backgroundColor: c.secondary, borderColor: c.destructive }]}>
            <AppIcon name="warning" size={15} color={c.destructive} />
            <Text style={[styles.saveErrorText, { color: c.destructive }]}>{loadError}</Text>
          </View>
        )}

        {/* Number of questions */}
        <View style={[styles.setupCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.setupCardHeader}>
            <AppIcon name="question" size={15} color={c.primary} />
            <Text style={[styles.setupCardTitle, { color: c.foreground }]}>Numero di domande</Text>
          </View>
          <View style={styles.optionRow}>
            {COUNT_OPTIONS.map((n) => (
              <Pressable
                key={n}
                testID={`count-option-${n}`}
                onPress={() => setSelectedCount(n)}
                style={({ pressed }) => [
                  styles.optionChip,
                  {
                    backgroundColor: selectedCount === n ? c.primary : c.secondary,
                    borderColor: selectedCount === n ? c.primary : c.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    { color: selectedCount === n ? c.primaryForeground : c.secondaryForeground },
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Duration */}
        <View style={[styles.setupCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.setupCardHeader}>
            <AppIcon name="clock" size={15} color={c.primary} />
            <Text style={[styles.setupCardTitle, { color: c.foreground }]}>Durata</Text>
          </View>
          <View style={styles.durationGrid}>
            {DURATION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.label}
                testID={`duration-option-${opt.label}`}
                onPress={() => setSelectedDuration(opt)}
                style={({ pressed }) => [
                  styles.durationChip,
                  {
                    backgroundColor: selectedDuration.label === opt.label ? c.primary : c.secondary,
                    borderColor: selectedDuration.label === opt.label ? c.primary : c.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {opt.seconds === null ? (
                  <AppIcon
                    name="close"
                    size={13}
                    color={selectedDuration.label === opt.label ? c.primaryForeground : c.mutedForeground}
                  />
                ) : (
                  <AppIcon
                    name="clock"
                    size={13}
                    color={selectedDuration.label === opt.label ? c.primaryForeground : c.mutedForeground}
                  />
                )}
                <Text
                  style={[
                    styles.durationChipText,
                    {
                      color:
                        selectedDuration.label === opt.label
                          ? c.primaryForeground
                          : c.secondaryForeground,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Materials */}
        <View style={[styles.setupCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.setupCardHeader}>
            <AppIcon name="layers" size={15} color={c.primary} />
            <Text style={[styles.setupCardTitle, { color: c.foreground }]}>Materiali inclusi</Text>
          </View>
          {selectedMaterials.map((mat) => (
            <View key={mat.id} style={[styles.matRow, { borderTopColor: c.border }]}>
              <AppIcon
                name={
                  mat.kind === 'immagine'
                    ? 'image'
                    : mat.kind === 'video'
                    ? 'video'
                    : mat.kind === 'audio'
                    ? 'audio'
                    : 'file'
                }
                size={14}
                color={c.primary}
              />
              <Text style={[styles.matRowText, { color: c.foreground }]} numberOfLines={1}>
                {mat.name}
              </Text>
            </View>
          ))}
        </View>

        <View testID="start-quiz">
          <PrimaryButton
            onPress={() => { void startQuiz(); }}
            disabled={selectedMaterials.length === 0 || ids.length === 0}
            icon="arrow-up-right"
          >
            Inizia la verifica
          </PrimaryButton>
        </View>
      </ScrollView>
    );
  }

  // QUIZ PHASE
  if (phase === 'quiz' || phase === 'submitting') {
    const q = questions[currentQ];
    const chosen = selectedAnswers[currentQ];
    const isLast = currentQ === questions.length - 1;
    const isSubmitting = phase === 'submitting';

    if (!q) return null;

    return (
      <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={close} />
          {timeLeft !== null && phase === 'quiz' && (
            <View
              style={[
                styles.timerBadge,
                { backgroundColor: timeLeft < 60 ? c.destructive : c.accent },
              ]}
            >
              <AppIcon
                name="clock"
                size={13}
                color={timeLeft < 60 ? c.destructiveForeground : c.accentForeground}
              />
              <Text
                style={[
                  styles.timerText,
                  { color: timeLeft < 60 ? c.destructiveForeground : c.accentForeground },
                ]}
              >
                {formatTime(timeLeft)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: c.mutedForeground }]}>
            Domanda {currentQ + 1} di {questions.length}
          </Text>
        </View>
        <ProgressBar current={currentQ + 1} total={questions.length} color={c.primary} />

        <View style={[styles.questionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.questionLabel, { color: c.primary }]}>DOMANDA {currentQ + 1}</Text>
          <Text style={[styles.questionText, { color: c.foreground }]}>{q.question}</Text>
        </View>

        <Pressable
          testID="spiegazione-rapida"
          onPress={() => { void requestQuickExplanation(); }}
          disabled={isSubmitting || explanationLoading}
          style={({ pressed }) => [
            styles.explanationButton,
            { backgroundColor: c.accent, borderColor: c.primary, opacity: isSubmitting || explanationLoading ? 0.5 : pressed ? 0.76 : 1 },
          ]}
        >
          <View style={[styles.explanationIcon, { backgroundColor: c.primary }]}>
            <AppIcon name="book-open" size={15} color={c.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.explanationTitle, { color: c.accentForeground }]}>
              {explanationLoading ? 'Preparazione spiegazione…' : 'Spiegazione Rapida'}
            </Text>
            <Text style={[styles.explanationDetail, { color: c.accentForeground }]}>
              {explanationLoading ? 'Attendi un momento.' : `Costa 2 punti · Saldo: ${wallet} punti`}
            </Text>
          </View>
          <AppIcon name="chevron-right" size={15} color={c.accentForeground} />
        </Pressable>

        {/* Submit error banner shown in quiz phase */}
        {submitError !== null && phase === 'quiz' && (
          <View style={[styles.saveErrorBanner, { backgroundColor: c.secondary, borderColor: c.destructive }]}>
            <AppIcon name="warning" size={15} color={c.destructive} />
            <Text style={[styles.saveErrorText, { color: c.destructive }]}>
              {submitError}
            </Text>
            <Pressable
              testID="submit-retry"
              onPress={() => { void retrySubmit(); }}
              disabled={submitRetrying}
              style={({ pressed }) => [
                styles.saveRetryBtn,
                { backgroundColor: c.destructive, opacity: submitRetrying ? 0.5 : pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={[styles.saveRetryBtnText, { color: c.destructiveForeground }]}>
                {submitRetrying ? 'Invio…' : 'Riprova'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.optionsList}>
          {q.options.map((opt, idx) => {
            const isSelected = chosen === idx;
            // No correctIndex available client-side — only show selection state, no feedback
            let bg = c.secondary;
            let borderColor = c.border;
            let textColor = c.secondaryForeground;

            if (isSelected) {
              bg = c.accent;
              borderColor = c.primary;
              textColor = c.accentForeground;
            }

            return (
              <Pressable
                key={idx}
                testID={`answer-option-${idx}`}
                onPress={() => selectAnswer(currentQ, idx)}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.answerChip,
                  {
                    backgroundColor: bg,
                    borderColor,
                    opacity: isSubmitting ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.answerBullet,
                    {
                      backgroundColor: isSelected ? c.primary : c.muted,
                    },
                  ]}
                >
                  <Text style={[styles.answerBulletText, { color: c.primaryForeground }]}>
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <Text style={[styles.answerText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {phase === 'quiz' && (
          <View testID="next-question">
            <PrimaryButton
              onPress={goNext}
              icon={isLast ? 'circle-check' : 'chevron-right'}
              disabled={isLast && chosen === null}
            >
              {isLast
                ? chosen === null ? 'Consegna senza risposta' : 'Vedi i risultati'
                : chosen === null ? 'Salta domanda' : 'Prossima domanda'}
            </PrimaryButton>
          </View>
        )}

        {isSubmitting && (
          <View style={[styles.noticeBanner, { backgroundColor: c.accent }]}>
            <AppIcon name="clock" size={15} color={c.accentForeground} />
            <Text style={[styles.noticeText, { color: c.accentForeground }]}>
              Invio risultati in corso…
            </Text>
          </View>
        )}
      </ScrollView>
      <AppModal
        visible={Boolean(explanationModal)}
        title={explanationModal?.title ?? ''}
        message={explanationModal?.message}
        icon={explanationModal?.icon ?? 'info'}
        onDismiss={() => setExplanationModal(null)}
        actions={[{ label: 'Ho capito', variant: 'primaria', onPress: () => setExplanationModal(null) }]}
      />
      </>
    );
  }

  // RESULT PHASE
  if (phase === 'result' && displayRef.current) {
    const { correct, total, percentage, passed, earnedPoints } = displayRef.current;
    const wrong = total - correct;

    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <IconButton name="close" label="Chiudi" onPress={goLibrary} />
        </View>

        <View style={[styles.resultIconWrap, { backgroundColor: passed ? c.accent : c.secondary }]}>
          <AppIcon
            name={passed ? 'circle-check' : 'warning'}
            size={32}
            color={passed ? c.primary : c.destructive}
          />
        </View>
        {passed ? (
          <View style={[styles.noticeBanner, { backgroundColor: c.accent }]}>
            <AppIcon name={completionAnimation === 'anim_fire' ? 'flame' : completionAnimation === 'anim_stars' ? 'star' : 'sparkles'} size={18} color={c.accentForeground} />
            <Text style={[styles.noticeText, { color: c.accentForeground }]}>
              {completionAnimation === 'anim_fire'
                ? 'Fiamme del successo attivate!'
                : completionAnimation === 'anim_stars'
                  ? 'Pioggia di stelle completata!'
                  : completionAnimation === 'anim_crown'
                    ? 'Incoronazione completata!'
                    : 'Effetto completamento attivato!'}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.kicker, { color: passed ? c.primary : c.destructive }]}>
          {passed ? 'SUPERATO' : 'NON SUPERATO'}
        </Text>
        <Text style={[styles.heading, { color: c.foreground }]}>{quizTitle}</Text>

        {/* Percentage circle */}
        <View style={[styles.scoreBadge, { backgroundColor: c.card, borderColor: passed ? c.primary : c.destructive }]}>
          <Text style={[styles.scoreNumber, { color: passed ? c.primary : c.destructive }]}>{percentage}%</Text>
          <Text style={[styles.scoreLabel, { color: c.mutedForeground }]}>punteggio</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="circle-check" size={18} color={c.primary} />
            <Text style={[styles.statNumber, { color: c.primary }]}>{correct}</Text>
            <Text style={[styles.statLabel, { color: c.mutedForeground }]}>Corrette</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="close" size={18} color={c.destructive} />
            <Text style={[styles.statNumber, { color: c.destructive }]}>{wrong}</Text>
            <Text style={[styles.statLabel, { color: c.mutedForeground }]}>Sbagliate</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="zap" size={18} color={c.primary} />
            <Text style={[styles.statNumber, { color: c.primary }]}>+{earnedPoints}</Text>
            <Text style={[styles.statLabel, { color: c.mutedForeground }]}>Punti</Text>
          </View>
        </View>

        {/* Pass threshold notice */}
        <View style={[styles.noticeBanner, { backgroundColor: c.accent }]}>
          <AppIcon name="info" size={15} color={c.accentForeground} />
          <Text style={[styles.noticeText, { color: c.accentForeground }]}>
            {passed
              ? `Ottimo lavoro! Hai risposto correttamente al ${percentage}% delle domande. I tuoi ${earnedPoints} punti sono stati aggiunti al portafoglio.`
              : `Soglia di superamento: 60%. Hai ottenuto ${percentage}%. Riprova per migliorare il tuo punteggio.`}
          </Text>
        </View>

        <View testID="retry-quiz">
          <PrimaryButton onPress={retry} icon="arrow-up-right">
            Rigenera domande
          </PrimaryButton>
        </View>

        <Pressable
          testID="go-library"
          onPress={goLibrary}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.secondary, marginTop: 4, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: c.secondaryForeground }]}>
            Torna alla libreria
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Fallback (should not reach here)
  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { fontFamily: 'Inter_500Medium', fontSize: 13 },

  loadingContainer: { flex: 1, paddingHorizontal: 20, gap: 16, alignItems: 'center', justifyContent: 'center' },
  loadingCard: { borderWidth: 1, borderRadius: 18, padding: 17, flexDirection: 'row', gap: 13, alignItems: 'flex-start' },

  // Icon variants
  iconSmall: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconLarge: { width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 22 },

  fcKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginTop: 8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },

  // Flashcard
  fcCard: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 28,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  fcSide: { alignItems: 'center', gap: 18 },
  fcSideLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  fcText: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 26, textAlign: 'center' },
  fcHint: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, marginTop: 8 },
  fcHintText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  fcNav: { flexDirection: 'row', gap: 12 },
  fcNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  fcNavBtnRight: { borderWidth: 0 },
  fcNavText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },

  // Setup
  setupCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  setupCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 },
  setupCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  optionChipText: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  durationChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  matRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1 },
  matRowText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },

  // Quiz
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  questionCard: { borderWidth: 1, borderRadius: 20, padding: 22, gap: 9 },
  questionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 },
  questionText: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 26 },
  optionsList: { gap: 10 },
  answerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
  },
  answerBullet: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  answerBulletText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  answerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21 },
  explanationButton: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  explanationIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  explanationTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 2 },
  explanationDetail: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 15 },

  // Result
  resultIconWrap: { width: 80, height: 80, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  scoreBadge: { alignSelf: 'center', borderWidth: 2, borderRadius: 60, width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -1 },
  scoreLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 6 },
  statNumber: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },

  // Shared
  noticeBanner: { borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  secondaryBtn: { minHeight: 54, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },

  // Error banner
  saveErrorBanner: { borderWidth: 1.5, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  saveErrorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  saveRetryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  saveRetryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
