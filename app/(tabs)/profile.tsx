import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ProfileModal = 'avvisi' | 'privacy' | 'uscita' | 'ticket' | 'esito' | null;
const ticketCategories = ['Problema tecnico', 'Account', 'Materiali', 'Verifiche', 'Altro'];

function ticketStatusLabel(status: string) {
  if (status === 'closed') return 'Chiuso';
  if (status === 'in_progress') return 'In lavorazione';
  return 'Aperto';
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { account, level, wallet, quizzes, streak, tickets, logout, createTicket, labsEnabled, hasLabsByDefault, enableLabs } = useApp();
  const isAdmin = account?.email?.toLowerCase() === 'andcolaz@gmail.com';
  const [modal, setModal] = useState<ProfileModal>(null);
  const [togglingLabs, setTogglingLabs] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(ticketCategories[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ title: '', message: '', success: false });

  const preferences: { label: string; icon: AppIconName; action: () => void }[] = [
    { label: 'Percorso di studio', icon: 'book', action: () => router.push('/onboarding') },
    { label: 'Assistenza', icon: 'support', action: () => setModal('ticket') },
    { label: 'Avvisi', icon: 'bell', action: () => setModal('avvisi') },
    { label: 'Privacy e dati', icon: 'shield', action: () => setModal('privacy') },
    { label: 'Impostazioni account', icon: 'book', action: () => router.push('/account-settings') },
    { label: 'Esci dall’account', icon: 'logout', action: () => setModal('uscita') },
  ];
  if (isAdmin) {
    preferences.splice(1, 0, { label: 'Console assistenza', icon: 'support', action: () => router.push('/admin') });
  }
  const submitTicket = async () => {
    if (submitting) return;
    if (subject.trim().length < 3 || description.trim().length < 10) {
      setFeedback({
        title: 'Completa il ticket',
        message: 'Inserisci un oggetto di almeno 3 caratteri e una descrizione di almeno 10 caratteri.',
        success: false,
      });
      setModal('esito');
      return;
    }

    setSubmitting(true);
    const result = await createTicket(subject.trim(), category, description.trim());
    setSubmitting(false);
    if (result.ok) {
      setSubject('');
      setDescription('');
      setCategory(ticketCategories[0]);
      setFeedback({
        title: 'Ticket inviato',
         message: 'La richiesta è stata salvata. Puoi seguirne lo stato nella sezione assistenza. Le notifiche dei ticket sono disponibili nell’app: l’invio email automatico richiede un servizio email dedicato non collegato.',
        success: true,
      });
    } else {
      setFeedback({ title: 'Invio non riuscito', message: result.message, success: false });
    }
    setModal('esito');
  };

  const modalContent = modal === 'avvisi'
    ? {
      title: 'Avvisi',
      message: 'Qui compariranno gli aggiornamenti importanti relativi al tuo account e ai contenuti.',
      icon: 'bell' as const,
    }
    : modal === 'privacy'
      ? {
        title: 'Privacy e dati',
        message: 'Account, percorso, materiali, progressi e ticket sono salvati in modo protetto sul backend e associati esclusivamente al tuo account.',
        icon: 'shield' as const,
      }
      : modal === 'ticket'
        ? {
          title: 'Contatta l’assistenza',
          message: 'Descrivi il problema: la richiesta sarà salvata nel tuo account.',
          icon: 'support' as const,
        }
        : modal === 'esito'
          ? { title: feedback.title, message: feedback.message, icon: feedback.success ? 'circle-check' as const : 'warning' as const }
          : {
            title: 'Vuoi uscire?',
            message: 'Dovrai inserire nuovamente email e password. I dati online non verranno eliminati.',
            icon: 'logout' as const,
          };

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileTop}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}><AppIcon name="profile" size={25} color={c.primaryForeground} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.foreground }]}>{account?.username ?? 'Il tuo profilo'}</Text>
            <Text style={[styles.subtitle, { color: c.mutedForeground }]}>{account?.email ?? 'Account EduAI'}</Text>
          </View>
          <View accessibilityLabel="Percorso bloccato" style={[styles.edit, { backgroundColor: c.card }]}><AppIcon name="shield" size={15} color={c.mutedForeground} /></View>
        </View>

        <View style={[styles.rank, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: c.primary }]}>PERCORSO ATTUALE</Text>
            <Text style={[styles.rankTitle, { color: c.foreground }]}>{level ?? 'Non selezionato'}</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>Scelta definitiva</Text>
          </View>
          <View style={[styles.rankBadge, { backgroundColor: c.accent }]}><AppIcon name="award" size={22} color={c.accentForeground} /></View>
        </View>

        <SectionTitle eyebrow="I tuoi dati" title="Riepilogo" />
        <View style={styles.metrics}>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.primary }]}>{wallet}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>punti</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{streak}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>giorni attivi</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{quizzes.filter((quiz) => quiz.passed).length}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>superate</Text></View>
        </View>

        <SectionTitle eyebrow="Assistenza" title="Le tue richieste" />
        {tickets.length ? tickets.slice(0, 3).map((ticket) => (
          <View key={ticket.id} style={[styles.ticket, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.ticketIcon, { backgroundColor: c.secondary }]}>
              <AppIcon name="support" size={15} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketTitle, { color: c.foreground }]} numberOfLines={1}>{ticket.subject}</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>
                #{ticket.id.slice(0, 8).toUpperCase()} · {ticket.category} · {ticketStatusLabel(ticket.status)}
              </Text>
              {ticket.messages?.filter((entry) => entry.authorRole === 'admin').slice(-1).map((entry) => (
                <Text key={entry.id} style={[styles.small, { color: c.primary, marginTop: 4 }]} numberOfLines={2}>Assistenza: {entry.message}</Text>
              ))}
            </View>
          </View>
        )) : (
          <Pressable testID="apri-primo-ticket" onPress={() => setModal('ticket')} style={[styles.emptyTicket, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="support" size={18} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketTitle, { color: c.foreground }]}>Hai bisogno di aiuto?</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>Apri un ticket direttamente dall’app.</Text>
            </View>
            <AppIcon name="chevron-right" size={14} color={c.mutedForeground} />
          </Pressable>
        )}

        <SectionTitle eyebrow="Impostazioni" title="Preferenze" />
        {!hasLabsByDefault ? (
          <View style={[styles.preference, { borderBottomColor: c.border }]}>
            <View style={[styles.prefIcon, { backgroundColor: c.secondary }]}><AppIcon name="flask" size={15} color={c.foreground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.prefText, { color: c.foreground }]}>Laboratori interattivi</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>Esercizi pratici facoltativi per il tuo percorso</Text>
            </View>
            <Switch
              testID="toggle-laboratori"
              value={labsEnabled}
              disabled={togglingLabs}
              onValueChange={(next) => {
                setTogglingLabs(true);
                void enableLabs(next).finally(() => setTogglingLabs(false));
              }}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor={c.background}
            />
          </View>
        ) : null}
        {preferences.map((item) => (
          <Pressable key={item.label} testID={item.label} onPress={item.action} style={[styles.preference, { borderBottomColor: c.border }]}>
            <View style={[styles.prefIcon, { backgroundColor: c.secondary }]}><AppIcon name={item.icon} size={15} color={c.foreground} /></View>
            <Text style={[styles.prefText, { color: item.icon === 'logout' ? c.destructive : c.foreground }]}>{item.label}</Text>
            <AppIcon name="chevron-right" size={14} color={c.mutedForeground} />
          </Pressable>
        ))}
        <View style={styles.footer}><Pill>EDUAI TEST MASTER</Pill><Text style={[styles.small, { color: c.mutedForeground }]}>Il tuo spazio di studio sincronizzato.</Text></View>
      </ScrollView>

      <AppModal
        visible={Boolean(modal)}
        title={modalContent.title}
        message={modalContent.message}
        icon={modalContent.icon}
        onDismiss={() => setModal(null)}
        actions={modal === 'uscita'
          ? [
            { label: 'Esci', variant: 'pericolo', onPress: () => { setModal(null); void logout().then(() => router.replace('/accesso')); } },
            { label: 'Resta nell’app', onPress: () => setModal(null) },
          ]
          : modal === 'ticket'
            ? [
              { label: submitting ? 'Invio…' : 'Invia ticket', variant: 'primaria', onPress: () => { void submitTicket(); } },
              { label: 'Annulla', onPress: () => setModal(null) },
            ]
            : [{ label: 'Ho capito', variant: 'primaria', onPress: () => setModal(null) }]}
      >
        {modal === 'ticket' ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: c.foreground }]}>Oggetto</Text>
            <TextInput
              testID="ticket-oggetto"
              value={subject}
              onChangeText={setSubject}
              placeholder="Es. Non riesco a caricare un PDF"
              placeholderTextColor={c.mutedForeground}
              style={[styles.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
            />
            <Text style={[styles.label, { color: c.foreground }]}>Categoria</Text>
            <View style={styles.categories}>
              {ticketCategories.map((item) => (
                <Pressable
                  key={item}
                  testID={`categoria-${item}`}
                  onPress={() => setCategory(item)}
                  style={[styles.category, { backgroundColor: category === item ? c.accent : c.secondary, borderColor: category === item ? c.primary : c.border }]}
                >
                  <Text style={[styles.categoryText, { color: category === item ? c.accentForeground : c.secondaryForeground }]}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label, { color: c.foreground }]}>Descrizione</Text>
            <TextInput
              testID="ticket-descrizione"
              value={description}
              onChangeText={setDescription}
              placeholder="Spiega cosa è successo e cosa ti aspettavi."
              placeholderTextColor={c.mutedForeground}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
            />
          </View>
        ) : null}
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 },
  edit: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rank: { borderWidth: 1, borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 5 },
  rankTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  rankBadge: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, borderRadius: 16, padding: 13 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 25, marginBottom: 3 },
  preference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  prefIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  ticket: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  emptyTicket: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center' },
  ticketIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ticketTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 3 },
  footer: { alignItems: 'center', gap: 8, marginTop: 12 },
  form: { marginTop: 16, gap: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 5 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, fontFamily: 'Inter_500Medium', fontSize: 13 },
  textarea: { minHeight: 92 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  category: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 },
  categoryText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});