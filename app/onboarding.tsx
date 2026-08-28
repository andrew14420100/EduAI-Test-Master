import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { IconButton, PrimaryButton } from '@/components/Ui';
import { Level, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const levels: { group: string; items: Level[] }[] = [
  {
    group: 'Scuole superiori',
    items: [
      'Liceo Scientifico',
      'Liceo Classico',
      'Liceo Linguistico',
      'Liceo delle Scienze Umane',
      'Liceo Artistico',
      'Liceo Musicale',
      'Istituto Tecnico Tecnologico – Informatica',
      'Istituto Tecnico Tecnologico – Elettronica',
      'Istituto Tecnico Tecnologico – Meccanica',
      'Istituto Tecnico Economico – Amministrazione',
      'Istituto Tecnico Economico – Marketing',
      'Istituto Professionale – Alberghiero',
      'Istituto Professionale – Servizi Socio-Sanitari',
      'Istituto Professionale – Manutenzione',
    ],
  },
  {
    group: 'Università · Facoltà',
    items: [
      'Medicina e Chirurgia',
      'Professioni Sanitarie',
      'Ingegneria Informatica',
      'Ingegneria Meccanica',
      'Ingegneria Civile',
      'Ingegneria Gestionale',
      'Economia e Commercio',
      'Giurisprudenza',
      'Psicologia',
      'Lettere e Filosofia',
      'Scienze Matematiche, Fisiche e Naturali',
      'Scienze Politiche',
      'Architettura',
      'Lingue e Letterature Straniere',
    ],
  },
];

type InstitutionType = 'scuola_superiore' | 'universita' | 'altro';
type Step = 0 | 1 | 2;
type Draft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  selectedLevel: Level | null;
  institutionType: InstitutionType | null;
  institutionName: string;
  studyYear: string;
  studyAddress: string;
  learningGoals: string;
  studyInterests: string;
  examGoals: string;
};

