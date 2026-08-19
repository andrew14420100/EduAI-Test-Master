import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { IconButton, PrimaryButton } from '@/components/Ui';

export default function QuizScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const { materials } = useApp();
  const material = materials.find((item) => item.id === materialId);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
    >
      <View style={styles.top}>
        <IconButton name="x" label="Chiudi" onPress={() => router.back()} />
      </View>

      <View style={[styles.icon, { backgroundColor: c.accent }]}>
        <Feather name="file-text" size={28} color={c.accentForeground} />
      </View>
      <Text style={[styles.kicker, { color: c.primary }]}>MATERIALE SELEZIONATO</Text>
      <Text style={[styles.heading, { color: c.foreground }]}>{material?.name ?? 'Materiale non trovato'}</Text>
      <Text style={[styles.body, { color: c.mutedForeground }]}>
        Il file è stato aggiunto alla tua libreria. La verifica verrà generata a partire dal suo contenuto quando collegheremo il motore AI sicuro.
      </Text>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.row}>
          <Feather name="check-circle" size={18} color={c.primary} />
          <Text style={[styles.rowText, { color: c.foreground }]}>Il file è disponibile nella libreria</Text>
        </View>
        <View style={styles.row}>
          <Feather name="shield" size={18} color={c.primary} />
          <Text style={[styles.rowText, { color: c.foreground }]}>Nessuna domanda dimostrativa viene mostrata</Text>
        </View>
      </View>

      <PrimaryButton onPress={() => {
        Alert.alert('Materiale salvato', 'Puoi aggiungere altri file oppure tornare alla libreria.');
        router.replace('/(tabs)/library');
      }}>
        Torna alla libreria
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
  card: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 14, marginVertical: 8 },
  row: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  rowText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
});