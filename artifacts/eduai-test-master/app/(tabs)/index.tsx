import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { IconButton, Pill, PrimaryButton, SectionTitle } from '@/components/Ui';

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { level, wallet, streak, quizzes, materials } = useApp();
  const start = () => materials.length
    ? router.push({ pathname: '/quiz', params: { materialId: materials[0].id } })
    : router.push('/(tabs)/library');

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: c.mutedForeground }]}>IL TUO SPAZIO DI STUDIO</Text>
          <Text style={[styles.heading, { color: c.foreground }]}>Ciao, studiamo?</Text>
        </View>
        <IconButton name="bell" label="Avvisi" onPress={() => Alert.alert('Avvisi', 'Non hai nuovi avvisi.')} />
      </View>

      <Pressable onPress={() => router.push('/onboarding')} style={[styles.levelCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[styles.avatar, { backgroundColor: c.accent }]}><Feather name="book-open" size={18} color={c.accentForeground} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>IL TUO PERCORSO</Text>
          <Text style={[styles.level, { color: c.foreground }]}>{level ?? 'Scegli il tuo indirizzo'}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={c.mutedForeground} />
      </Pressable>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.primary }]}>{streak}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>giorni attivi</Text></View>
        <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.foreground }]}>{wallet}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>punti</Text></View>
        <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.foreground }]}>{quizzes.length}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>verifiche</Text></View>
      </View>

      <View style={[styles.hero, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Pill color={c.accentForeground}>STUDIO CON AI</Pill>
          <Text style={[styles.heroTitle, { color: c.primaryForeground }]}>Trasforma i tuoi file in studio attivo.</Text>
          <Text style={[styles.heroBody, { color: c.primaryForeground }]}>
            {materials.length ? `${materials.length} materiale/i pronti nella tua libreria.` : 'Aggiungi un documento, un’immagine o un video per iniziare.'}
          </Text>
          <PrimaryButton onPress={start}>{materials.length ? 'Apri materiali' : 'Aggiungi materiali'}</PrimaryButton>
        </View>
        <View style={[styles.orbit, { borderColor: c.primaryForeground }]}><Feather name="book" size={28} color={c.primaryForeground} /></View>
      </View>

      <SectionTitle eyebrow="Andamento" title="Il tuo progresso" />
      <View style={[styles.progressCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.progressBig, { color: c.foreground }]}>{quizzes.length ? 'In crescita' : 'Da iniziare'}</Text>
        <Text style={[styles.small, { color: c.mutedForeground }]}>{quizzes.length ? 'Continua a studiare con costanza.' : 'Carica il primo materiale per cominciare.'}</Text>
        <View style={[styles.track, { backgroundColor: c.secondary }]}><View style={[styles.fill, { backgroundColor: c.primary, width: quizzes.length ? '25%' : '0%' }]} /></View>
      </View>

      <SectionTitle eyebrow="Cronologia" title="Ultime verifiche" />
      {quizzes.length ? quizzes.slice(0, 3).map((quiz) => (
        <View key={quiz.id} style={[styles.activity, { borderBottomColor: c.border }]}>
          <View style={[styles.activityIcon, { backgroundColor: quiz.passed ? c.accent : c.secondary }]}><Feather name={quiz.passed ? 'check' : 'book-open'} size={17} color={quiz.passed ? c.accentForeground : c.mutedForeground} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.activityTitle, { color: c.foreground }]}>{quiz.title}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>{quiz.date}</Text></View>
          <Text style={[styles.activityScore, { color: quiz.passed ? c.primary : c.mutedForeground }]}>{quiz.score}/15</Text>
        </View>
      )) : (
        <View style={[styles.empty, { backgroundColor: c.card }]}><Feather name="bar-chart-2" size={20} color={c.primary} /><Text style={[styles.emptyTitle, { color: c.foreground }]}>Ancora nessuna verifica</Text><Text style={[styles.small, { color: c.mutedForeground }]}>I risultati compariranno qui dopo il primo esame.</Text></View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 22 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 }, heading: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.8, marginTop: 5 },
  levelCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, marginBottom: 3 }, level: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, borderRadius: 15, padding: 12 }, statValue: { fontFamily: 'Inter_700Bold', fontSize: 22 }, statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  hero: { borderRadius: 23, padding: 20, flexDirection: 'row', overflow: 'hidden', minHeight: 232 }, heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.8, marginTop: 18, maxWidth: 220 },
  heroBody: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, opacity: 0.84, marginVertical: 12, maxWidth: 230 }, orbit: { width: 65, height: 65, borderWidth: 1, borderRadius: 33, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginLeft: 8 },
  progressCard: { borderRadius: 18, borderWidth: 1, padding: 16 }, progressBig: { fontFamily: 'Inter_700Bold', fontSize: 21 }, track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 14 }, fill: { height: '100%', borderRadius: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 }, activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  activityIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, activityTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, activityScore: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  empty: { padding: 18, borderRadius: 18, gap: 6 }, emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});