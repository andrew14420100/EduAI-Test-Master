import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppIconName } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ProfileModal = 'avvisi' | 'privacy' | 'uscita' | null;

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { account, level, wallet, quizzes, streak, logout } = useApp();
  const [modal, setModal] = useState<ProfileModal>(null);
  const preferences: { label: string; icon: AppIconName; action: () => void }[] = [
    { label: 'Percorso di studio', icon: 'book', action: () => router.push('/onboarding') },
    { label: 'Avvisi', icon: 'bell', action: () => setModal('avvisi') },
    { label: 'Privacy e dati', icon: 'shield', action: () => setModal('privacy') },
    { label: 'Esci dall’account', icon: 'logout', action: () => setModal('uscita') },
  ];

  const modalContent = modal === 'avvisi'
    ? { title: 'Avvisi', message: 'Le notifiche saranno disponibili quando verrà collegato il servizio online.', icon: 'bell' as const }
    : modal === 'privacy'
      ? { title: 'Privacy e dati', message: 'Account, percorso e materiali restano nella memoria locale del dispositivo. Non vengono inviati a servizi esterni.', icon: 'shield' as const }
      : { title: 'Vuoi uscire?', message: 'Dovrai inserire nuovamente email e password. I materiali salvati non verranno eliminati.', icon: 'logout' as const };

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileTop}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}><AppIcon name="profile" size={25} color={c.primaryForeground} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.foreground }]}>{account?.username ?? 'Il tuo profilo'}</Text>
            <Text style={[styles.subtitle, { color: c.mutedForeground }]}>{account?.email ?? 'Account locale'}</Text>
          </View>
          <Pressable accessibilityLabel="Modifica percorso" onPress={() => router.push('/onboarding')} style={[styles.edit, { backgroundColor: c.card }]}><AppIcon name="edit" size={15} color={c.foreground} /></Pressable>
        </View>

        <Pressable onPress={() => router.push('/onboarding')} style={[styles.rank, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: c.primary }]}>PERCORSO ATTUALE</Text>
            <Text style={[styles.rankTitle, { color: c.foreground }]}>{level ?? 'Non selezionato'}</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>Tocca per modificarlo</Text>
          </View>
          <View style={[styles.rankBadge, { backgroundColor: c.accent }]}><AppIcon name="award" size={22} color={c.accentForeground} /></View>
        </Pressable>

        <SectionTitle eyebrow="I tuoi dati" title="Riepilogo" />
        <View style={styles.metrics}>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.primary }]}>{wallet}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>punti</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{streak}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>giorni attivi</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{quizzes.filter((quiz) => quiz.passed).length}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>superate</Text></View>
        </View>

        <SectionTitle eyebrow="Impostazioni" title="Preferenze" />
        {preferences.map((item) => (
          <Pressable key={item.label} testID={item.label} onPress={item.action} style={[styles.preference, { borderBottomColor: c.border }]}>
            <View style={[styles.prefIcon, { backgroundColor: c.secondary }]}><AppIcon name={item.icon} size={15} color={c.foreground} /></View>
            <Text style={[styles.prefText, { color: item.icon === 'logout' ? c.destructive : c.foreground }]}>{item.label}</Text>
            <AppIcon name="chevron-right" size={14} color={c.mutedForeground} />
          </Pressable>
        ))}
        <View style={styles.footer}><Pill>EDUAI TEST MASTER</Pill><Text style={[styles.small, { color: c.mutedForeground }]}>Il tuo spazio di studio.</Text></View>
      </ScrollView>

      <AppModal
        visible={Boolean(modal)}
        title={modalContent.title}
        message={modalContent.message}
        icon={modalContent.icon}
        onDismiss={() => setModal(null)}
        actions={modal === 'uscita'
          ? [
            { label: 'Esci', variant: 'pericolo', onPress: () => { setModal(null); logout(); router.replace('/accesso'); } },
            { label: 'Resta nell’app', onPress: () => setModal(null) },
          ]
          : [{ label: 'Ho capito', variant: 'primaria', onPress: () => setModal(null) }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 }, profileTop: { flexDirection: 'row', alignItems: 'center', gap: 13 }, avatar: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 21 }, subtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 }, edit: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rank: { borderWidth: 1, borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 5 },
  rankTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 4 }, small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 }, rankBadge: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, borderRadius: 16, padding: 13 }, metricValue: { fontFamily: 'Inter_700Bold', fontSize: 25, marginBottom: 3 },
  preference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 }, prefIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 }, footer: { alignItems: 'center', gap: 8, marginTop: 12 },
});