import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function OnboardingScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { level, completeOnboarding, createTicket } = useApp();
  const [selected, setSelected] = useState<Level | null>(level);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supportVisible, setSupportVisible] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const result = await completeOnboarding(selected);
    setSaving(false);
    if (result.ok) router.replace('/(tabs)');
    else setErrorMessage(result.message);
  };

  const submitPrioritySupport = async () => {
    if (supportSubmitting || supportMessage.trim().length < 10) return;
    setSupportSubmitting(true);
    const result = await createTicket(
      'Segnala problema nella scelta del percorso',
      'problema_percorso_prioritario',
      supportMessage.trim(),
    );
    setSupportSubmitting(false);
    if (result.ok) {
      setSupportMessage('');
      setSupportVisible(false);
      setErrorMessage('La segnalazione prioritaria è stata inviata. Puoi riprovare il salvataggio del percorso.');
    } else {
      setErrorMessage(result.message);
    }
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
      {level ? <IconButton name="close" label="Chiudi" onPress={() => router.back()} /> : null}
      <View style={[styles.icon, { backgroundColor: c.accent }]}>
        <AppIcon name="graduation-cap" size={23} color={c.accentForeground} />
      </View>
      <Text style={[styles.kicker, { color: c.primary }]}>PERSONALIZZA EDUAI</Text>
      <Text style={[styles.heading, { color: c.foreground }]}>Qual è il tuo percorso di studio?</Text>
      <Text style={[styles.body, { color: c.mutedForeground }]}>
        {level
          ? 'Il tuo percorso è stato salvato e non può essere modificato. Questa scelta determina i contenuti e i laboratori che vedrai.'
          : 'Scegli l’indirizzo più vicino ai tuoi obiettivi. Dopo il salvataggio la scelta sarà definitiva.'}
      </Text>

      {levels.map((group) => (
        <View key={group.group} style={styles.group}>
          <Text style={[styles.groupTitle, { color: c.mutedForeground }]}>{group.group}</Text>
          {group.items.map((item) => {
            const active = selected === item;
            return (
              <Pressable
                key={item}
                testID={`percorso-${item}`}
                disabled={Boolean(level)}
                onPress={() => setSelected(item)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: active ? c.accent : c.card,
                    borderColor: active ? c.primary : c.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.optionText, { color: c.foreground }]}>{item}</Text>
                <View style={[styles.radio, { borderColor: active ? c.primary : c.mutedForeground, backgroundColor: active ? c.primary : 'transparent' }]}>
                  {active ? <AppIcon name="check" size={11} color={c.primaryForeground} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {level ? (
        <View style={[styles.lockedNotice, { backgroundColor: c.accent, borderColor: c.border }]}>
          <AppIcon name="shield" size={16} color={c.accentForeground} />
          <Text style={[styles.body, { color: c.accentForeground, flex: 1 }]}>Percorso bloccato dopo la prima scelta.</Text>
        </View>
      ) : (
        <PrimaryButton onPress={() => { void save(); }} disabled={!selected || saving} icon="check">
          {saving ? 'Salvataggio…' : 'Salva il mio percorso'}
        </PrimaryButton>
      )}
      </ScrollView>
      <AppModal
        visible={Boolean(errorMessage)}
        title="Salvataggio non riuscito"
        message={errorMessage ?? undefined}
        icon="warning"
        onDismiss={() => setErrorMessage(null)}
         actions={[
           { label: 'Riprova', variant: 'primaria', onPress: () => setErrorMessage(null) },
           { label: 'Segnala il problema', onPress: () => { setErrorMessage(null); setSupportVisible(true); } },
         ]}
      />
      <AppModal
        visible={supportVisible}
        title="Segnala problema nella scelta del percorso"
        message="Descrivi cosa è successo. La segnalazione sarà marcata come prioritaria e inviata subito all’assistenza."
        icon="support"
        onDismiss={() => setSupportVisible(false)}
        actions={[
          { label: supportSubmitting ? 'Invio…' : 'Invia segnalazione', variant: 'primaria', onPress: () => { void submitPrioritySupport(); } },
          { label: 'Annulla', onPress: () => setSupportVisible(false) },
        ]}
      >
        <TextInput
          value={supportMessage}
          onChangeText={setSupportMessage}
          placeholder="Descrivi l’errore e il percorso selezionato."
          placeholderTextColor={c.mutedForeground}
          multiline
          textAlignVertical="top"
          style={[styles.supportInput, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
        />
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginTop: 8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 36, letterSpacing: -0.9, maxWidth: 350 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  group: { gap: 9, marginTop: 8 },
  groupTitle: { fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 10, marginBottom: 2 },
  option: { minHeight: 58, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lockedNotice: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  supportInput: { borderWidth: 1, borderRadius: 14, minHeight: 110, marginTop: 16, padding: 13, fontFamily: 'Inter_500Medium', fontSize: 14 },
});