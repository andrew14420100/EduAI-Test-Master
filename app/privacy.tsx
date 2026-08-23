import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.paragraph, { color: c.mutedForeground }]}>{children}</Text>;
}

export default function PrivacyScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Torna al profilo"
            testID="torna-al-profilo"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <AppIcon name="chevron-right" size={18} color={c.foreground} />
            </View>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: c.primary }]}>TRASPARENZA</Text>
            <Text style={[styles.title, { color: c.foreground }]}>Privacy e dati</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: c.accent }]}>
            <AppIcon name="shield" size={21} color={c.accentForeground} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.updated, { color: c.primary }]}>Ultimo aggiornamento: 23 agosto 2026</Text>
          <Paragraph>
            EduAI Test Master è un’applicazione per lo studio che consente di organizzare materiali, creare esercizi e utilizzare funzioni di supporto basate sull’intelligenza artificiale. Questa informativa spiega quali dati possono essere trattati e per quali finalità.
          </Paragraph>
        </View>

        <Section title="1. Chi tratta i dati">
          <Paragraph>
            Il titolare del trattamento è il soggetto che gestisce EduAI Test Master. Per richieste relative alla privacy puoi scrivere a <Text style={{ color: c.primary, fontFamily: 'Inter_700Bold' }}>andcolaz13@gmail.com</Text>. Il nome completo e i dati giuridici del titolare devono essere completati prima della pubblicazione ufficiale.
          </Paragraph>
        </Section>

        <Section title="2. Dati che possiamo raccogliere">
          <Paragraph>
            Possiamo trattare i dati necessari per creare e gestire l’account, come username, indirizzo email e identificativo dell’account.
          </Paragraph>
          <Paragraph>
            Possiamo inoltre trattare il percorso di studio scelto, i materiali caricati, i testi estratti, gli esercizi, le flashcard, i risultati, i punti, gli XP, gli acquisti virtuali, le preferenze e le richieste inviate tramite “Proponi una modifica”.
          </Paragraph>
          <Paragraph>
            Per le notifiche push possiamo trattare il token tecnico del dispositivo e le informazioni minime necessarie per consegnare gli avvisi. L’app può inoltre ricevere dati tecnici essenziali, come log di sicurezza, errori e informazioni sulla connessione.
          </Paragraph>
        </Section>

        <Section title="3. Materiali caricati">
          <Paragraph>
            PDF, documenti, immagini, audio e video vengono caricati solo quando scegli di usarli per lo studio. I file e i contenuti derivati vengono associati al tuo account per permettere analisi, OCR, estrazione del testo, trascrizione e generazione di attività.
          </Paragraph>
          <Paragraph>
            Carica esclusivamente contenuti che hai il diritto di utilizzare e non inserire dati personali di altre persone se non hai una base giuridica valida per farlo.
          </Paragraph>
        </Section>

        <Section title="4. Come utilizziamo i dati">
          <Paragraph>
            I dati sono utilizzati per autenticare l’account, fornire le funzioni dell’app, salvare i progressi, personalizzare il percorso, generare contenuti didattici, prevenire abusi, rispondere alle richieste e mantenere sicuri i servizi.
          </Paragraph>
          <Paragraph>
            I dati possono essere trattati per adempiere obblighi di legge e per accertare, esercitare o difendere diritti del titolare.
          </Paragraph>
        </Section>

        <Section title="5. Intelligenza artificiale">
          <Paragraph>
            Quando richiedi un’analisi o la generazione di un’attività, il testo o il contenuto necessario può essere inviato a servizi di intelligenza artificiale utilizzati dal gestore. Il trattamento serve esclusivamente a fornire la funzione richiesta, secondo la configurazione tecnica e i contratti applicabili a tali servizi.
          </Paragraph>
          <Paragraph>
            Le risposte generate dall’IA possono contenere errori e non sostituiscono il giudizio di un insegnante o di un professionista. Evita di caricare informazioni altamente riservate o non necessarie.
          </Paragraph>
        </Section>

        <Section title="6. Fornitori e trasferimenti">
          <Paragraph>
            Per funzionare, l’app può utilizzare fornitori specializzati per autenticazione, database, archiviazione dei file, infrastruttura server, servizi IA e notifiche push. I fornitori ricevono solo i dati necessari alla loro funzione e operano secondo i rispettivi accordi e informative.
          </Paragraph>
          <Paragraph>
            Alcuni fornitori potrebbero trattare dati fuori dallo Spazio Economico Europeo. In questi casi il trasferimento deve essere basato su un meccanismo previsto dalla normativa applicabile, come una decisione di adeguatezza o clausole contrattuali standard.
          </Paragraph>
        </Section>

        <Section title="7. Conservazione e sicurezza">
          <Paragraph>
            Conserviamo i dati per il tempo necessario a fornire il servizio, gestire l’account, rispettare gli obblighi di legge e tutelare i nostri diritti. I tempi specifici dipendono dal tipo di dato e devono essere definiti dal titolare.
          </Paragraph>
          <Paragraph>
            Adottiamo misure tecniche e organizzative ragionevoli, tra cui autenticazione, controllo degli accessi, connessioni protette e separazione dei dati per account. Nessun sistema online può però garantire sicurezza assoluta.
          </Paragraph>
        </Section>

        <Section title="8. I tuoi diritti">
          <Paragraph>
            Nei limiti previsti dalla legge puoi chiedere accesso, rettifica, cancellazione, limitazione, opposizione e portabilità dei dati. Puoi anche revocare un consenso quando il trattamento si basa sul consenso. Le richieste possono essere inviate al contatto indicato in questa pagina.
          </Paragraph>
          <Paragraph>
            Hai inoltre il diritto di presentare un reclamo all’autorità di controllo competente, in particolare al Garante per la protezione dei dati personali in Italia.
          </Paragraph>
        </Section>

        <Section title="9. Cancellazione dell’account">
          <Paragraph>
            Puoi richiedere la cancellazione dell’account dalla sezione Impostazioni account. La cancellazione rimuove, secondo le possibilità tecniche del servizio, il profilo, i materiali, i progressi, gli acquisti virtuali e i ticket associati. Alcuni dati possono essere conservati più a lungo se necessario per obblighi di legge o per la tutela dei diritti.
          </Paragraph>
        </Section>

        <Section title="10. Minori">
          <Paragraph>
            Se hai meno di 18 anni, usa l’app con il coinvolgimento e la supervisione di un genitore o tutore quando richiesto dalla legge. Non raccogliamo consapevolmente dati ulteriori rispetto a quelli necessari per il servizio. Se ritieni che siano stati forniti dati senza le autorizzazioni necessarie, contattaci per consentirci di intervenire.
          </Paragraph>
        </Section>

        <Section title="11. Modifiche all’informativa">
          <Paragraph>
            Potremmo aggiornare questa informativa per riflettere modifiche dell’app, dei fornitori o della normativa. La versione aggiornata sarà resa disponibile nell’app con la relativa data di aggiornamento.
          </Paragraph>
        </Section>

        <View style={[styles.footer, { borderTopColor: c.border }]}>
          <Text style={[styles.footerTitle, { color: c.foreground }]}>Domande sulla privacy?</Text>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>Scrivi a andcolaz13@gmail.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 17 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.5 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  updated: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.3 },
  section: { gap: 7 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.2 },
  paragraph: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 20 },
  footer: { borderTopWidth: 1, paddingTop: 19, marginTop: 4, gap: 5 },
  footerTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  footerText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
});