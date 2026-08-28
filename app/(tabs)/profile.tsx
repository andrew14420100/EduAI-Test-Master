import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, ScreenEntryLoader, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ProfileModal = 'avvisi' | 'privacy' | 'uscita' | 'elimina-account' | 'proponi-modifica' | 'esito' | null;
const ticketCategories = ['Suggerimento', 'Segnalazione errore', 'Nuova funzionalità', 'Altro'];

function ticketStatusLabel(status: string) {
  if (status === 'closed') return 'Chiuso';
  if (status === 'in_progress') return 'In lavorazione';
  return 'Aperto';
}

function profileIconFor(shopItemId?: string): AppIconName {
  switch (shopItemId) {
    case 'app_icon_midnight': return 'moon';
    case 'app_icon_neon': return 'zap';
    case 'app_icon_scholar': return 'award';
    case 'app_icon_aurora': return 'sparkles';
    case 'app_icon_legend': return 'star';
    default: return 'profile';
  }
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const {
    account,
    level,
    wallet,
    xp,
    shop,
    quizzes,
    streak,
    tickets,
    unreadSupportCount,
    markTicketRead,
    logout,
    deleteAccount,
    createTicket,
    labsEnabled,
    hasLabsByDefault,
    enableLabs,
    soundEnabled,
    setSoundEnabled,
  } = useApp();
  const isAdmin = account?.email?.toLowerCase() === 'andcolaz13@gmail.com';
  const [modal, setModal] = useState<ProfileModal>(null);
  const [togglingLabs, setTogglingLabs] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(ticketCategories[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ title: '', message: '', success: false });
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [updatingSound, setUpdatingSound] = useState(false);
  const avatarFrame = shop.find((item) => item.itemType === 'cornice_avatar' && item.equipped);
  const statsDecoration = shop.find((item) => item.itemType === 'decorazione_profilo' && item.equipped);
  const equippedTitle = shop.find((item) => item.itemType === 'titolo' && item.equipped);
  const equippedAnimation = shop.find((item) => item.itemType.startsWith('animazione') && item.equipped);
  const equippedProfileIcon = shop.find((item) => item.itemType === 'icona_futura' && item.equipped);
  const badges = shop.filter((item) => item.itemType === 'distintivo' && item.owned);
  const profilePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!avatarFrame || avatarFrame.id !== 'avatar_glow_frame') return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(profilePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(profilePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [avatarFrame, profilePulse]);

  useEffect(() => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (ticket?.unread) void markTicketRead(ticket.id);
  }, [markTicketRead, ticketId, tickets]);

  const notificationTicket = ticketId ? tickets.find((item) => item.id === ticketId) : undefined;

  const openSuggestion = () => {
    setModal('proponi-modifica');
    for (const ticket of tickets) {
      if (ticket.unread) void markTicketRead(ticket.id);
    }
  };

  const preferences: { label: string; icon: AppIconName; action: () => void }[] = [
    { label: 'Proponi una modifica', icon: 'sparkles', action: openSuggestion },
    { label: 'Avvisi', icon: 'bell', action: () => setModal('avvisi') },
    { label: 'Privacy e dati', icon: 'shield', action: () => router.push('/privacy') },
    { label: 'Impostazioni account', icon: 'book', action: () => router.push('/account-settings') },
    { label: 'Esci dall’account', icon: 'logout', action: () => setModal('uscita') },
    { label: 'Elimina definitivamente l’account', icon: 'trash', action: () => setModal('elimina-account') },
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
      : modal === 'proponi-modifica'
        ? {
          title: 'Proponi una modifica',
          message: 'Condividi un suggerimento, segnala un errore o proponi una nuova funzionalità. La richiesta sarà salvata nel tuo account.',
          icon: 'sparkles' as const,
        }
        : modal === 'esito'
          ? { title: feedback.title, message: feedback.message, icon: feedback.success ? 'circle-check' as const : 'warning' as const }
          : modal === 'elimina-account'
            ? {
              title: 'Eliminare definitivamente l’account?',
              message: 'Questa azione cancella profilo, materiali, progressi, acquisti e ticket. Non può essere annullata.',
              icon: 'trash' as const,
            }
          : {
            title: 'Vuoi uscire?',
            message: 'Dovrai inserire nuovamente email e password. I dati online non verranno eliminati.',
            icon: 'logout' as const,
          };

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <ScreenEntryLoader label="Carico il profilo…" />
        <View style={styles.profileTop}>
          <Animated.View style={[styles.avatar, {
            backgroundColor: c.primary,
            borderColor: avatarFrame ? c.accentForeground : 'transparent',
            borderWidth: avatarFrame ? 3 : 0,
            shadowColor: avatarFrame ? c.primary : 'transparent',
            shadowOpacity: avatarFrame?.id === 'avatar_glow_frame' ? profilePulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] }) : 0,
            shadowRadius: avatarFrame?.id === 'avatar_glow_frame' ? 12 : 0,
            elevation: avatarFrame ? 5 : 0,
          }]}><AppIcon name={profileIconFor(equippedProfileIcon?.id)} size={25} color={c.primaryForeground} /></Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.foreground }]}>{account?.username ?? 'Il tuo profilo'}</Text>
            {equippedTitle ? <Text style={[styles.equippedTitle, { color: c.primary }]}>{equippedTitle.title.replaceAll('"', '')}</Text> : null}
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

        <View style={[styles.effectBanner, { backgroundColor: c.accent, borderColor: c.primary }]}>
          <View style={[styles.effectIcon, { backgroundColor: c.primary }]}>
            <AppIcon name={equippedAnimation?.icon as AppIconName ?? 'sparkles'} size={16} color={c.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: c.accentForeground }]}>EFFETTO EQUIPAGGIATO</Text>
            <Text style={[styles.effectTitle, { color: c.accentForeground }]}>
              {equippedAnimation?.title ?? 'Nessuna animazione selezionata'}
            </Text>
          </View>
          {equippedAnimation ? <AppIcon name="circle-check" size={16} color={c.accentForeground} /> : null}
        </View>

        <SectionTitle eyebrow="I tuoi dati" title="Riepilogo" />
        <View style={styles.metrics}>
          <View style={[styles.metric, { backgroundColor: c.card, borderColor: statsDecoration ? c.primary : 'transparent', borderWidth: statsDecoration ? 2 : 0 }]}><Text style={[styles.metricValue, { color: c.primary }]}>{wallet}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>punti</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card, borderColor: statsDecoration ? c.primary : 'transparent', borderWidth: statsDecoration ? 2 : 0 }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{xp}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>XP</Text></View>
          <View style={[styles.metric, { backgroundColor: c.card, borderColor: statsDecoration ? c.primary : 'transparent', borderWidth: statsDecoration ? 2 : 0 }]}><Text style={[styles.metricValue, { color: c.foreground }]}>{streak}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>giorni attivi</Text></View>
        </View>

        <SectionTitle eyebrow="Collezione" title="Distintivi" action={`${badges.length} sbloccati`} />
        <View style={[styles.badgesCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {badges.length ? badges.map((badge) => (
            <View key={badge.id} style={styles.badgeItem}>
              <View style={[styles.badgeIcon, { backgroundColor: c.accent }]}>
                <AppIcon name={badge.icon as AppIconName} size={16} color={c.accentForeground} />
              </View>
              <Text style={[styles.badgeText, { color: c.foreground }]} numberOfLines={2}>{badge.title}</Text>
            </View>
          )) : (
            <View style={styles.emptyBadges}>
              <AppIcon name="award" size={17} color={c.mutedForeground} />
              <Text style={[styles.small, { color: c.mutedForeground }]}>Sblocca un distintivo nel negozio per iniziare la collezione.</Text>
            </View>
          )}
        </View>

        <SectionTitle eyebrow="Assistenza" title="Le tue richieste" />
        {notificationTicket ? (
          <View
            testID="ticket-aggiornato"
            style={[styles.supportNotice, { backgroundColor: c.accent, borderColor: c.primary }]}
          >
            <AppIcon name="bell" size={17} color={c.accentForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketTitle, { color: c.accentForeground }]}>
                Richiesta aggiornata
              </Text>
              <Text style={[styles.small, { color: c.accentForeground }]} numberOfLines={2}>
                {notificationTicket.subject}
              </Text>
            </View>
          </View>
        ) : null}
        {unreadSupportCount > 0 ? (
          <Pressable
            testID="avviso-risposta-assistenza"
            onPress={openSuggestion}
            style={[styles.supportNotice, { backgroundColor: c.accent, borderColor: c.primary }]}
          >
            <AppIcon name="bell" size={17} color={c.accentForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketTitle, { color: c.accentForeground }]}>
                {unreadSupportCount === 1 ? 'Hai una nuova risposta' : `Hai ${unreadSupportCount} nuove risposte`}
              </Text>
            <Text style={[styles.small, { color: c.accentForeground }]}>Apri le richieste per leggerle.</Text>
            </View>
            <AppIcon name="chevron-right" size={14} color={c.accentForeground} />
          </Pressable>
        ) : null}
        {tickets.length ? tickets.slice(0, 3).map((ticket) => (
          <Pressable key={ticket.id} onPress={() => { if (ticket.unread) void markTicketRead(ticket.id); }} style={[styles.ticket, { backgroundColor: c.card, borderColor: ticket.unread ? c.primary : c.border }]}>
            <View style={[styles.ticketIcon, { backgroundColor: c.secondary }]}>
              <AppIcon name="support" size={15} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.ticketHeading}>
                <Text style={[styles.ticketTitle, { color: c.foreground, flex: 1 }]} numberOfLines={1}>{ticket.subject}</Text>
                {ticket.unread ? <View style={[styles.unreadDot, { backgroundColor: c.primary }]} /> : null}
              </View>
              <Text style={[styles.small, { color: c.mutedForeground }]}>
                #{ticket.id.slice(0, 8).toUpperCase()} · {ticket.category} · {ticketStatusLabel(ticket.status)}
              </Text>
              {ticket.messages?.filter((entry) => entry.authorRole === 'admin').slice(-1).map((entry) => (
                <Text key={entry.id} style={[styles.small, { color: c.primary, marginTop: 4 }]} numberOfLines={2}>Assistenza: {entry.message}</Text>
              ))}
            </View>
          </Pressable>
        )) : (
           <Pressable testID="apri-primo-ticket" onPress={openSuggestion} style={[styles.emptyTicket, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="support" size={18} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketTitle, { color: c.foreground }]}>Hai un’idea o hai trovato un errore?</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>Proponi una modifica direttamente dall’app.</Text>
            </View>
            <AppIcon name="chevron-right" size={14} color={c.mutedForeground} />
          </Pressable>
        )}

        <SectionTitle eyebrow="Impostazioni" title="Preferenze" />
        <View testID="percorso-statico" style={[styles.preference, { borderBottomColor: c.border }]}>
          <View style={[styles.prefIcon, { backgroundColor: c.secondary }]}><AppIcon name="book" size={15} color={c.foreground} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.prefText, { color: c.foreground }]}>Percorso di studio</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>Scelta definitiva: determina i contenuti dell’app</Text>
          </View>
          <AppIcon name="shield" size={14} color={c.mutedForeground} />
        </View>
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
        <View style={[styles.preference, { borderBottomColor: c.border }]}>
          <View style={[styles.prefIcon, { backgroundColor: c.secondary }]}><AppIcon name="sparkles" size={15} color={c.foreground} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.prefText, { color: c.foreground }]}>Feedback sonoro</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>Suoni e vibrazioni per premi e risposte</Text>
          </View>
          <Switch
            testID="toggle-feedback-sonoro"
            value={soundEnabled}
            disabled={updatingSound}
            onValueChange={(next) => {
              setUpdatingSound(true);
              void setSoundEnabled(next).finally(() => setUpdatingSound(false));
            }}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor={c.background}
          />
        </View>
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
          : modal === 'elimina-account'
            ? [
              {
                label: deletingAccount ? 'Eliminazione…' : 'Elimina definitivamente',
                variant: 'pericolo' as const,
                onPress: () => {
                  if (deletingAccount) return;
                  setDeletingAccount(true);
                  void deleteAccount().then((result) => {
                    setDeletingAccount(false);
                    if (result.ok) router.replace('/accesso');
                    else {
                      setFeedback({ title: 'Eliminazione non riuscita', message: result.message, success: false });
                      setModal('esito');
                    }
                  });
                },
              },
              { label: 'Annulla', onPress: () => setModal(null) },
            ]
          : modal === 'proponi-modifica'
            ? [
              { label: submitting ? 'Invio…' : 'Invia proposta', variant: 'primaria', onPress: () => { void submitTicket(); } },
              { label: 'Annulla', onPress: () => setModal(null) },
            ]
            : [{ label: 'Ho capito', variant: 'primaria', onPress: () => setModal(null) }]}
      >
        {modal === 'proponi-modifica' ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: c.foreground }]}>Oggetto</Text>
            <TextInput
              testID="ticket-oggetto"
              value={subject}
              onChangeText={setSubject}
              placeholder="Es. Aggiungi una modalità di ripasso"
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
              placeholder="Descrivi l’idea o il problema in almeno 10 caratteri."
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
  equippedTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 3 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 },
  edit: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rank: { borderWidth: 1, borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 5 },
  rankTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  rankBadge: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  effectBanner: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  effectIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  effectTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, borderRadius: 16, padding: 13 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 25, marginBottom: 3 },
  badgesCard: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeItem: { width: '30%', minWidth: 82, alignItems: 'center', gap: 6 },
  badgeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 13, textAlign: 'center' },
  emptyBadges: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  preference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  prefIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  ticket: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  supportNotice: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'center' },
  ticketHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  emptyTicket: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center' },
  ticketIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ticketTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 3 },
  footer: { alignItems: 'center', gap: 8, marginTop: 12 },
  form: { marginTop: 16, gap: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 5 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, fontFamily: 'Inter_500Medium', fontSize: 13 },
  textarea: { minHeight: 92 },
  textareaSmall: { minHeight: 62 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  category: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 },
  categoryText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});