const stepMeta: Array<{ eyebrow: string; title: string; description: string; icon: 'profile' | 'book-open' | 'sparkles' }> = [
  {
    eyebrow: 'Profilo personale',
    title: 'Partiamo da te',
    description: 'Così possiamo rendere il tuo spazio di studio davvero personale.',
    icon: 'profile',
  },
  {
    eyebrow: 'Percorso di studio',
    title: 'Dove stai studiando?',
    description: 'Scegli il percorso che useremo per adattare spiegazioni e verifiche.',
    icon: 'book-open',
  },
  {
    eyebrow: 'Preferenze',
    title: 'Cosa vuoi ottenere?',
    description: 'Queste risposte sono facoltative, ma aiutano EduAI a darti suggerimenti migliori.',
    icon: 'sparkles',
  },
];

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  c,
  multiline = false,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  c: ReturnType<typeof useColors>;
  multiline?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
        {required ? <Text style={[styles.required, { color: c.primary }]}>Obbligatorio</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: c.foreground, backgroundColor: c.card, borderColor: c.border },
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: c.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  c,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? c.accent : c.card,
          borderColor: selected ? c.primary : c.border,
          opacity: pressed ? 0.78 : disabled ? 0.58 : 1,
        },
      ]}
    >
      <Text style={[styles.choiceText, { color: c.foreground }]}>{label}</Text>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? c.primary : c.mutedForeground,
            backgroundColor: selected ? c.primary : 'transparent',
          },
        ]}
      >
        {selected ? <AppIcon name="check" size={11} color={c.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { learnerProfile, level, completeOnboarding } = useApp();
  const [step, setStep] = useState<Step>(0);
  const [firstName, setFirstName] = useState(learnerProfile?.firstName ?? '');
  const [lastName, setLastName] = useState(learnerProfile?.lastName ?? '');
  const [birthDate, setBirthDate] = useState(learnerProfile?.birthDate ?? '');
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(level ?? learnerProfile?.level ?? null);
  const [institutionType, setInstitutionType] = useState<InstitutionType | null>(
    learnerProfile?.institutionType === 'scuola_superiore'
    || learnerProfile?.institutionType === 'universita'
    || learnerProfile?.institutionType === 'altro'
      ? learnerProfile.institutionType
      : null,
  );
  const [institutionName, setInstitutionName] = useState(learnerProfile?.institutionName ?? '');
  const [studyYear, setStudyYear] = useState(learnerProfile?.studyYear ?? '');
  const [studyAddress, setStudyAddress] = useState(learnerProfile?.studyAddress ?? '');
  const [learningGoals, setLearningGoals] = useState(learnerProfile?.learningGoals ?? '');
  const [studyInterests, setStudyInterests] = useState(learnerProfile?.studyInterests ?? '');
  const [examGoals, setExamGoals] = useState(learnerProfile?.examGoals ?? '');
  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const draftKey = `eduai:onboarding-draft:${learnerProfile?.userId ?? 'pending'}`;
  const progress = useMemo(() => `${step + 1} di ${stepMeta.length}`, [step]);
  const current = stepMeta[step];

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(draftKey).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const draft = JSON.parse(raw) as Partial<Draft>;
          if (typeof draft.firstName === 'string') setFirstName(draft.firstName);
          if (typeof draft.lastName === 'string') setLastName(draft.lastName);
          if (typeof draft.birthDate === 'string') setBirthDate(draft.birthDate);
          if (typeof draft.selectedLevel === 'string') setSelectedLevel(draft.selectedLevel);
          if (draft.institutionType === 'scuola_superiore' || draft.institutionType === 'universita' || draft.institutionType === 'altro') {
            setInstitutionType(draft.institutionType);
          }
          if (typeof draft.institutionName === 'string') setInstitutionName(draft.institutionName);
          if (typeof draft.studyYear === 'string') setStudyYear(draft.studyYear);
          if (typeof draft.studyAddress === 'string') setStudyAddress(draft.studyAddress);
          if (typeof draft.learningGoals === 'string') setLearningGoals(draft.learningGoals);
          if (typeof draft.studyInterests === 'string') setStudyInterests(draft.studyInterests);
          if (typeof draft.examGoals === 'string') setExamGoals(draft.examGoals);
        } catch {
          void AsyncStorage.removeItem(draftKey);
        }
      }
      setDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft: Draft = {
      firstName,
      lastName,
      birthDate,
      selectedLevel,
      institutionType,
      institutionName,
      studyYear,
      studyAddress,
      learningGoals,
      studyInterests,
      examGoals,
    };
    void AsyncStorage.setItem(draftKey, JSON.stringify(draft));
  }, [
    draftLoaded,
    draftKey,
    firstName,
    lastName,
    birthDate,
    selectedLevel,
    institutionType,
    institutionName,
    studyYear,
    studyAddress,
    learningGoals,
    studyInterests,
    examGoals,
  ]);

  const validBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())
    && !Number.isNaN(new Date(`${birthDate.trim()}T00:00:00.000Z`).getTime());
  const hasRequiredStudyData = Boolean(
    selectedLevel
    && institutionType
    && institutionName.trim().length >= 2
    && studyYear.trim().length >= 1
    && studyAddress.trim().length >= 2,
  );

  const validateStep = () => {
    if (step === 0 && (firstName.trim().length < 2 || lastName.trim().length < 2 || !validBirthDate)) {
      setValidationMessage('Inserisci nome, cognome e una data valida nel formato AAAA-MM-GG.');
      return false;
    }
    if (step === 1 && !hasRequiredStudyData) {
      setValidationMessage('Completa percorso, tipo di istituto, nome, classe/anno e indirizzo di studi.');
      return false;
    }
    setValidationMessage(null);
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((currentStep) => Math.min(2, currentStep + 1) as Step);
  };

  const save = async () => {
    setValidationMessage(null);
    if (!hasRequiredStudyData) {
      setStep(1);
      setValidationMessage('Completa tutti i campi obbligatori del percorso.');
      return;
    }
    setSaving(true);
    const result = await completeOnboarding({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate.trim(),
      level: selectedLevel!,
      institutionType: institutionType!,
      institutionName: institutionName.trim(),
      studyYear: studyYear.trim(),
      studyAddress: studyAddress.trim(),
      learningGoals: learningGoals.trim(),
      studyInterests: studyInterests.trim(),
      examGoals: examGoals.trim(),
    });
    setSaving(false);
    if (result.ok) {
      await AsyncStorage.removeItem(draftKey);
      router.replace('/(tabs)');
    } else {
      setErrorMessage(result.message);
    }
  };

  const goBack = () => {
    setValidationMessage(null);
    if (step === 0) {
      if (level) router.back();
      return;
    }
    setStep((currentStep) => Math.max(0, currentStep - 1) as Step);
  };

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={76}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: c.primary }]}>
              <AppIcon name="graduation-cap" size={18} color={c.primaryForeground} />
            </View>
            <View>
              <Text style={[styles.brandName, { color: c.foreground }]}>EduAI</Text>
              <Text style={[styles.brandCaption, { color: c.mutedForeground }]}>IL TUO METODO DI STUDIO</Text>
            </View>
          </View>
          {level ? <IconButton name="close" label="Chiudi" onPress={() => router.back()} /> : null}
        </View>

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: c.primary }]}>CONFIGURIAMO IL TUO SPAZIO</Text>
          <Text style={[styles.progressCount, { color: c.mutedForeground }]}>{progress}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: c.secondary }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${((step + 1) / stepMeta.length) * 100}%`, backgroundColor: c.primary },
            ]}
          />
        </View>

        <View style={[styles.introCard, { backgroundColor: c.primary }]}>
          <View style={[styles.introIcon, { backgroundColor: c.accent }]}>
            <AppIcon name={current.icon} size={20} color={c.accentForeground} />
          </View>
          <View style={styles.introCopy}>
            <Text style={[styles.introEyebrow, { color: c.accent }]}>{current.eyebrow}</Text>
            <Text style={[styles.heading, { color: c.primaryForeground }]}>{current.title}</Text>
            <Text style={[styles.body, { color: c.primaryForeground }]}>{current.description}</Text>
          </View>
        </View>

        <View style={[styles.questionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {step === 0 ? (
            <View style={styles.form}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>Come ti chiami?</Text>
              <Text style={[styles.sectionHint, { color: c.mutedForeground }]}>Useremo il tuo nome per rendere l’esperienza più tua.</Text>
              <TextField label="Nome" value={firstName} onChangeText={setFirstName} placeholder="Mario" c={c} required />
              <TextField label="Cognome" value={lastName} onChangeText={setLastName} placeholder="Rossi" c={c} required />
              <TextField
                label="Data di nascita"
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="AAAA-MM-GG"
                hint="Formato: anno-mese-giorno"
                c={c}
                required
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.form}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>Il tuo percorso</Text>
              <Text style={[styles.sectionHint, { color: c.mutedForeground }]}>Scegli una sola opzione: dopo il salvataggio resterà fissa.</Text>
              <Text style={[styles.label, { color: c.foreground }]}>Tipo di istituto</Text>
              <View style={styles.institutionGrid}>
                <Choice label="Scuola superiore" selected={institutionType === 'scuola_superiore'} onPress={() => setInstitutionType('scuola_superiore')} c={c} />
                <Choice label="Università" selected={institutionType === 'universita'} onPress={() => setInstitutionType('universita')} c={c} />
                <Choice label="Altro percorso" selected={institutionType === 'altro'} onPress={() => setInstitutionType('altro')} c={c} />
              </View>
              <TextField label="Nome scuola o università" value={institutionName} onChangeText={setInstitutionName} placeholder="Es. Liceo Galileo Galilei" c={c} required />
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <TextField label="Classe / anno" value={studyYear} onChangeText={setStudyYear} placeholder="Es. 4°" c={c} required />
                </View>
                <View style={styles.column}>
                  <TextField label="Indirizzo" value={studyAddress} onChangeText={setStudyAddress} placeholder="Es. Scientifico" c={c} required />
                </View>
              </View>
              <Text style={[styles.label, { color: c.foreground }]}>Percorso di studio</Text>
              {level ? (
                <View style={[styles.locked, { backgroundColor: c.accent, borderColor: c.border }]}>
                  <AppIcon name="lock" size={15} color={c.accentForeground} />
                  <View style={styles.lockedCopy}>
                    <Text style={[styles.lockedText, { color: c.accentForeground }]}>{selectedLevel}</Text>
                    <Text style={[styles.lockedHint, { color: c.accentForeground }]}>Percorso bloccato dopo la prima scelta.</Text>
                    <Text style={[styles.lockedHint, { color: c.accentForeground }]}>Il tuo percorso è stato salvato e non può essere modificato.</Text>
                  </View>
                </View>
              ) : (
                levels.map((group) => (
                  <View key={group.group} style={styles.levelGroup}>
                    <Text style={[styles.groupTitle, { color: c.mutedForeground }]}>{group.group}</Text>
                    <View style={styles.levelGrid}>
                      {group.items.map((item) => (
                        <Choice key={item} label={item} selected={selectedLevel === item} onPress={() => setSelectedLevel(item)} c={c} disabled={Boolean(level)} />
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.form}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>Personalizza i suggerimenti</Text>
              <Text style={[styles.sectionHint, { color: c.mutedForeground }]}>Puoi lasciare tutto vuoto e completare il profilo più avanti.</Text>
              <TextField label="Cosa vuoi migliorare?" value={learningGoals} onChangeText={setLearningGoals} placeholder="Es. capire meglio la matematica" c={c} multiline />
              <TextField label="Quali argomenti ti interessano?" value={studyInterests} onChangeText={setStudyInterests} placeholder="Es. spazio, storia dell’arte..." c={c} multiline />
              <TextField label="Hai esami in programma?" value={examGoals} onChangeText={setExamGoals} placeholder="Es. esame di fisica a giugno" c={c} multiline />
              <View style={[styles.optionalNote, { backgroundColor: c.secondary }]}>
                <AppIcon name="sparkles" size={15} color={c.primary} />
                <Text style={[styles.optionalText, { color: c.mutedForeground }]}>Più ci racconti, più l’IA potrà aiutarti in modo mirato.</Text>
              </View>
            </View>
          ) : null}
        </View>

        {validationMessage ? (
          <View style={[styles.validationBox, { backgroundColor: c.secondary }]}>
            <AppIcon name="warning" size={15} color={c.destructive} />
            <Text style={[styles.validation, { color: c.destructive }]}>{validationMessage}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {step > 0 || level ? (
            <Pressable accessibilityRole="button" onPress={goBack} disabled={saving} style={({ pressed }) => [styles.backButton, { borderColor: c.border, opacity: pressed ? 0.7 : saving ? 0.5 : 1 }]}>
              <AppIcon name="chevron-right" size={15} color={c.foreground} />
              <Text style={[styles.backText, { color: c.foreground }]}>Indietro</Text>
            </Pressable>
          ) : <View style={styles.backPlaceholder} />}
          {step < 2 ? (
            <View style={styles.nextButton}>
              <PrimaryButton onPress={next} icon="arrow-up-right">Continua</PrimaryButton>
            </View>
          ) : (
            <View style={styles.nextButton}>
              <PrimaryButton onPress={() => { void save(); }} disabled={saving} loading={saving} icon="check">
                {saving ? 'Salvataggio…' : 'Salva e inizia'}
              </PrimaryButton>
            </View>
          )}
        </View>
        {saving ? <ActivityIndicator size="small" color={c.primary} /> : null}
        <Text style={[styles.footerNote, { color: c.mutedForeground }]}>I campi contrassegnati come obbligatori servono per preparare il tuo spazio.</Text>
      </KeyboardAwareScrollViewCompat>

      <AppModal
        visible={Boolean(errorMessage)}
        title="Non siamo riusciti a salvare"
        message={errorMessage ?? undefined}
        icon="warning"
        onDismiss={() => setErrorMessage(null)}
        actions={[{ label: 'Riprova', variant: 'primaria', onPress: () => { setErrorMessage(null); void save(); } }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 18 },
  brandCaption: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  progressLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  progressCount: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99 },
  introCard: { borderRadius: 24, padding: 18, flexDirection: 'row', gap: 13, overflow: 'hidden' },
  introIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 4 },
  introEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.7 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, opacity: 0.86 },
  questionCard: { borderRadius: 22, borderWidth: 1, padding: 17 },
  form: { gap: 14 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.25 },
  sectionHint: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: -8 },
  field: { gap: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  required: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 15 },
  input: { minHeight: 51, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 11, fontFamily: 'Inter_500Medium', fontSize: 14 },
  multiline: { minHeight: 82, textAlignVertical: 'top' },
  institutionGrid: { gap: 8 },
  choice: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  choiceText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  twoColumns: { flexDirection: 'row', gap: 9 },
  column: { flex: 1 },
  levelGroup: { gap: 8 },
  groupTitle: { fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1.1, fontSize: 10 },
  levelGrid: { gap: 7 },
  locked: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockedCopy: { flex: 1, gap: 3 },
  lockedText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  lockedHint: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 15 },
  optionalNote: { borderRadius: 14, padding: 12, flexDirection: 'row', gap: 9, alignItems: 'center' },
  optionalText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  validationBox: { borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  validation: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  backButton: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  backPlaceholder: { width: 1 },
  nextButton: { flex: 1 },
  footerNote: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 18 },
});