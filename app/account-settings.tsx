import { router } from 'expo-router';
import { useUser } from '@clerk/expo';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';

export default function AccountSettingsScreen() {
  const c = useColors();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!user || busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (newPassword.trim()) {
        await (user as unknown as { updatePassword: (args: { currentPassword: string; newPassword: string }) => Promise<unknown> })
          .updatePassword({ currentPassword, newPassword });
      }
      if (email.trim() && email.trim() !== user.primaryEmailAddress?.emailAddress) {
        const address = await (user as unknown as { createEmailAddress: (args: { email: string }) => Promise<{ prepareVerification: (args: { strategy: string }) => Promise<unknown> }> })
          .createEmailAddress({ email: email.trim() });
        await address.prepareVerification({ strategy: 'email_link' });
        setStatus('Controlla la nuova email e conferma il link. Diventerà attiva solo dopo la verifica.');
      } else {
        setStatus('Impostazioni aggiornate.');
      }
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Impossibile aggiornare le impostazioni.');
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
      <Text style={[styles.description, { color: c.mutedForeground }]}>Il percorso di studio resta bloccato perché determina i contenuti dell’app.</Text>
       <Text style={[styles.label, { color: c.foreground }]}>Nome utente (non modificabile)</Text>
       <TextInput value={username} editable={false} autoCapitalize="none" style={[styles.input, styles.disabledInput, { color: c.mutedForeground, backgroundColor: c.secondary, borderColor: c.border }]} />
      <Text style={[styles.label, { color: c.foreground }]}>Nuova email</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
      <Text style={[styles.label, { color: c.foreground }]}>Password attuale</Text>
      <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
      <Text style={[styles.label, { color: c.foreground }]}>Nuova password</Text>
      <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={[styles.input, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]} />
      <Pressable disabled={busy} onPress={() => void save()} style={[styles.button, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.buttonText, { color: c.primaryForeground }]}>{busy ? 'Salvataggio…' : 'Salva modifiche'}</Text>
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
  status: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 4 },
});