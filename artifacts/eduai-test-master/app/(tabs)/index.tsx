import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { IconButton, Pill, PrimaryButton, SectionTitle } from '@/components/Ui';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type RankingTab = 'globale' | 'amici';
type Notice = { title: string; message: string; icon: AppIconName; success?: boolean };

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const {
    account,
    level,
    wallet,
    streak,
    quizzes,
    materials,
    shop,
    leaderboard,
    friends,
    inviteCode,
    useInvite,
  } = useApp();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rankingTab, setRankingTab] = useState<RankingTab>('globale');
  const [friendCode, setFriendCode] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const start = () => router.push('/(tabs)/library');
  const nextReward = shop.find((item) => !item.owned);
  const rewardProgress = nextReward ? Math.min(100, Math.round((wallet / nextReward.cost) * 100)) : 100;

  const shareCode = async () => {
    if (!inviteCode) {
      setNotice({ title: 'Codice non disponibile', message: 'Attendi il completamento della sincronizzazione e riprova.', icon: 'warning' });
      return;
    }
    try {
      await Share.share({ message: `Unisciti a me su EduAI Test Master. Il mio codice invito è ${inviteCode}.` });
    } catch {
      setNotice({ title: 'Condivisione non riuscita', message: 'Non è stato possibile aprire il menu di condivisione.', icon: 'warning' });
    }
  };

  const addFriend = async () => {
    const code = friendCode.trim().toUpperCase();
    if (code.length !== 6) {
      setNotice({ title: 'Codice non valido', message: 'Il codice invito deve contenere esattamente 6 caratteri.', icon: 'warning' });
      return;
    }
    setAddingFriend(true);
    const result = await useInvite(code);
    setAddingFriend(false);
    if (result.ok) {
      setFriendCode('');
      setRankingTab('amici');
      setNotice({ title: 'Amico aggiunto', message: 'Il collegamento è stato salvato nel tuo account.', icon: 'circle-check', success: true });
    } else {
      setNotice({ title: 'Invito non riuscito', message: result.message, icon: 'warning' });
    }
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: c.mutedForeground }]}>IL TUO SPAZIO DI STUDIO</Text>
            <Text style={[styles.heading, { color: c.foreground }]}>Ciao {account?.username ?? ''}, studiamo?</Text>
          </View>
          <IconButton name="bell" label="Avvisi" onPress={() => setNotice({ title: 'Nessun nuovo avviso', message: 'Quando saranno disponibili aggiornamenti sui tuoi contenuti, li troverai qui.', icon: 'bell' })} />
        </View>

        <Pressable testID="modifica-percorso" onPress={() => router.push('/onboarding')} style={[styles.levelCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: c.accent }]}><AppIcon name="book-open" size={17} color={c.accentForeground} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>IL TUO PERCORSO</Text>
            <Text style={[styles.level, { color: c.foreground }]}>{level ?? 'Scegli il tuo indirizzo'}</Text>
          </View>
          <AppIcon name="chevron-right" size={15} color={c.mutedForeground} />
        </Pressable>

        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.primary }]}>{streak}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>giorni attivi</Text></View>
          <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.foreground }]}>{wallet}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>punti</Text></View>
          <View style={[styles.stat, { backgroundColor: c.card }]}><Text style={[styles.statValue, { color: c.foreground }]}>{quizzes.length}</Text><Text style={[styles.statLabel, { color: c.mutedForeground }]}>verifiche</Text></View>
        </View>

        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <View style={{ flex: 1 }}>
            <Pill color={c.accentForeground}>STUDIO ATTIVO</Pill>
            <Text style={[styles.heroTitle, { color: c.primaryForeground }]}>Trasforma i tuoi file in una verifica.</Text>
            <Text style={[styles.heroBody, { color: c.primaryForeground }]}>
              {materials.length ? `${materials.length} materiali pronti nella tua libreria online.` : 'Aggiungi documenti, immagini, video o audio per iniziare.'}
            </Text>
            <PrimaryButton onPress={start} icon="generate">{materials.length ? 'Prepara un contenuto' : 'Aggiungi materiali'}</PrimaryButton>
          </View>
          <View style={[styles.orbit, { borderColor: c.primaryForeground }]}><AppIcon name="book" size={26} color={c.primaryForeground} /></View>
        </View>

        <SectionTitle eyebrow="Premi" title="Prossimo sblocco" />
        <Pressable onPress={() => router.push('/(tabs)/shop')} style={[styles.progressCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={[styles.progressBig, { color: c.foreground }]}>{nextReward?.title ?? 'Collezione completata'}</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>
                {nextReward ? wallet >= nextReward.cost ? 'Puoi sbloccarlo ora.' : `Mancano ${nextReward.cost - wallet} punti.` : 'Hai già ottenuto tutti i premi.'}
              </Text>
            </View>
            <Text style={[styles.progressValue, { color: c.primary }]}>{rewardProgress}%</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.secondary }]}><View style={[styles.fill, { backgroundColor: c.primary, width: `${rewardProgress}%` }]} /></View>
        </Pressable>

        <SectionTitle eyebrow="Community" title="Classifica" />
        <View style={[styles.community, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.rankingTabs, { backgroundColor: c.secondary }]}>
            {(['globale', 'amici'] as RankingTab[]).map((tab) => (
              <Pressable
                key={tab}
                testID={`classifica-${tab}`}
                onPress={() => setRankingTab(tab)}
                style={[styles.rankingTab, { backgroundColor: rankingTab === tab ? c.accent : 'transparent' }]}
              >
                <AppIcon name={tab === 'globale' ? 'globe' : 'users'} size={13} color={rankingTab === tab ? c.accentForeground : c.mutedForeground} />
                <Text style={[styles.rankingTabText, { color: rankingTab === tab ? c.accentForeground : c.mutedForeground }]}>
                  {tab === 'globale' ? 'Globale' : 'Amici'}
                </Text>
              </Pressable>
            ))}
          </View>
          {rankingTab === 'globale' ? (
            leaderboard.length ? leaderboard.slice(0, 8).map((entry, index) => (
              <View key={`${entry.username}-${index}`} style={[styles.rankRow, { borderTopColor: c.border }]}>
                <Text style={[styles.position, { color: index < 3 ? c.primary : c.mutedForeground }]}>{index + 1}</Text>
                <Text style={[styles.rankName, { color: c.foreground }]} numberOfLines={1}>{entry.username}</Text>
                <Text style={[styles.rankPoints, { color: c.primary }]}>{entry.wallet} pt</Text>
              </View>
            )) : (
              <View style={styles.communityEmpty}><AppIcon name="globe" size={18} color={c.primary} /><Text style={[styles.small, { color: c.mutedForeground }]}>La classifica apparirà quando gli utenti inizieranno a guadagnare punti.</Text></View>
            )
          ) : friends.length ? friends.map((friend, index) => (
            <View key={`${friend.username}-${index}`} style={[styles.rankRow, { borderTopColor: c.border }]}>
              <Text style={[styles.position, { color: c.primary }]}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rankName, { color: c.foreground }]}>{friend.username}</Text>
                <Text style={[styles.friendLevel, { color: c.mutedForeground }]} numberOfLines={1}>{friend.level ?? 'Percorso non impostato'}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.communityEmpty}><AppIcon name="users" size={18} color={c.primary} /><Text style={[styles.small, { color: c.mutedForeground }]}>La lista Amici è vuota. Usa un codice invito per aggiungere qualcuno.</Text></View>
          )}
        </View>

        <View style={[styles.invite, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.inviteHeader}>
            <View style={[styles.inviteIcon, { backgroundColor: c.accent }]}><AppIcon name="users" size={17} color={c.accentForeground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inviteLabel, { color: c.primary }]}>IL TUO CODICE INVITO</Text>
              <Text style={[styles.inviteCode, { color: c.foreground }]}>{inviteCode || '------'}</Text>
            </View>
            <Pressable accessibilityLabel="Condividi codice invito" onPress={() => { void shareCode(); }} style={[styles.share, { backgroundColor: c.secondary }]}>
              <AppIcon name="upload" size={15} color={c.foreground} />
            </Pressable>
          </View>
          <View style={styles.codeForm}>
            <TextInput
              testID="codice-amico"
              value={friendCode}
              onChangeText={(value) => setFriendCode(value.toUpperCase().slice(0, 6))}
              placeholder="Codice di un amico"
              placeholderTextColor={c.mutedForeground}
              autoCapitalize="characters"
              maxLength={6}
              style={[styles.codeInput, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
            />
            <Pressable testID="usa-codice-invito" disabled={addingFriend} onPress={() => { void addFriend(); }} style={[styles.addButton, { backgroundColor: c.primary, opacity: addingFriend ? 0.55 : 1 }]}>
              <Text style={[styles.addButtonText, { color: c.primaryForeground }]}>{addingFriend ? '…' : 'Aggiungi'}</Text>
            </Pressable>
          </View>
        </View>

        <SectionTitle eyebrow="Cronologia" title="Ultime verifiche" />
        {quizzes.length ? quizzes.slice(0, 3).map((quiz) => (
          <View key={quiz.id} style={[styles.activity, { borderBottomColor: c.border }]}>
            <View style={[styles.activityIcon, { backgroundColor: quiz.passed ? c.accent : c.secondary }]}><AppIcon name={quiz.passed ? 'check' : 'book-open'} size={15} color={quiz.passed ? c.accentForeground : c.mutedForeground} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.activityTitle, { color: c.foreground }]}>{quiz.title}</Text><Text style={[styles.small, { color: c.mutedForeground }]}>{new Date(quiz.date).toLocaleDateString('it-IT')}</Text></View>
            <Text style={[styles.activityScore, { color: quiz.passed ? c.primary : c.mutedForeground }]}>{quiz.score}/{quiz.totalQuestions}</Text>
          </View>
        )) : (
          <View style={[styles.empty, { backgroundColor: c.card }]}><AppIcon name="chart" size={19} color={c.primary} /><Text style={[styles.emptyTitle, { color: c.foreground }]}>Ancora nessuna verifica</Text><Text style={[styles.small, { color: c.mutedForeground }]}>I risultati compariranno qui dopo la prima verifica.</Text></View>
        )}
      </ScrollView>

      <AppModal
        visible={Boolean(notice)}
        title={notice?.title ?? ''}
        message={notice?.message}
        icon={notice?.icon ?? 'info'}
        onDismiss={() => setNotice(null)}
        actions={[{ label: 'Ho capito', variant: 'primaria', onPress: () => setNotice(null) }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.8, marginTop: 5, maxWidth: 290 },
  levelCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, marginBottom: 3 },
  level: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 15, padding: 12 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  hero: { borderRadius: 23, padding: 20, flexDirection: 'row', overflow: 'hidden', minHeight: 232 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.8, marginTop: 18, maxWidth: 220 },
  heroBody: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, opacity: 0.84, marginVertical: 12, maxWidth: 230 },
  orbit: { width: 65, height: 65, borderWidth: 1, borderRadius: 33, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginLeft: 8 },
  progressCard: { borderRadius: 18, borderWidth: 1, padding: 16 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressBig: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  progressValue: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 14 },
  fill: { height: '100%', borderRadius: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  community: { borderWidth: 1, borderRadius: 20, padding: 12 },
  rankingTabs: { flexDirection: 'row', padding: 4, borderRadius: 14, marginBottom: 4 },
  rankingTab: { flex: 1, borderRadius: 11, minHeight: 38, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  rankingTabText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  rankRow: { minHeight: 49, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5 },
  position: { width: 24, fontFamily: 'Inter_700Bold', fontSize: 13, textAlign: 'center' },
  rankName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  rankPoints: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  friendLevel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 2 },
  communityEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  invite: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 13 },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  inviteIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  inviteLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  inviteCode: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: 3, marginTop: 3 },
  share: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  codeForm: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1, borderWidth: 1, borderRadius: 13, minHeight: 45, paddingHorizontal: 12, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.3 },
  addButton: { minHeight: 45, borderRadius: 13, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  activityIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  activityScore: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  empty: { padding: 18, borderRadius: 18, gap: 6 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});