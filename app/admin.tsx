import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  customFetch,
  getListAdminTicketsQueryKey,
  getListAdminUsersQueryKey,
  setAdminSessionTokenGetter,
  useListAdminTickets,
  useListAdminUsers,
  useReplyToAdminTicket,
  type AdminTicket,
} from '@workspace/api-client-react';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { useColors } from '@/hooks/useColors';

const ADMIN_SESSION_KEY = 'eduai:admin-session';

export default function AdminScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setAdminSessionTokenGetter(() => AsyncStorage.getItem(ADMIN_SESSION_KEY));
    void AsyncStorage.getItem(ADMIN_SESSION_KEY).then((value) => {
      setSession(value);
      setLoading(false);
    });
    return () => setAdminSessionTokenGetter(null);
  }, []);

  const users = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey(), enabled: Boolean(session) } });
  const tickets = useListAdminTickets({ query: { queryKey: getListAdminTicketsQueryKey(), enabled: Boolean(session) } });
  const reply = useReplyToAdminTicket();
  const openCount = useMemo(() => tickets.data?.filter((ticket) => ticket.status !== 'closed').length ?? 0, [tickets.data]);

  const login = async () => {
    setLoginError(null);
    try {
      const result = await customFetch<{ sessionToken: string }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ secret: secret.trim() }),
        responseType: 'json',
      });
      await AsyncStorage.setItem(ADMIN_SESSION_KEY, result.sessionToken);
      setSecret('');
      setSession(result.sessionToken);
    } catch {
      setLoginError('Codice non valido o accesso amministratore non configurato.');
    }
  };

  const logout = async () => {
    try { await customFetch('/api/admin/auth/logout', { method: 'POST' }); } catch { /* session may already be expired */ }
    await AsyncStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
  };

  const submit = async (close: boolean) => {
    if (!selected || draft.trim().length < 2) return;
    try {
      await reply.mutateAsync({ ticketId: selected.id, data: { message: draft.trim(), close } });
      setDraft('');
      setSelected(null);
      await tickets.refetch();
      setNotice(close ? 'Ticket chiuso e risposta salvata.' : 'Risposta inviata al ticket.');
    } catch {
      setNotice('Sessione scaduta o impossibile aggiornare il ticket.');
    }
  };

  if (loading) return <View style={[styles.denied, { backgroundColor: c.background }]} />;
  if (!session) {
    return (
      <View style={[styles.denied, { backgroundColor: c.background, paddingTop: insets.top + 24 }]}>
        <AppIcon name="shield" size={34} color={c.primary} />
        <Text style={[styles.title, { color: c.foreground }]}>Accesso assistenza</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>Inserisci il codice amministratore per aprire la console.</Text>
        <TextInput
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Codice amministratore"
          placeholderTextColor={c.mutedForeground}
          style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.card }]}
        />
        {loginError ? <Text style={[styles.body, { color: c.destructive }]}>{loginError}</Text> : null}
        <Pressable onPress={() => void login()} style={[styles.primary, { backgroundColor: c.primary }]}>
          <Text style={[styles.primaryText, { color: c.primaryForeground }]}>Accedi</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={[styles.body, { color: c.mutedForeground }]}>Torna al profilo</Text></Pressable>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.header}>
          <View><Text style={[styles.eyebrow, { color: c.primary }]}>AREA PRIVATA</Text><Text style={[styles.title, { color: c.foreground }]}>Assistenza</Text></View>
          <Pressable onPress={() => void logout()}><Text style={[styles.body, { color: c.primary }]}>Esci</Text></Pressable>
        </View>
        <View style={[styles.summary, { backgroundColor: c.primary }]}><Text style={[styles.summaryValue, { color: c.primaryForeground }]}>{openCount}</Text><Text style={[styles.summaryLabel, { color: c.primaryForeground }]}>ticket da gestire</Text></View>
        <Text style={[styles.section, { color: c.foreground }]}>Ticket e cronologia</Text>
        {tickets.isLoading ? <Text style={[styles.body, { color: c.mutedForeground }]}>Caricamento ticket…</Text> : tickets.data?.map((ticket) => (
          <Pressable key={ticket.id} onPress={() => setSelected(ticket)} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.primary }]}>#{ticket.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={[styles.cardTitle, { color: c.foreground }]}>{ticket.subject}</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]}>{ticket.user?.username ?? ticket.userId} · {ticket.status}</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]} numberOfLines={2}>{ticket.messages.at(-1)?.message}</Text>
          </Pressable>
        ))}
        <Text style={[styles.section, { color: c.foreground }]}>Utenti</Text>
        <Text style={[styles.body, { color: c.mutedForeground }]}>{users.data?.length ?? 0} utenti registrati</Text>
      </ScrollView>
      <AppModal visible={Boolean(selected)} title={selected ? `Ticket #${selected.id.slice(0, 8).toUpperCase()}` : ''} message={selected?.user?.email ?? selected?.userId} icon="support" onDismiss={() => setSelected(null)} actions={[
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
  content: { paddingHorizontal: 20, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 }, title: { fontFamily: 'Inter_700Bold', fontSize: 27 }, section: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 10 }, body: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 }, summary: { borderRadius: 20, padding: 18 }, summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 34 }, summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 4 }, cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 }, thread: { gap: 8, marginTop: 12 }, message: { borderRadius: 12, padding: 10 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 48, marginTop: 12, padding: 10, fontFamily: 'Inter_500Medium', fontSize: 13 }, primary: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }, primaryText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, denied: { flex: 1, alignItems: 'center', paddingHorizontal: 28, gap: 14 },
});