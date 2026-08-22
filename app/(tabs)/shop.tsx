import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { Pill, SectionTitle } from '@/components/Ui';
import { useApp, type ShopItem } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ── Category metadata ─────────────────────────────────────────────────────────
const CATEGORIES: {
  itemType: ShopItem['itemType'];
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
}[] = [
  {
    itemType: 'tema',
    eyebrow: 'ASPETTO',
    title: 'Temi e palette',
    description: `Cambiano i colori dell’intera app. Ne puoi avere uno attivo alla volta.`,
    icon: 'moon',
  },
  {
    itemType: 'animazione_completamento',
    eyebrow: 'COMPLETAMENTO TEST',
    title: 'Fine verifica',
    description: 'Coriandoli, stelle e incoronazioni quando concludi una verifica.',
    icon: 'sparkles',
  },
  { itemType: 'animazione_livello', eyebrow: 'LEVEL UP', title: 'Passaggio di livello', description: 'Celebra ogni nuovo livello raggiunto.', icon: 'award' },
  { itemType: 'animazione_streak', eyebrow: 'LOGIN / STREAK', title: 'Serie giornaliera', description: 'Dà energia al tuo accesso quotidiano e alla serie.', icon: 'flame' },
  { itemType: 'animazione_upload', eyebrow: 'UPLOAD RIUSCITO', title: 'Materiale pronto', description: 'Feedback quando un materiale o laboratorio è pronto.', icon: 'upload' },
  { itemType: 'animazione_risposta', eyebrow: 'RISPOSTA', title: 'Risposta corretta / sbagliata', description: 'Feedback immediato durante gli esercizi.', icon: 'zap' },
  { itemType: 'animazione_sblocco', eyebrow: 'SBLOCCO', title: 'Mappa e flashcard', description: 'Effetti quando sblocchi nuovi strumenti di studio.', icon: 'layers' },
  { itemType: 'animazione_interfaccia', eyebrow: 'INTERFACCIA', title: 'Tema schede', description: 'Bordi ed effetti per le card dell’app.', icon: 'sparkles' },
  {
    itemType: 'stile_carta',
    eyebrow: 'STILE',
    title: 'Stili carta',
    description: `Cambiano l’aspetto delle card materiali e quiz. Uno attivo alla volta.`,
    icon: 'paintbrush',
  },
  { itemType: 'cornice_avatar', eyebrow: 'PROFILO', title: 'Cornici Avatar', description: 'Cornici e auree luminose per l’immagine del profilo.', icon: 'award' },
  { itemType: 'decorazione_profilo', eyebrow: 'PROFILO', title: 'Decorazioni Statistiche', description: 'Bordi speciali per punti e statistiche del profilo.', icon: 'zap' },
  {
    itemType: 'titolo',
    eyebrow: 'IDENTITÀ',
    title: 'Titoli profilo',
    description: 'Appaiono sotto al tuo nome nel profilo. Equipaggiarne uno alla volta.',
    icon: 'tag',
  },
  {
    itemType: 'distintivo',
    eyebrow: 'TRAGUARDI',
    title: 'Distintivi',
    description: 'Testimoniano i tuoi risultati. Rimangono nella collezione per sempre.',
    icon: 'award',
  },
  {
    itemType: 'icona_futura',
    eyebrow: 'FUTURO',
    title: 'Icone launcher',
    description: `Icona del telefono: disponibili con il prossimo aggiornamento dell’app.`,
    icon: 'star',
  },
];

const EQUIPPABLE_TYPES: ShopItem['itemType'][] = ['tema', 'animazione', 'animazione_completamento', 'animazione_livello', 'animazione_streak', 'animazione_upload', 'animazione_risposta', 'animazione_sblocco', 'animazione_interfaccia', 'stile_carta', 'cornice_avatar', 'decorazione_profilo', 'titolo'];

function rewardDescription(item: ShopItem): string {
  if (item.itemType === 'tema') return 'Cambia immediatamente i colori e l’atmosfera dell’intera app.';
  if (item.itemType.startsWith('animazione')) return 'Effetto equipaggiabile per questo evento, con sblocco progressivo usando punti e livello.';
  if (item.itemType === 'stile_carta') return 'Modifica il modo in cui vengono visualizzate le card di materiali, quiz e laboratori.';
  if (item.itemType === 'titolo') return 'Compare sotto il tuo nome nel profilo quando lo equipaggi.';
  if (item.itemType === 'icona_futura') return 'È una ricompensa preparata per cambiare l’icona di avvio in un futuro aggiornamento.';
  return 'Resta nella tua collezione come ricordo del traguardo raggiunto.';
}

