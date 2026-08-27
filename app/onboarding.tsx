import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { IconButton, PrimaryButton } from '@/components/Ui';
import { Level, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const levels: { group: string; items: Level[] }[] = [
  { group: 'Scuole superiori', items: [
    'Liceo Scientifico', 'Liceo Classico', 'Liceo Linguistico', 'Liceo delle Scienze Umane',
    'Liceo Artistico', 'Liceo Musicale', 'Istituto Tecnico Tecnologico – Informatica',
    'Istituto Tecnico Tecnologico – Elettronica', 'Istituto Tecnico Tecnologico – Meccanica',
    'Istituto Tecnico Economico – Amministrazione', 'Istituto Tecnico Economico – Marketing',
    'Istituto Professionale – Alberghiero', 'Istituto Professionale – Servizi Socio-Sanitari',
    'Istituto Professionale – Manutenzione',
  ] },
  { group: 'Università · Facoltà', items: [
    'Medicina e Chirurgia', 'Professioni Sanitarie', 'Ingegneria Informatica', 'Ingegneria Meccanica',
    'Ingegneria Civile', 'Ingegneria Gestionale', 'Economia e Commercio', 'Giurisprudenza',
    'Psicologia', 'Lettere e Filosofia', 'Scienze Matematiche, Fisiche e Naturali',
    'Scienze Politiche', 'Architettura', 'Lingue e Letterature Straniere',
  ] },
];

type InstitutionType = 'scuola_superiore' | 'universita' | 'altro';
type Step = 0 | 1 | 2;

function TextField({
  label, value, onChangeText, placeholder, c, multiline = false, required = false,
}: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  c: ReturnType<typeof useColors>; multiline?: boolean; required?: boolean;
}) {
  return (
    <View>
      <Text style={[styles.label, { color: c.foreground }]}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multiline, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]}
      />
    </View>
  );
}

