import { useSignIn, useSignUp } from '@clerk/expo';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PrimaryButton } from '@/components/Ui';
import { useColors } from '@/hooks/useColors';

type Mode = 'accesso' | 'registrazione';
type Step = 'dati' | 'verifica';

function authErrorMessage(error: unknown) {
  const candidate = error as {
    message?: string;
    errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
  } | null;
  const first = candidate?.errors?.[0];

  switch (first?.code) {
    case 'form_identifier_not_found':
      return 'Non esiste un account associato a questa email.';
    case 'form_password_incorrect':
      return 'La password inserita non è corretta.';
    case 'form_identifier_exists':
      return 'Esiste già un account associato a questa email.';
    case 'form_password_pwned':
      return 'Questa password è comparsa in una violazione di dati. Scegline una diversa.';
    case 'form_code_incorrect':
      return 'Il codice inserito non è corretto. Controlla l’email e riprova.';
    case 'verification_expired':
      return 'Il codice è scaduto. Richiedine uno nuovo.';
    default:
      return first?.longMessage ?? first?.message ?? candidate?.message ?? 'Non è stato possibile completare l’operazione. Riprova.';
  }
}

export default function AccessScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const [mode, setMode] = useState<Mode>('registrazione');
  const [step, setStep] = useState<Step>('dati');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const loading = signInStatus === 'fetching' || signUpStatus === 'fetching';

  const changeMode = (nextMode: Mode) => {
    signIn.reset();
    signUp.reset();
    setMode(nextMode);
    setStep('dati');
    setPassword('');
    setCode('');
    setModal(null);
  };

  const finishSession = async (destination: '/onboarding' | '/(tabs)') => {
    const flow = mode === 'registrazione' ? signUp : signIn;
    await flow.finalize({
      navigate: () => {
        router.replace(destination);
      },
    });
  };

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (!cleanEmail || !password || (mode === 'registrazione' && cleanUsername.length < 2)) {
      setModal({
        title: 'Controlla i dati',
        message: mode === 'registrazione'
          ? 'Inserisci un nome utente di almeno 2 caratteri, un’email valida e una password.'
          : 'Inserisci email e password per continuare.',
      });
      return;
    }

    try {
      if (mode === 'registrazione') {
        const { error } = await signUp.password({
          emailAddress: cleanEmail,
          password,
          unsafeMetadata: { eduaiUsername: cleanUsername },
          locale: 'it-IT',
        });
        if (error) throw error;
        await signUp.verifications.sendEmailCode();
        setStep('verifica');
        return;
      }

      const { error } = await signIn.password({ emailAddress: cleanEmail, password });
      if (error) throw error;

      if (signIn.status === 'complete') {
        await finishSession('/(tabs)');
      } else {
        setModal({
          title: 'Verifica aggiuntiva richiesta',
          message: 'Questo account richiede una verifica aggiuntiva non ancora supportata nell’app.',
        });
      }
    } catch (error) {
      setModal({ title: 'Accesso non riuscito', message: authErrorMessage(error) });
    }
  };

  const verifyEmail = async () => {
    if (code.trim().length < 4) {
      setModal({ title: 'Codice incompleto', message: 'Inserisci il codice ricevuto via email.' });
      return;
    }

    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) throw error;

      if (signUp.status === 'complete') {
        await finishSession('/onboarding');
      } else {
        setModal({
          title: 'Registrazione incompleta',
          message: 'Manca ancora un passaggio per completare la registrazione. Riprova tra poco.',
        });
      }
    } catch (error) {
      setModal({ title: 'Codice non valido', message: authErrorMessage(error) });
    }
  };

  const resendCode = async () => {
    try {
      await signUp.verifications.sendEmailCode();
      setModal({ title: 'Nuovo codice inviato', message: `Controlla la casella ${email.trim().toLowerCase()}.` });
    } catch (error) {
      setModal({ title: 'Invio non riuscito', message: authErrorMessage(error) });
    }
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
          {step === 'verifica'
            ? 'Verifica la tua email.'
            : mode === 'registrazione'
              ? 'Crea il tuo spazio di studio.'
              : 'Bentornato su EduAI.'}
        </Text>
        <Text style={[styles.intro, { color: c.mutedForeground }]}>
          {step === 'verifica'
            ? `Abbiamo inviato un codice a ${email.trim().toLowerCase()}. Inseriscilo per attivare l’account.`
            : mode === 'registrazione'
              ? 'Registrati per ritrovare materiali, progressi e premi su tutti i tuoi dispositivi.'
              : 'Accedi con l’account EduAI che hai già creato.'}
        </Text>

        {step === 'dati' ? (
          <>
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
                    placeholder="La tua password"
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

            <PrimaryButton onPress={submit} disabled={loading} icon={mode === 'registrazione' ? 'graduation-cap' : 'arrow-up-right'}>
              {loading ? 'Attendi…' : mode === 'registrazione' ? 'Crea il mio account' : 'Accedi'}
            </PrimaryButton>
            {mode === 'registrazione' ? <View nativeID="clerk-captcha" /> : null}
          </>
        ) : (
          <View style={styles.verify}>
            <View>
              <Text style={[styles.label, { color: c.foreground }]}>Codice di verifica</Text>
              <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
                <AppIcon name="shield" size={16} color={c.mutedForeground} />
                <TextInput
                  testID="codice-verifica"
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={c.mutedForeground}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  returnKeyType="done"
                  onSubmitEditing={verifyEmail}
                  maxLength={8}
                  style={[styles.input, styles.codeInput, { color: c.foreground }]}
                />
              </View>
            </View>
            <PrimaryButton onPress={verifyEmail} disabled={loading} icon="circle-check">
              {loading ? 'Verifica in corso…' : 'Verifica e continua'}
            </PrimaryButton>
            <Pressable testID="invia-nuovo-codice" onPress={resendCode} disabled={loading}>
              <Text style={[styles.link, { color: c.primary }]}>Invia un nuovo codice</Text>
            </Pressable>
            <Pressable testID="torna-ai-dati" onPress={() => { signUp.reset(); setStep('dati'); setCode(''); }} disabled={loading}>
              <Text style={[styles.link, { color: c.mutedForeground }]}>Torna ai dati dell’account</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.security, { backgroundColor: c.card, borderColor: c.border }]}>
          <AppIcon name="shield" size={15} color={c.primary} />
          <Text style={[styles.securityText, { color: c.mutedForeground }]}>
            Accesso protetto e sincronizzazione online tramite Clerk.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>

      <AppModal
        visible={Boolean(modal)}
        title={modal?.title ?? ''}
        message={modal?.message}
        icon={modal?.title === 'Nuovo codice inviato' ? 'circle-check' : 'warning'}
        onDismiss={() => setModal(null)}
        actions={[{ label: 'Ho capito', variant: 'primaria', onPress: () => setModal(null) }]}
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
  form: { gap: 14, marginTop: 4 },
  verify: { gap: 16, marginTop: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  inputWrap: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  input: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, paddingVertical: 14 },
  codeInput: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: 4 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 13, textAlign: 'center', paddingVertical: 5 },
  security: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  securityText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17 },
});