function rarityFor(item: ShopItem): NonNullable<ShopItem['rarity']> {
  if (item.rarity) return item.rarity;
  if (item.cost >= 150) return 'leggendario';
  if (item.cost >= 100) return 'epico';
  if (item.cost >= 60) return 'raro';
  if (item.cost >= 35) return 'non_comune';
  return 'comune';
}

function requiredLevel(item: ShopItem): number {
  const rarity = rarityFor(item);
  return rarity === 'leggendario' ? 15 : rarity === 'epico' ? 10 : rarity === 'raro' ? 5 : rarity === 'non_comune' ? 2 : 1;
}

function rarityColor(item: ShopItem, c: any): string {
  return ({ comune: '#B7A58D', non_comune: c.primary, raro: '#3478C9', epico: '#8B4BC2', leggendario: '#C77A16' } as Record<string, string>)[rarityFor(item)];
}

function pointsForNextLevel(level: number): number {
  // The threshold increases when entering levels 11, 21, 31 and 41:
  // level 10 → 11 costs 150, level 20 → 21 costs 200.
  return 100 + Math.floor(Math.max(1, level) / 10) * 50;
}

function pointsToReachLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < level; current++) total += pointsForNextLevel(current);
  return total;
}

function levelFromWallet(wallet: number): number {
  let level = 1;
  while (level < 50 && wallet >= pointsToReachLevel(level + 1)) level++;
  return level;
}