function Choice({
  label, selected, onPress, c, disabled = false,
}: { label: string; selected: boolean; onPress: () => void; c: ReturnType<typeof useColors>; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: selected ? c.accent : c.card, borderColor: selected ? c.primary : c.border, opacity: pressed ? 0.75 : disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.choiceText, { color: c.foreground }]}>{label}</Text>
      <View style={[styles.radio, { borderColor: selected ? c.primary : c.mutedForeground, backgroundColor: selected ? c.primary : 'transparent' }]}>
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
    learnerProfile?.institutionType === 'scuola_superiore' || learnerProfile?.institutionType === 'universita' || learnerProfile?.institutionType === 'altro'
      ? learnerProfile.institutionType : null,
  );
  const [institutionName, setInstitutionName] = useState(learnerProfile?.institutionName ?? '');
  const [studyYear, setStudyYear] = useState(learnerProfile?.studyYear ?? '');
  const [studyAddress, setStudyAddress] = useState(learnerProfile?.studyAddress ?? '');
  const [learningGoals, setLearningGoals] = useState(learnerProfile?.learningGoals ?? '');
  const [studyInterests, setStudyInterests] = useState(learnerProfile?.studyInterests ?? '');
  const [examGoals, setExamGoals] = useState(learnerProfile?.examGoals ?? '');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const stepTitles = ['Partiamo da te', 'Il tuo percorso', 'Come vuoi studiare?'];
  const progress = useMemo(() => `${step + 1} di 3`, [step]);

  const next = () => {
    setValidationMessage(null);
    if (step === 0) {
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())
        && !Number.isNaN(new Date(`${birthDate.trim()}T00:00:00.000Z`).getTime());
      if (firstName.trim().length < 2 || lastName.trim().length < 2 || !validDate) {
        setValidationMessage('Inserisci nome, cognome e una data valida nel formato AAAA-MM-GG.');
        return;
      }
    }
    if (step === 1 && (!selectedLevel || !institutionType || institutionName.trim().length < 2 || studyYear.trim().length < 1 || studyAddress.trim().length < 2)) {
      setValidationMessage('Completa percorso, tipo di istituto, nome, classe/anno e indirizzo di studi.');
      return;
    }
    setStep((current) => Math.min(2, current + 1) as Step);
  };

  const save = async () => {
    setValidationMessage(null);
    if (!selectedLevel || !institutionType || institutionName.trim().length < 2 || studyYear.trim().length < 1 || studyAddress.trim().length < 2) {
      setStep(1);
      setValidationMessage('Completa tutti i campi obbligatori del percorso.');
      return;
    }
    setSaving(true);
    const result = await completeOnboarding({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate.trim(),
      level: selectedLevel,
      institutionType,
      institutionName: institutionName.trim(),
      studyYear: studyYear.trim(),
      studyAddress: studyAddress.trim(),
      learningGoals: learningGoals.trim(),
      studyInterests: studyInterests.trim(),
      examGoals: examGoals.trim(),
    });
    setSaving(false);
    if (result.ok) router.replace('/(tabs)');
    else setErrorMessage(result.message);
  };

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 }]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {level ? <IconButton name="close" label="Chiudi" onPress={() => router.back()} /> : null}
        <View style={styles.topLine}>
          <View style={[styles.icon, { backgroundColor: c.accent }]}>
            <AppIcon name="graduation-cap" size={23} color={c.accentForeground} />
          </View>
          <Text style={[styles.progress, { color: c.primary }]}>{progress}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / 3) * 100}%`, backgroundColor: c.primary }]} />
        </View>
        <Text style={[styles.kicker, { color: c.primary }]}>PERSONALIZZA EDUAI</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>{stepTitles[step]}</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>
          {step === 0 ? 'Questi dati servono per creare un’esperienza adatta a te.' : step === 1 ? 'Il percorso resta bloccato dopo la prima scelta.' : 'Sono facoltative: aiutano l’IA a proporti contenuti più utili.'}
        </Text>

        {step === 0 ? (
          <View style={styles.form}>
            <View style={styles.twoColumns}>
              <View style={styles.column}><TextField label="Nome" value={firstName} onChangeText={setFirstName} placeholder="Mario" c={c} required /></View>
              <View style={styles.column}><TextField label="Cognome" value={lastName} onChangeText={setLastName} placeholder="Rossi" c={c} required /></View>
            </View>
            <TextField label="Data di nascita" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-GG" c={c} required />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: c.foreground }]}>Tipo di istituto *</Text>
            <View style={styles.choiceStack}>
              <Choice label="Scuola superiore" selected={institutionType === 'scuola_superiore'} onPress={() => setInstitutionType('scuola_superiore')} c={c} />
              <Choice label="Università" selected={institutionType === 'universita'} onPress={() => setInstitutionType('universita')} c={c} />
              <Choice label="Altro percorso" selected={institutionType === 'altro'} onPress={() => setInstitutionType('altro')} c={c} />
            </View>
            <TextField label="Nome scuola o università" value={institutionName} onChangeText={setInstitutionName} placeholder="Es. Liceo Galileo Galilei" c={c} required />
            <View style={styles.twoColumns}>
              <View style={styles.column}><TextField label="Classe / anno" value={studyYear} onChangeText={setStudyYear} placeholder="Es. 4°" c={c} required /></View>
              <View style={styles.column}><TextField label="Indirizzo di studi" value={studyAddress} onChangeText={setStudyAddress} placeholder="Es. Scientifico" c={c} required /></View>
            </View>
            <Text style={[styles.label, { color: c.foreground }]}>Percorso di studio *</Text>
            {level ? (
              <View style={[styles.locked, { backgroundColor: c.accent, borderColor: c.border }]}>
                <AppIcon name="lock" size={15} color={c.accentForeground} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.lockedText, { color: c.accentForeground }]}>{selectedLevel}</Text>
                  <Text style={[styles.lockedHint, { color: c.accentForeground }]}>Percorso bloccato dopo la prima scelta.</Text>
                  <Text style={[styles.lockedHint, { color: c.accentForeground }]}>Il tuo percorso è stato salvato e non può essere modificato.</Text>
                </View>
              </View>
            ) : levels.map((group) => (
              <View key={group.group} style={styles.choiceStack}>
                <Text style={[styles.groupTitle, { color: c.mutedForeground }]}>{group.group}</Text>
                {group.items.map((item) => <Choice key={item} label={item} selected={selectedLevel === item} onPress={() => setSelectedLevel(item)} c={c} disabled={Boolean(level)} />)}
              </View>
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.form}>
            <TextField label="Obiettivi di apprendimento" value={learningGoals} onChangeText={setLearningGoals} placeholder="Es. capire meglio la matematica" c={c} multiline />
            <TextField label="Argomenti che ti interessano" value={studyInterests} onChangeText={setStudyInterests} placeholder="Es. spazio, storia dell’arte..." c={c} multiline />
            <TextField label="Esami o verifiche in programma" value={examGoals} onChangeText={setExamGoals} placeholder="Es. esame di fisica a giugno" c={c} multiline />
            <View style={[styles.tip, { backgroundColor: c.card, borderColor: c.border }]}>
              <AppIcon name="sparkles" size={15} color={c.primary} />
              <Text style={[styles.tipText, { color: c.mutedForeground }]}>Puoi lasciare vuoti questi campi e aggiornarli più avanti dal profilo.</Text>
            </View>
          </View>
        ) : null}

        {validationMessage ? <Text style={[styles.validation, { color: c.destructive }]}>{validationMessage}</Text> : null}
        {step < 2 ? (
          <PrimaryButton onPress={next} icon="arrow-up-right">Continua</PrimaryButton>
        ) : (
          <PrimaryButton onPress={() => { void save(); }} disabled={saving} loading={saving} icon="check">
            {saving ? 'Salvataggio…' : 'Completa il profilo'}
          </PrimaryButton>
        )}
        {saving ? <ActivityIndicator size="small" color={c.primary} /> : null}
      </KeyboardAwareScrollViewCompat>
      <AppModal
        visible={Boolean(errorMessage)}
        title="Salvataggio non riuscito"
        message={errorMessage ?? undefined}
        icon="warning"
        onDismiss={() => setErrorMessage(null)}
        actions={[{ label: 'Riprova', variant: 'primaria', onPress: () => setErrorMessage(null) }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progress: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  progressTrack: { height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: '#DCE5F0' },
  progressFill: { height: 5, borderRadius: 4 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginTop: 3 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  form: { gap: 15, marginTop: 4 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_500Medium', fontSize: 14 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  choiceStack: { gap: 8 },
  choice: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  choiceText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 19 },
  radio: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1.1, fontSize: 10, marginTop: 4 },
  locked: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockedText: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 14 },
  lockedHint: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  tip: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'center' },
  tipText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  validation: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19 },
});