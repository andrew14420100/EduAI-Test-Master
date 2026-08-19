import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getListAdminTicketsQueryKey, getListAdminUsersQueryKey, useListAdminTickets, useListAdminUsers, useReplyToAdminTicket, type AdminTicket } from '@workspace/api-client-react';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { useColors } from '@/hooks/useColors';

export default function AdminScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';
  const users = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey(), enabled: Boolean(isLoaded && isAdmin) } });
  const tickets = useListAdminTickets({ query: { queryKey: getListAdminTicketsQueryKey(), enabled: Boolean(isLoaded && isAdmin) } });
  const reply = useReplyToAdminTicket();
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const openCount = useMemo(() => tickets.data?.filter((ticket) => ticket.status !== 'closed').length ?? 0, [tickets.data]);

  if (isLoaded && !isAdmin) {
    return (
      <View style={[styles.denied, { backgroundColor: c.background, paddingTop: insets.top + 24 }]}>
        <AppIcon name="shield" size={34} color={c.destructive} />
        <Text style={[styles.title, { color: c.foreground }]}>Area riservata</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>Questa console è disponibile solo per l’account con ruolo amministratore.</Text>
        <Pressable onPress={() => router.back()} style={[styles.primary, { backgroundColor: c.primary }]}><Text style={[styles.primaryText, { color: c.primaryForeground }]}>Torna al profilo</Text></Pressable>
      </View>
    );
  }

  const submit = async (close: boolean) => {
    if (!selected || draft.trim().length < 2) return;
    try {
      await reply.mutateAsync({ ticketId: selected.id, data: { message: draft.trim(), close } });
      setDraft('');
      setSelected(null);
      await tickets.refetch();
      setNotice(close ? 'Ticket chiuso e risposta salvata.' : 'Risposta inviata al ticket.');
    } catch {
      setNotice('Non è stato possibile aggiornare il ticket.');
    }
  };

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: c.primary }]}>AREA PRIVATA</Text><Text style={[styles.title, { color: c.foreground }]}>Assistenza</Text></View><Pressable onPress={() => router.back()}><AppIcon name="close" size={22} color={c.foreground} /></Pressable></View>
        <View style={[styles.summary, { backgroundColor: c.primary }]}><Text style={[styles.summaryValue, { color: c.primaryForeground }]}>{openCount}</Text><Text style={[styles.summaryLabel, { color: c.primaryForeground }]}>ticket da gestire</Text></View>
        <Text style={[styles.section, { color: c.foreground }]}>Ticket e cronologia</Text>
        {tickets.isLoading ? <Text style={[styles.body, { color: c.mutedForeground }]}>Caricamento ticket…</Text> : tickets.data?.map((ticket) => (
          <Pressable key={ticket.id} onPress={() => setSelected(ticket)} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.foreground }]}>{ticket.subject}</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]}>{ticket.user?.username ?? ticket.userId} · {ticket.status}</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]} numberOfLines={2}>{ticket.messages.at(-1)?.message}</Text>
          </Pressable>
        ))}
        <Text style={[styles.section, { color: c.foreground }]}>Utenti</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>{users.data?.length ?? 0} utenti registrati</Text>
        <View style={[styles.emailNote, { backgroundColor: c.secondary, borderColor: c.border }]}><AppIcon name="email" size={16} color={c.foreground} /><Text style={[styles.body, { color: c.mutedForeground, flex: 1 }]}>Invio email disabilitato: collega prima un provider email autorizzato. Nessuna comunicazione viene inviata dalla console.</Text></View>
      </ScrollView>
      <AppModal visible={Boolean(selected)} title={selected?.subject ?? ''} message={selected?.user?.email ?? selected?.userId} icon="support" onDismiss={() => setSelected(null)} actions={[
        { label: reply.isPending ? 'Invio…' : 'Rispondi', variant: 'primaria', onPress: () => { void submit(false); } },
        { label: 'Rispondi e chiudi', variant: 'pericolo', onPress: () => { void submit(true); } },
        { label: 'Annulla', onPress: () => setSelected(null) },
      ]}>
        <View style={styles.thread}>{selected?.messages.map((entry) => <View key={entry.id} style={[styles.message, { backgroundColor: entry.authorRole === 'admin' ? c.accent : c.secondary }]}><Text style={[styles.body, { color: entry.authorRole === 'admin' ? c.accentForeground : c.secondaryForeground }]}>{entry.authorRole === 'admin' ? 'Assistenza' : 'Utente'} · {entry.message}</Text></View>)}</View>
        <TextInput value={draft} onChangeText={setDraft} multiline placeholder="Scrivi una risposta utile e completa…" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} />
      </AppModal>
      <AppModal visible={Boolean(notice)} title="Assistenza" message={notice ?? ''} icon="circle-check" onDismiss={() => setNotice(null)} actions={[{ label: 'Continua', variant: 'primaria', onPress: () => setNotice(null) }]} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 }, title: { fontFamily: 'Inter_700Bold', fontSize: 27 }, section: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 10 }, body: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 }, summary: { borderRadius: 20, padding: 18 }, summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 34 }, summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 4 }, cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 }, emailNote: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', gap: 9 }, thread: { gap: 8, marginTop: 12 }, message: { borderRadius: 12, padding: 10 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 92, marginTop: 12, padding: 10, fontFamily: 'Inter_500Medium', fontSize: 13, textAlignVertical: 'top' }, denied: { flex: 1, alignItems: 'center', paddingHorizontal: 28, gap: 14 }, primary: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }, primaryText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});