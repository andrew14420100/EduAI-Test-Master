import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PrimaryButton } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Mode = 'accesso' | 'registrazione';

export default function AccessScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { account, finishAuthentication, level, login, register } = useApp();
  const [mode, setMode] = useState<Mode>(account ? 'accesso' : 'registrazione');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string; success?: boolean } | null>(null);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setPassword('');
    setModal(null);
    if (nextMode === 'accesso') setEmail(account?.email ?? '');
  };

  const goForward = () => {
    finishAuthentication();
    router.replace(level ? '/(tabs)' : '/onboarding');
  };

  const submit = () => {
    const result = mode === 'registrazione'
      ? register(username, email, password)
      : login(email, password);

    if (!result.ok) {
      setModal({ title: 'Controlla i dati', message: result.message });
      return;
    }
    setModal({
      title: mode === 'registrazione' ? 'Account creato' : 'Bentornato',
      message: mode === 'registrazione'
        ? 'Il tuo accesso è stato salvato su questo dispositivo. Ora scegli il tuo percorso di studio.'
        : 'Accesso effettuato correttamente.',
      success: true,
    });
  };

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        bottomOffset={64}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={[styles.logo, { backgroundColor: c.primary }]}>
          <AppIcon name="graduation-cap" size={26} color={c.primaryForeground} />
        </View>
        <Text style={[styles.eyebrow, { color: c.primary }]}>EDUAI TEST MASTER</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>
          {mode === 'registrazione' ? 'Crea il tuo spazio di studio.' : 'Bentornato su EduAI.'}
        </Text>
        <Text style={[styles.intro, { color: c.mutedForeground }]}>
          {mode === 'registrazione'
            ? 'Registrati per conservare percorso, materiali e progressi sul dispositivo.'
            : 'Accedi con le credenziali salvate su questo dispositivo.'}
        </Text>

        {account ? (
          <View style={[styles.accountHint, { backgroundColor: c.card, borderColor: c.border }]}>
            <AppIcon name="lock" size={15} color={c.primary} />
            <Text style={[styles.accountHintText, { color: c.mutedForeground }]}>Account locale configurato: accedi per continuare.</Text>
          </View>
        ) : (
          <View style={[styles.switcher, { backgroundColor: c.card }]}>
            <Pressable
              testID="modalita-registrazione"
              onPress={() => changeMode('registrazione')}
              style={[styles.switchButton, { backgroundColor: mode === 'registrazione' ? c.accent : 'transparent' }]}
            >
              <Text style={[styles.switchText, { color: mode === 'registrazione' ? c.accentForeground : c.mutedForeground }]}>Registrati</Text>
            </Pressable>
            <Pressable
              testID="modalita-accesso"
              onPress={() => changeMode('accesso')}
              style={[styles.switchButton, { backgroundColor: mode === 'accesso' ? c.accent : 'transparent' }]}
            >
              <Text style={[styles.switchText, { color: mode === 'accesso' ? c.accentForeground : c.mutedForeground }]}>Accedi</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.form}>
          {mode === 'registrazione' ? (
            <View>
              <Text style={[styles.label, { color: c.foreground }]}>Nome utente</Text>
              <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
                <AppIcon name="profile" size={16} color={c.mutedForeground} />
                <TextInput
                  testID="nome-utente"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Come vuoi essere chiamato?"
                  placeholderTextColor={c.mutedForeground}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                  style={[styles.input, { color: c.foreground }]}
                />
              </View>
            </View>
          ) : null}

          <View>
            <Text style={[styles.label, { color: c.foreground }]}>Email</Text>
            <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
              <AppIcon name="email" size={16} color={c.mutedForeground} />
              <TextInput
                testID="email"
                value={email}
                onChangeText={setEmail}
                placeholder="nome@esempio.it"
                placeholderTextColor={c.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
          </View>

          <View>
            <Text style={[styles.label, { color: c.foreground }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
              <AppIcon name="password" size={16} color={c.mutedForeground} />
              <TextInput
                testID="password"
                value={password}
                onChangeText={setPassword}
                placeholder="Almeno 6 caratteri"
                placeholderTextColor={c.mutedForeground}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'registrazione' ? 'new-password' : 'current-password'}
                returnKeyType="done"
                onSubmitEditing={submit}
                style={[styles.input, { color: c.foreground }]}
              />
              <Pressable accessibilityLabel={passwordVisible ? 'Nascondi password' : 'Mostra password'} onPress={() => setPasswordVisible((visible) => !visible)} hitSlop={10}>
                <AppIcon name={passwordVisible ? 'eye-slash' : 'eye'} size={16} color={c.mutedForeground} />
              </Pressable>
            </View>
          </View>
        </View>

        <PrimaryButton onPress={submit} icon={mode === 'registrazione' ? 'graduation-cap' : 'arrow-up-right'}>
          {mode === 'registrazione' ? 'Crea il mio account' : 'Accedi'}
        </PrimaryButton>
        <Text style={[styles.note, { color: c.mutedForeground }]}>
          In questa fase l’account è salvato solo su questo dispositivo e non viene sincronizzato online.
        </Text>
      </KeyboardAwareScrollViewCompat>

      <AppModal
        visible={Boolean(modal)}
        title={modal?.title ?? ''}
        message={modal?.message}
        icon={modal?.success ? 'circle-check' : 'warning'}
        onDismiss={() => {
          if (modal?.success) {
            setModal(null);
            goForward();
          } else {
            setModal(null);
          }
        }}
        actions={modal?.success
          ? [{ label: 'Continua', variant: 'primaria', onPress: () => { setModal(null); goForward(); } }]
          : [{ label: 'Ho capito', variant: 'primaria', onPress: () => setModal(null) }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  logo: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.7, marginTop: 8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 31, lineHeight: 37, letterSpacing: -1, maxWidth: 350 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, maxWidth: 355 },
  switcher: { flexDirection: 'row', borderRadius: 16, padding: 4, marginTop: 5 },
  switchButton: { flex: 1, minHeight: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  accountHint: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  accountHintText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  form: { gap: 14, marginTop: 4 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  inputWrap: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  input: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, paddingVertical: 14 },
  note: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 2 },
});