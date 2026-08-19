import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { IconButton, PrimaryButton } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function QuizScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ materialIds?: string; mode?: string; title?: string }>();
  const { materials } = useApp();
  const rawIds = Array.isArray(params.materialIds) ? params.materialIds[0] : params.materialIds;
  const ids = rawIds?.split(',').filter(Boolean) ?? [];
  const selectedMaterials = materials.filter((material) => ids.includes(material.id));
  const mode = params.mode === 'flashcard' ? 'flashcard' : 'verifica';
  const title = Array.isArray(params.title) ? params.title[0] : params.title;
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/library');
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.top}>
        <IconButton name="close" label="Chiudi" onPress={close} />
      </View>

      <View style={[styles.icon, { backgroundColor: c.accent }]}>
        <AppIcon name={mode === 'flashcard' ? 'flashcards' : 'question'} size={26} color={c.accentForeground} />
      </View>
      <Text style={[styles.kicker, { color: c.primary }]}>{mode === 'flashcard' ? 'FLASHCARD UNIFICATE' : 'VERIFICA UNIFICATA'}</Text>
      <Text style={[styles.heading, { color: c.foreground }]}>{title ?? 'Pacchetto di studio'}</Text>
      <Text style={[styles.body, { color: c.mutedForeground }]}>
        {selectedMaterials.length
          ? `${selectedMaterials.length} ${selectedMaterials.length === 1 ? 'materiale è pronto' : 'materiali sono pronti'} per l’analisi congiunta.`
          : 'I materiali selezionati non sono più disponibili nella libreria.'}
      </Text>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.cardHeader}>
          <AppIcon name="layers" size={17} color={c.primary} />
          <Text style={[styles.cardTitle, { color: c.foreground }]}>Materiali inclusi</Text>
        </View>
        {selectedMaterials.map((material) => (
          <View key={material.id} style={[styles.row, { borderTopColor: c.border }]}>
            <AppIcon
              name={material.kind === 'immagine' ? 'image' : material.kind === 'video' ? 'video' : material.kind === 'audio' ? 'audio' : 'file'}
              size={15}
              color={c.primary}
            />
            <Text style={[styles.rowText, { color: c.foreground }]} numberOfLines={1}>{material.name}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.notice, { backgroundColor: c.accent }]}>
        <AppIcon name="info" size={17} color={c.accentForeground} />
        <Text style={[styles.noticeText, { color: c.accentForeground }]}>
          Il pacchetto è predisposto per l’elaborazione unificata. La generazione AI reale verrà attivata con il collegamento al backend sicuro.
        </Text>
      </View>

      <PrimaryButton onPress={() => router.replace('/(tabs)/library')} icon="upload">
        Aggiungi o modifica i materiali
      </PrimaryButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 }, top: { alignItems: 'flex-start' },
  icon: { width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginTop: 8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 4, marginVertical: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderTopWidth: 1 },
  rowText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  notice: { borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
});