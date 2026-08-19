import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function ShopScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { wallet, theme, shop, buyItem, equipItem, useLightTheme } = useApp();
  const [message, setMessage] = useState<{ title: string; message: string; success: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const nextReward = shop.find((item) => !item.owned);
  const rewardProgress = nextReward ? Math.min(100, Math.round((wallet / nextReward.cost) * 100)) : 100;

  const purchase = async (id: string, title: string, cost: number, owned: boolean) => {
    if (busyId) return;
    if (owned) {
      setBusyId(id);
      const result = await equipItem(id);
      setBusyId(null);
      setMessage(result.ok
        ? { title: 'Oggetto equipaggiato', message: `${title} è ora attivo nel tuo profilo.`, success: true }
        : { title: 'Operazione non riuscita', message: result.message, success: false });
      return;
    }
    if (wallet < cost) {
      setMessage({ title: 'Punti insufficienti', message: `Ti servono ancora ${cost - wallet} punti per sbloccare questo premio.`, success: false });
      return;
    }
    setBusyId(id);
    const result = await buyItem(id);
    setBusyId(null);
    setMessage(result.ok
      ? { title: 'Oggetto sbloccato', message: `${title} è stato aggiunto alla tua collezione.`, success: true }
      : { title: 'Acquisto non riuscito', message: result.message, success: false });
  };
  const darkTheme = shop.find((item) => item.id === 'dark');
  const toggleTheme = async () => {
    if (!darkTheme?.owned || busyId) return;
    setBusyId('theme-toggle');
    const result = theme === 'dark'
      ? await useLightTheme()
      : await equipItem(darkTheme.id);
    setBusyId(null);
    setMessage(result.ok
      ? {
        title: theme === 'dark' ? 'Tema chiaro attivo' : 'Tema scuro attivo',
        message: theme === 'dark'
          ? 'Hai ripristinato l’aspetto chiaro di EduAI.'
          : 'La modalità scura è ora attiva su tutti i tuoi dispositivi.',
        success: true,
      }
      : { title: 'Tema non aggiornato', message: result.message, success: false });
  };

  return (
    <>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={[styles.eyebrow, { color: c.primary }]}>NEGOZIO PUNTI</Text><Text style={[styles.heading, { color: c.foreground }]}>Rendilo tuo</Text></View>
          <View style={[styles.wallet, { backgroundColor: c.accent }]}><AppIcon name="zap" size={14} color={c.accentForeground} /><Text style={[styles.walletText, { color: c.accentForeground }]}>{wallet}</Text></View>
        </View>
        <Text style={[styles.intro, { color: c.mutedForeground }]}>Supera le verifiche, guadagna punti e personalizza il tuo spazio di studio.</Text>
        <View style={[styles.balance, { backgroundColor: c.primary }]}>
          <Text style={[styles.balanceLabel, { color: c.primaryForeground }]}>PUNTI DISPONIBILI</Text>
          <Text style={[styles.balanceValue, { color: c.primaryForeground }]}>{wallet} <Text style={styles.pts}>punti</Text></Text>
        </View>
        <View style={[styles.rewardProgress, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.rewardRow}>
            <View>
              <Text style={[styles.rewardLabel, { color: c.primary }]}>PROSSIMO PREMIO</Text>
              <Text style={[styles.rewardTitle, { color: c.foreground }]}>{nextReward?.title ?? 'Collezione completata'}</Text>
            </View>
            <Text style={[styles.rewardAmount, { color: c.mutedForeground }]}>
              {nextReward ? `${wallet}/${nextReward.cost}` : '100%'}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.secondary }]}>
            <View style={[styles.fill, { backgroundColor: c.primary, width: `${rewardProgress}%` }]} />
          </View>
          <Text style={[styles.small, { color: c.mutedForeground }]}>
            {nextReward
              ? wallet >= nextReward.cost
                ? 'Hai abbastanza punti: puoi sbloccarlo ora.'
                : `Ti mancano ${nextReward.cost - wallet} punti.`
              : 'Hai sbloccato tutti gli oggetti disponibili.'}
          </Text>
        </View>
        <View style={[styles.themeCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.themeIcon, { backgroundColor: theme === 'dark' ? c.primary : c.accent }]}>
            <AppIcon name={theme === 'dark' ? 'moon' : 'sun'} size={19} color={theme === 'dark' ? c.primaryForeground : c.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.themeLabel, { color: c.primary }]}>ASPETTO DELL’APP</Text>
            <Text style={[styles.themeTitle, { color: c.foreground }]}>{theme === 'dark' ? 'Modalità scura attiva' : 'Tema chiaro attivo'}</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>
              {darkTheme?.owned
                ? 'Puoi cambiare tema quando vuoi.'
                : 'Sblocca il tema scuro dalla collezione per attivarlo.'}
            </Text>
          </View>
          {darkTheme?.owned ? (
            <Pressable
              testID="interruttore-tema"
              accessibilityLabel={theme === 'dark' ? 'Usa tema chiaro' : 'Attiva tema scuro'}
              disabled={Boolean(busyId)}
              onPress={() => { void toggleTheme(); }}
              style={({ pressed }) => [styles.themeButton, { backgroundColor: theme === 'dark' ? c.secondary : c.primary, opacity: busyId ? 0.5 : pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.themeButtonText, { color: theme === 'dark' ? c.secondaryForeground : c.primaryForeground }]}>
                {theme === 'dark' ? 'Chiaro' : 'Scuro'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <SectionTitle eyebrow="Collezione" title="Sblocca accessori" />
        {shop.map((item) => (
          <Pressable key={item.id} testID={`negozio-${item.id}`} disabled={Boolean(busyId)} onPress={() => { void purchase(item.id, item.title, item.cost, item.owned); }} style={({ pressed }) => [styles.item, { backgroundColor: c.card, borderColor: item.equipped ? c.primary : c.border, opacity: busyId === item.id ? 0.5 : pressed ? 0.74 : 1 }]}>
            <View style={[styles.itemIcon, { backgroundColor: item.equipped ? c.primary : c.secondary }]}><AppIcon name={item.icon} size={18} color={item.equipped ? c.primaryForeground : c.foreground} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: c.foreground }]}>{item.title}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>{item.subtitle}</Text></View>
            {item.equipped ? <Pill>Attivo</Pill> : item.owned ? <Pill>Equipaggia</Pill> : <View style={styles.price}><AppIcon name="zap" size={11} color={c.primary} /><Text style={[styles.priceText, { color: c.foreground }]}>{item.cost}</Text></View>}
          </Pressable>
        ))}
      </ScrollView>
      <AppModal
        visible={Boolean(message)}
        title={message?.title ?? ''}
        message={message?.message}
        icon={message?.success ? 'circle-check' : 'warning'}
        onDismiss={() => setMessage(null)}
        actions={[{ label: 'Continua', variant: 'primaria', onPress: () => setMessage(null) }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 5 }, heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, maxWidth: 330 }, wallet: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6, alignItems: 'center' },
  walletText: { fontFamily: 'Inter_700Bold', fontSize: 15 }, balance: { borderRadius: 22, padding: 19 }, balanceLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, opacity: 0.8 },
  balanceValue: { fontFamily: 'Inter_700Bold', fontSize: 37, marginTop: 4 }, pts: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  item: { borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, itemIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 }, small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 }, priceText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  rewardProgress: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  themeCard: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  themeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  themeLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 3 },
  themeTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 3 },
  themeButton: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  themeButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  rewardRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  rewardLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, marginBottom: 4 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  rewardAmount: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});