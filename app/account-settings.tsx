import { router } from 'expo-router';
import { useUser } from '@clerk/expo';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { getGetProfileQueryKey, upsertProfile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';

export default function AccountSettingsScreen() {
  const c = useColors();
  const { user } = useUser();
  const { account } = useApp();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(account?.username ?? user?.username ?? '');
  const [email, setEmail] = useState(account?.email ?? user?.primaryEmailAddress?.emailAddress ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const saveUsername = async () => {
    if (!user || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const nextUsername = username.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(nextUsername)) {
        setStatus('Username non valido: usa 3–20 caratteri, solo lettere, numeri e underscore.');
        return;
      }
      const updated = await upsertProfile({ username: nextUsername, email: account?.email ?? user.primaryEmailAddress?.emailAddress });
      queryClient.setQueryData(getGetProfileQueryKey(), updated);
      setStatus('Nome utente aggiornato.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(/taken|already|occupat|unique/i.test(message) ? 'Username già occupato. Scegline uno diverso.' : (message || 'Impossibile aggiornare il nome utente.'));
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async () => {
    if (!user || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const nextEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        setStatus('Inserisci un indirizzo email valido.');
        return;
      }
      if (nextEmail === user.primaryEmailAddress?.emailAddress?.toLowerCase()) {
        setStatus('L’email è già aggiornata.');
        return;
      }
      const address = await (user as unknown as { createEmailAddress: (args: { email: string }) => Promise<{ prepareVerification: (args: { strategy: string }) => Promise<unknown> }> })
        .createEmailAddress({ email: nextEmail });
      await address.prepareVerification({ strategy: 'email_link' });
      setStatus('Controlla la nuova email e conferma il link. Diventerà attiva solo dopo la verifica.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Impossibile aggiornare l’email.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!user || busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (!currentPassword || !newPassword) {
        setStatus('Inserisci la password attuale e quella nuova.');
        return;
      }
      await (user as unknown as { updatePassword: (args: { currentPassword: string; newPassword: string }) => Promise<unknown> })
        .updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setStatus('Password aggiornata.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(message || 'Impossibile aggiornare la password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <AppIcon name="chevron-right" size={14} color={c.mutedForeground} />
        <Text style={[styles.backText, { color: c.mutedForeground }]}>Profilo</Text>
      </Pressable>
      <Text style={[styles.eyebrow, { color: c.primary }]}>ACCOUNT</Text>
      <Text style={[styles.title, { color: c.foreground }]}>Impostazioni</Text>
      <Text style={[styles.description, { color: c.mutedForeground }]}>Modifica ogni informazione separatamente. Il percorso di studio resta bloccato perché determina i contenuti dell’app.</Text>
       <Text style={[styles.label, { color: c.foreground }]}>Nome utente</Text>
       <TextInput
         value={username}
         onChangeText={setUsername}
         editable={!busy}
         autoCapitalize="none"
         autoCorrect={false}
         maxLength={20}
         placeholder="es. mario_rossi"
         placeholderTextColor={c.mutedForeground}
         style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]}
       />
       <Text style={[styles.helper, { color: c.mutedForeground }]}>3–20 caratteri · lettere, numeri e underscore</Text>
       <Pressable disabled={busy} onPress={() => void saveUsername()} style={[styles.secondaryButton, { borderColor: c.primary, opacity: busy ? 0.6 : 1 }]}>
         <Text style={[styles.secondaryButtonText, { color: c.primary }]}>Salva nome utente</Text>
       </Pressable>
      <Text style={[styles.label, { color: c.foreground }]}>Nuova email</Text>
       <TextInput value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
       <Pressable disabled={busy} onPress={() => void saveEmail()} style={[styles.secondaryButton, { borderColor: c.primary, opacity: busy ? 0.6 : 1 }]}>
         <Text style={[styles.secondaryButtonText, { color: c.primary }]}>Salva email</Text>
       </Pressable>
      <Text style={[styles.label, { color: c.foreground }]}>Password attuale</Text>
       <TextInput value={currentPassword} onChangeText={setCurrentPassword} editable={!busy} secureTextEntry style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
      <Text style={[styles.label, { color: c.foreground }]}>Nuova password</Text>
       <TextInput value={newPassword} onChangeText={setNewPassword} editable={!busy} secureTextEntry style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
       <Pressable disabled={busy} onPress={() => void savePassword()} style={[styles.secondaryButton, { borderColor: c.primary, opacity: busy ? 0.6 : 1 }]}>
         <Text style={[styles.secondaryButtonText, { color: c.primary }]}>{busy ? 'Salvataggio…' : 'Salva password'}</Text>
      </Pressable>
      {status ? <Text style={[styles.status, { color: c.mutedForeground }]}>{status}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ scaleX: -1 }] },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, transform: [{ scaleX: -1 }] },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginTop: 18 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  description: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 5 },
  input: { borderWidth: 1, borderRadius: 14, padding: 13, fontFamily: 'Inter_500Medium', fontSize: 15 },
  disabledInput: { opacity: 0.8 },
  button: { borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 10 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderRadius: 14, padding: 13, alignItems: 'center', marginTop: -3 },
  secondaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  status: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 4 },
  helper: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: -5 },
});