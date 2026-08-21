import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, PrimaryButton, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreLabel(score: number): string {
  if (score >= 1) return 'Corretto';
  if (score >= 0.5) return 'Parziale';
  return 'Errato';
}

function scoreColor(score: number, c: ReturnType<typeof useColors>) {
  if (score >= 1) return c.primary;
  if (score >= 0.5) return c.accent;
  return c.destructive;
}

function groupByTopic<T extends { topic: string }>(items: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    (groups[item.topic] ??= []).push(item);
  }
  return groups;
}

// ── Types re-used from AppContext ─────────────────────────────────────────────
type LabExercise = ReturnType<typeof useApp>['labExercises'][number];
type LabAttemptHistory = ReturnType<typeof useApp>['labAttempts'][number];

type ViewMode = 'list' | 'exercise' | 'result' | 'history';

export default function LabsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const {
    labExercises,
    labAttempts,
    materials,
    labsEnabled,
    hasLabsByDefault,
    submitLabAttempt,
    enableLabs,
    labsLoading,
    generateLabsForMaterials,
    deleteLabExercise,
  } = useApp();

  const [view, setView] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<LabExercise | null>(null);
  const [ftAnswer, setFtAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; feedback: string; solution?: string; earnedPoints: number; totalPoints: number } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [enablingLabs, setEnablingLabs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const readyMaterials = materials.filter((material) => material.isStudyReady);
  const analyzingMaterials = materials.filter((material) => material.extractionStatus === 'pending' || material.extractionStatus === 'processing');

  // ── labs not enabled + not STEM ──────────────────────────────────────────
  if (!hasLabsByDefault && !labsEnabled) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: c.background, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: c.accent }]}>
          <AppIcon name="flask" size={28} color={c.accentForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.foreground }]}>Laboratori facoltativi</Text>
        <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>
          Il tuo percorso non include i laboratori di default, ma puoi attivarli per praticare esercizi extra.
        </Text>
        <Pressable
          disabled={enablingLabs}
          onPress={() => {
            setEnablingLabs(true);
            void enableLabs(true).then(() => setEnablingLabs(false));
          }}
          style={({ pressed }) => [styles.enableButton, { backgroundColor: c.primary, opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={[styles.enableButtonText, { color: c.primaryForeground }]}>
            {enablingLabs ? 'Attivazione…' : 'Attiva laboratori'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (labsLoading) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>Caricamento esercizi…</Text>
      </View>
    );
  }

  if (materials.length === 0 || (readyMaterials.length === 0 && labExercises.length === 0)) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: c.background, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: c.accent }]}>
          <AppIcon name="flask" size={28} color={c.accentForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.foreground }]}>Laboratori dai tuoi materiali</Text>
        <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>
          {materials.length === 0
            ? 'Carica almeno un materiale nella Libreria per creare il tuo laboratorio.'
            : `Stiamo ancora analizzando ${analyzingMaterials.length} ${analyzingMaterials.length === 1 ? 'materiale' : 'materiali'}.`}
        </Text>
        {readyMaterials.length > 0 ? (
          <Pressable
            disabled={generating}
            onPress={() => {
              setGenerating(true);
              void generateLabsForMaterials().then((result) => {
                setGenerating(false);
                setGenerationMessage(result.ok
                  ? result.created
                    ? `${result.created} esercizi pratici creati usando ${result.materialCount} materiali.`
                    : 'I laboratori per questi materiali sono già disponibili.'
                  : result.message);
              });
            }}
            style={[styles.enableButton, { backgroundColor: c.primary, opacity: generating ? 0.6 : 1 }]}
          >
            <Text style={[styles.enableButtonText, { color: c.primaryForeground }]}>
              {generating ? 'Creazione in corso…' : `Crea laboratorio · ${readyMaterials.length} materiali`}
            </Text>
          </Pressable>
        ) : null}
        {generationMessage ? <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>{generationMessage}</Text> : null}
      </View>
    );
  }

  // ── exercise view ─────────────────────────────────────────────────────────
  if (view === 'exercise' && selected) {
    const canSubmit = ftAnswer.trim().length >= 1;

    const handleSubmit = async () => {
      if (!canSubmit || submitting) return;
      setSubmitting(true);
      const res = await submitLabAttempt(selected.id, ftAnswer.trim());
      setSubmitting(false);
      if (res.ok) {
        setResult(res.result);
        setView('result');
      } else {
        setErrorModal(res.message);
      }
    };

    return (
      <>
        <ScrollView
          style={{ backgroundColor: c.background }}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
            <Pressable onPress={() => { setView('list'); setFtAnswer(''); }} style={styles.backRow}>
            <AppIcon name="chevron-right" size={13} color={c.mutedForeground} />
            <Text style={[styles.backText, { color: c.mutedForeground }]}>
              {selected.topic}
            </Text>
          </Pressable>

          <View style={[styles.exerciseHeader, { backgroundColor: c.primary }]}>
            <Text style={[styles.exerciseSubject, { color: c.primaryForeground }]}>{selected.subject}</Text>
            <Text style={[styles.exerciseTitle, { color: c.primaryForeground }]}>{selected.title}</Text>
            <View style={styles.exerciseMeta}>
              <Pill>{selected.difficultyLevel}</Pill>
              <Text style={[styles.exercisePoints, { color: c.primaryForeground }]}>{selected.points} pt</Text>
            </View>
          </View>

          <View style={[styles.promptCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.prompt, { color: c.foreground }]}>{selected.prompt}</Text>
          </View>

          <View style={[styles.workCard, { backgroundColor: c.accent, borderColor: c.border }]}>
            <Text style={[styles.workLabel, { color: c.accentForeground }]}>SVOLGIMENTO PRATICO</Text>
            <Text style={[styles.workHint, { color: c.accentForeground }]}>
              Scrivi formule, passaggi, calcoli, pseudocodice o il risultato finale. Non serve una risposta teorica.
            </Text>
          </View>
          <TextInput
            testID="lab-free-text"
            value={ftAnswer}
            onChangeText={setFtAnswer}
            placeholder="Inserisci qui il procedimento e la soluzione…"
            placeholderTextColor={c.mutedForeground}
            multiline
            textAlignVertical="top"
            style={[styles.ftInput, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]}
          />

          <PrimaryButton
            onPress={() => { void handleSubmit(); }}
            disabled={!canSubmit || submitting}
            icon="circle-check"
          >
            {submitting ? 'Valutazione…' : 'Consegna risposta'}
          </PrimaryButton>
        </ScrollView>

        <AppModal
          visible={Boolean(errorModal)}
          title="Consegna non riuscita"
          message={errorModal ?? undefined}
          icon="warning"
          onDismiss={() => setErrorModal(null)}
          actions={[{ label: 'Riprova', variant: 'primaria', onPress: () => setErrorModal(null) }]}
        />
      </>
    );
  }

  // ── result view ───────────────────────────────────────────────────────────
  if (view === 'result' && selected && result) {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: scoreColor(result.score, c) }]}>
          <View style={[styles.resultIconWrap, { backgroundColor: scoreColor(result.score, c) }]}>
            <AppIcon name={result.score >= 1 ? 'circle-check' : result.score >= 0.5 ? 'info' : 'warning'} size={24} color={c.primaryForeground} />
          </View>
          <Text style={[styles.resultLabel, { color: scoreColor(result.score, c) }]}>{scoreLabel(result.score).toUpperCase()}</Text>
          <Text style={[styles.resultPoints, { color: c.foreground }]}>+{result.earnedPoints} / {result.totalPoints} pt</Text>
        </View>

        <View style={[styles.feedbackCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.feedbackTitle, { color: c.primary }]}>SPIEGAZIONE</Text>
          <Text style={[styles.feedbackText, { color: c.foreground }]}>{result.feedback}</Text>
        </View>
        {result.score < 1 && result.solution ? (
          <View style={[styles.feedbackCard, { backgroundColor: c.accent, borderColor: c.primary }]}>
            <Text style={[styles.feedbackTitle, { color: c.accentForeground }]}>SOLUZIONE CORRETTA</Text>
            <Text style={[styles.feedbackText, { color: c.accentForeground }]}>{result.solution}</Text>
          </View>
        ) : null}

         <PrimaryButton onPress={() => { setView('list'); setSelected(null); setResult(null); setFtAnswer(''); }} icon="flask">
          Torna agli esercizi
        </PrimaryButton>
      </ScrollView>
    );
  }

  // ── history view ──────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => setView('list')} style={styles.backRow}>
          <AppIcon name="chevron-right" size={13} color={c.mutedForeground} />
          <Text style={[styles.backText, { color: c.mutedForeground }]}>Lista esercizi</Text>
        </Pressable>
        <SectionTitle eyebrow="STORICO" title="I tuoi tentativi" />
        {labAttempts.length === 0 ? (
          <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>Nessun tentativo ancora.</Text>
        ) : (
          labAttempts.map((attempt: LabAttemptHistory) => (
            <View key={attempt.id} style={[styles.historyItem, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyTitle, { color: c.foreground }]} numberOfLines={1}>{attempt.exerciseTitle}</Text>
                <Text style={[styles.historyMeta, { color: c.mutedForeground }]}>{attempt.exerciseSubject} · {attempt.exerciseTopic}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.historyScore, { color: scoreColor(attempt.score, c) }]}>{scoreLabel(attempt.score)}</Text>
                <Text style={[styles.historyMeta, { color: c.mutedForeground }]}>+{attempt.earnedPoints} pt</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  // ── list view ─────────────────────────────────────────────────────────────
  const grouped = groupByTopic(labExercises);
  const topics = Object.keys(grouped).sort();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: c.primary }]}>LABORATORI</Text>
          <Text style={[styles.heading, { color: c.foreground }]}>Esercitati</Text>
        </View>
        <Pressable
          onPress={() => setView('history')}
          style={[styles.historyButton, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <AppIcon name="clock" size={14} color={c.mutedForeground} />
          <Text style={[styles.historyButtonText, { color: c.mutedForeground }]}>Storico</Text>
        </Pressable>
        <Pressable
          testID="rigenera-laboratori"
          disabled={generating}
          onPress={() => {
            setGenerating(true);
            void generateLabsForMaterials(true).then((next) => {
              setGenerating(false);
              if (!next.ok) setErrorModal(next.message);
              else setGenerationMessage(`${next.created ?? 0} nuovi esercizi pratici generati.`);
            });
          }}
          style={[styles.historyButton, { backgroundColor: c.accent, borderColor: c.border, opacity: generating ? 0.55 : 1 }]}
        >
          <AppIcon name="sparkles" size={14} color={c.accentForeground} />
          <Text style={[styles.historyButtonText, { color: c.accentForeground }]}>{generating ? 'Generazione…' : 'Rigenera'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.intro, { color: c.mutedForeground }]}>
        Esercizi pratici sul tuo percorso di studi. Ogni risposta corretta ti porta punti wallet.
      </Text>

      {topics.length === 0 ? (
        <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>Nessun esercizio disponibile per questo percorso.</Text>
      ) : (
        topics.map((topic) => (
          <View key={topic}>
            <SectionTitle eyebrow="ARGOMENTO" title={topic} />
            {(grouped[topic] ?? []).map((ex) => (
              <Pressable
                key={ex.id}
                testID={`lab-exercise-${ex.id}`}
                onPress={() => {
                  setSelected(ex);
                  setFtAnswer('');
                  setResult(null);
                  setView('exercise');
                }}
                style={({ pressed }) => [
                  styles.exerciseItem,
                  { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.76 : 1 },
                ]}
              >
                <View style={[styles.exerciseItemIcon, { backgroundColor: c.accent }]}>
                  <AppIcon name="flask" size={16} color={c.accentForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exerciseItemTitle, { color: c.foreground }]}>{ex.title}</Text>
                  <View style={styles.exerciseItemMeta}>
                    <Text style={[styles.small, { color: c.mutedForeground }]}>
                      Soluzione scritta · {ex.difficultyLevel}
                    </Text>
                    <View style={styles.exerciseItemPoints}>
                      <AppIcon name="zap" size={10} color={c.primary} />
                      <Text style={[styles.small, { color: c.primary }]}>{ex.points} pt</Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel={`Elimina ${ex.title}`}
                  hitSlop={10}
                  onPress={() => Alert.alert(
                    'Eliminare il laboratorio?',
                    'Il laboratorio e i suoi tentativi verranno eliminati definitivamente.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      {
                        text: 'Elimina',
                        style: 'destructive',
                        onPress: () => {
                          void deleteLabExercise(ex.id).then((deleted) => {
                            if (!deleted.ok) setErrorModal(deleted.message);
                          });
                        },
                      },
                    ],
                  )}
                >
                  <AppIcon name="trash" size={15} color={c.destructive} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ))
      )}
      {labAttempts.some((attempt) => attempt.score < 1) ? (
        <View>
          <SectionTitle eyebrow="DA RIPASSARE" title="Laboratori non passati" />
          {labAttempts.filter((attempt) => attempt.score < 1).slice(0, 10).map((attempt) => (
            <View key={`failed-${attempt.id}`} style={[styles.historyItem, { backgroundColor: c.card, borderColor: c.destructive }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyTitle, { color: c.foreground }]} numberOfLines={1}>{attempt.exerciseTitle}</Text>
                <Text style={[styles.historyMeta, { color: c.mutedForeground }]}>
                  {attempt.exerciseTopic} · {scoreLabel(attempt.score)}
                </Text>
              </View>
              <Text style={[styles.historyScore, { color: c.destructive }]}>+{attempt.earnedPoints} pt</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 5 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, maxWidth: 330 },
  historyButton: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', gap: 6, alignItems: 'center' },
  historyButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  exerciseItem: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  exerciseItemIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  exerciseItemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 5 },
  exerciseItemMeta: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  exerciseItemPoints: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  // Exercise view
  backRow: { flexDirection: 'row', gap: 6, alignItems: 'center', transform: [{ scaleX: -1 }] },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, transform: [{ scaleX: -1 }] },
  exerciseHeader: { borderRadius: 22, padding: 19, gap: 8 },
  exerciseSubject: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, opacity: 0.8 },
  exerciseTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, lineHeight: 27 },
  exerciseMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  exercisePoints: { fontFamily: 'Inter_700Bold', fontSize: 13, opacity: 0.85 },
  promptCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  prompt: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  workCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  workLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  workHint: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  ftInput: { borderWidth: 1, borderRadius: 16, minHeight: 130, padding: 14, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21 },
  // Result view
  resultCard: { borderRadius: 22, borderWidth: 2, padding: 22, alignItems: 'center', gap: 10 },
  resultIconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  resultLabel: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 1.2 },
  resultPoints: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  feedbackCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  feedbackTitle: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 },
  feedbackText: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21 },
  // History view
  historyItem: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  historyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
  historyMeta: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  historyScore: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  // Empty / enable state
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 16 },
  emptyIcon: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  emptyBody: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  enableButton: { borderRadius: 18, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  enableButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});
