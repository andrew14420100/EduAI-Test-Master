import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
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
  const { level, completeOnboarding } = useApp();
  const [selected, setSelected] = useState<Level | null>(level);

  const save = () => {
    if (!selected) return;
    completeOnboarding(selected);
    router.replace('/(tabs)');
  };

  return (
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
        Scegli l’indirizzo più vicino ai tuoi obiettivi. Potrai modificarlo in qualsiasi momento dal profilo.
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
      <PrimaryButton onPress={save} disabled={!selected} icon="check">
        Salva il mio percorso
      </PrimaryButton>
    </ScrollView>
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
});