export default function ShopScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { wallet, xp, level, theme, shop, buyItem, equipItem, useLightTheme } = useApp();
  const [message, setMessage] = useState<{ title: string; message: string; success: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ShopItem['itemType']>('tema');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const experienceLevel = Math.min(50, Math.floor(xp / 100) + 1);
  const xpInLevel = xp % 100;

  const purchase = async (id: string, title: string, cost: number, owned: boolean) => {
    if (busyId) return;
    const selected = shop.find((item) => item.id === id);

    if (owned) {
      if (selected?.itemType === 'icona_futura') {
        setMessage({ title: 'Icona riservata', message: `${title} è nella tua collezione e potrà essere applicata con un futuro aggiornamento dell'app.`, success: true });
        return;
      }
      if (selected?.itemType === 'distintivo') {
        setMessage({ title: 'Già nella collezione', message: `${title} è già nel tuo profilo.`, success: true });
        return;
      }
      if (selected && EQUIPPABLE_TYPES.includes(selected.itemType)) {
        setBusyId(id);
        const result = await equipItem(id);
        setBusyId(null);
        setMessage(result.ok
          ? { title: 'Equipaggiato', message: `${title} è ora attivo.`, success: true }
          : { title: 'Operazione non riuscita', message: result.message, success: false });
        return;
      }
      return;
    }

    if (wallet < cost) {
      setMessage({ title: 'Punti insufficienti', message: `Ti servono ancora ${cost - wallet} punti per sbloccare questo premio.`, success: false });
      return;
    }
    const required = selected ? requiredLevel(selected) : 1;
    if (experienceLevel < required) {
      setMessage({ title: 'Oggetto bloccato', message: `Richiede Livello ${required}. Continua a guadagnare XP per sbloccarlo.`, success: false });
      return;
    }
    setBusyId(id);
    const result = await buyItem(id);
    setBusyId(null);
    setMessage(result.ok
      ? { title: 'Sbloccato!', message: `${title} è stato aggiunto alla tua collezione.`, success: true }
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
            ? `Hai ripristinato l’aspetto chiaro di EduAI.`
            : 'La modalità scura è ora attiva su tutti i tuoi dispositivi.',
          success: true,
        }
      : { title: 'Tema non aggiornato', message: result.message, success: false });
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: c.primary }]}>NEGOZIO PUNTI</Text>
            <Text style={[styles.heading, { color: c.foreground }]}>Personalizza</Text>
          </View>
          <View style={[styles.wallet, { backgroundColor: c.accent }]}>
            <AppIcon name="zap" size={14} color={c.accentForeground} />
            <Text style={[styles.walletText, { color: c.accentForeground }]}>{wallet}</Text>
          </View>
        </View>
        <Pressable onPress={() => setMessage({ title: `Esperienza · Livello ${experienceLevel}`, message: `${xpInLevel}/100 XP nel livello attuale (${xpInLevel}%).\n\nGuida XP\nQuiz: +20 XP\nLaboratorio: +50 XP\nStreak: +15 XP`, success: true })} style={[styles.xpBar, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.xpHeader}><Text style={[styles.small, { color: c.mutedForeground }]}>ESPERIENZA · LIVELLO {experienceLevel}</Text><Text style={[styles.small, { color: c.primary }]}>{xp} XP</Text></View>
          <View style={[styles.track, { backgroundColor: c.secondary }]}><View style={[styles.fill, { backgroundColor: c.primary, width: `${Math.min(100, xp % 100)}%` }]} /></View>
        </Pressable>
        <Text style={[styles.intro, { color: c.mutedForeground }]}>
          Supera le verifiche, guadagna punti e personalizza ogni aspetto del tuo spazio di studio.
        </Text>

        {/* Balance */}
        <View style={[styles.balance, { backgroundColor: c.primary }]}>
          <Text style={[styles.balanceLabel, { color: c.primaryForeground }]}>PUNTI DISPONIBILI</Text>
          <Text style={[styles.balanceValue, { color: c.primaryForeground }]}>
            {wallet} <Text style={styles.pts}>punti</Text>
          </Text>
        </View>

        {/* Active theme quick-toggle */}
        <View style={[styles.themeCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.themeIcon, { backgroundColor: theme === 'dark' ? c.primary : c.accent }]}>
            <AppIcon name={theme === 'dark' ? 'moon' : 'sun'} size={19} color={theme === 'dark' ? c.primaryForeground : c.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.themeLabel, { color: c.primary }]}>ASPETTO DELL'APP</Text>
            <Text style={[styles.themeTitle, { color: c.foreground }]}>{theme === 'dark' ? 'Modalità scura attiva' : 'Tema chiaro attivo'}</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>
              {darkTheme?.owned ? 'Puoi cambiare tema quando vuoi.' : 'Sblocca un tema dalla sezione Temi e palette.'}
            </Text>
          </View>
          {darkTheme?.owned ? (
            <Pressable
              testID="interruttore-tema"
              accessibilityLabel={theme === 'dark' ? 'Usa tema chiaro' : 'Attiva tema scuro'}
              disabled={Boolean(busyId)}
              onPress={() => { void toggleTheme(); }}
              style={({ pressed }) => [
                styles.themeButton,
                { backgroundColor: theme === 'dark' ? c.secondary : c.primary, opacity: busyId ? 0.5 : pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={[styles.themeButtonText, { color: theme === 'dark' ? c.secondaryForeground : c.primaryForeground }]}>
                {theme === 'dark' ? 'Chiaro' : 'Scuro'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Category picker: one horizontal row, one category visible at a time */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPicker}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.itemType;
            return (
              <Pressable
                key={cat.itemType}
                onPress={() => setSelectedCategory(cat.itemType)}
                style={[styles.categoryChip, { backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border }]}
              >
                <AppIcon name={cat.icon} size={14} color={active ? c.primaryForeground : c.mutedForeground} />
                <Text style={[styles.categoryChipText, { color: active ? c.primaryForeground : c.foreground }]}>{cat.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {CATEGORIES.filter((cat) => cat.itemType === selectedCategory).map((cat) => {
          const items = shop.filter((i) => i.itemType === cat.itemType);
          return (
            <View key={cat.itemType}>
              <SectionTitle eyebrow={cat.eyebrow} title={cat.title} />
              <Text style={[styles.catDesc, { color: c.mutedForeground }]}>{cat.description}</Text>
              {items.map((item) => (
                <ShopItemRow
                  key={item.id}
                  item={item}
                  busyId={busyId}
                  equippable={EQUIPPABLE_TYPES.includes(item.itemType)}
                  onPress={() => setSelectedItem(item)}
                  c={c}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>

      <AppModal
        visible={Boolean(selectedItem)}
        title={selectedItem?.title ?? ''}
        message={selectedItem ? `${selectedItem.subtitle}\n\n${rewardDescription(selectedItem)}${!selectedItem.owned && experienceLevel < requiredLevel(selectedItem) ? `\n\n🔒 Richiede Livello ${requiredLevel(selectedItem)}` : ''}` : undefined}
        icon={(selectedItem?.icon as AppIconName | undefined) ?? 'award'}
        onDismiss={() => setSelectedItem(null)}
        actions={selectedItem ? [
          { label: 'Chiudi', onPress: () => setSelectedItem(null) },
          {
            label: selectedItem.owned
              ? (EQUIPPABLE_TYPES.includes(selectedItem.itemType) ? 'Equipaggia' : 'Già sbloccato')
              : experienceLevel < requiredLevel(selectedItem) ? `🔒 Richiede Livello ${requiredLevel(selectedItem)}` : `Sblocca · ${selectedItem.cost} pt`,
            variant: 'primaria' as const,
            onPress: () => {
              if ((!selectedItem.owned && experienceLevel >= requiredLevel(selectedItem)) || EQUIPPABLE_TYPES.includes(selectedItem.itemType)) {
                const item = selectedItem;
                setSelectedItem(null);
                void purchase(item.id, item.title, item.cost, item.owned);
              }
            },
          },
        ] : []}
      />
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

// ── Item row component ────────────────────────────────────────────────────────
function ShopItemRow({
  item,
  busyId,
  equippable,
  onPress,
  c,
}: {
  item: ShopItem;
  busyId: string | null;
  equippable: boolean;
  onPress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [spin]);
  const spinValue = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rarity = rarityFor(item);
  const rarityAccent = rarityColor(item, c);
  return (
    <Pressable
      testID={`negozio-${item.id}`}
      disabled={Boolean(busyId)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: c.card,
          borderColor: item.equipped ? c.primary : c.border,
          opacity: busyId === item.id ? 0.5 : pressed ? 0.74 : 1,
        },
      ]}
    >
       <Animated.View pointerEvents="none" style={[styles.rarityOrb, { backgroundColor: rarityAccent, transform: [{ rotate: spinValue }] }]} />
      <View style={[styles.itemIcon, { backgroundColor: item.equipped ? c.primary : c.secondary }]}>
        <AppIcon name={item.icon as AppIconName} size={18} color={item.equipped ? c.primaryForeground : c.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: c.foreground }]}>{item.title}</Text>
        <Text style={[styles.rarity, { color: rarityAccent }]}>
          {rarityFor(item).replace('_', ' ').toUpperCase()}
        </Text>
        <Text style={[styles.small, { color: c.mutedForeground }]}>{item.subtitle}</Text>
      </View>
      {item.equipped ? (
        <Pill>Attivo</Pill>
      ) : item.owned ? (
        <Pill>{equippable ? 'Equipaggia' : 'Sbloccato'}</Pill>
      ) : (
        <View style={styles.price}>
          <AppIcon name="zap" size={11} color={c.primary} />
          <Text style={[styles.priceText, { color: c.foreground }]}>{item.cost}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 },
  categoryPicker: { gap: 8, paddingVertical: 2 },
  categoryChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 5 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, maxWidth: 330 },
  wallet: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6, alignItems: 'center' },
  walletText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  balance: { borderRadius: 22, padding: 19 },
  xpBar: { borderRadius: 16, borderWidth: 1, padding: 13, gap: 8 },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, opacity: 0.8 },
  balanceValue: { fontFamily: 'Inter_700Bold', fontSize: 37, marginTop: 4 },
  pts: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  rewardProgress: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  levelPanel: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  levelDot: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  levelDotText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  rewardRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  rewardLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, marginBottom: 4 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  rewardAmount: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  themeCard: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  themeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  themeLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 3 },
  themeTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 3 },
  themeButton: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  themeButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  catDesc: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, marginBottom: 8, marginTop: -6 },
  item: { borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, overflow: 'hidden' },
  rarityOrb: { position: 'absolute', top: -1, right: 16, width: 52, height: 3, borderRadius: 2 },
  itemIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 2 },
  rarity: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 2 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});
