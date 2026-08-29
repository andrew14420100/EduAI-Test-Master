# Verifica icone launcher native

Data verifica: 29 agosto 2026
Host della verifica: Linux x86_64 (Replit workspace)

## Esito

La verifica installabile richiesta da questa task non è eseguibile nell'ambiente
corrente. Il catalogo applicativo e quello server risultano allineati sulle
cinque alternative (`app_icon_midnight`, `app_icon_neon`,
`app_icon_scholar`, `app_icon_aurora`, `app_icon_legend`) più l'icona standard.
Il progetto nativo ora contiene i bridge, gli alias Android e gli asset catalog
iOS necessari per applicare le sei scelte.

## Controlli eseguiti

- `pnpm run typecheck`: superato.
- `pnpm run test:native-icons`: superato; mapping standard + cinque alternative
  coerente.
- `pnpm run test:icon-recovery`: superato; 12 test, 12 passati, 0 falliti.
- `pnpm run check:react-versions`: superato.
- Nella sessione del 29 agosto 2026 sono stati rieseguiti `pnpm run
  test:native-icons`, `pnpm run test:icon-recovery`, `pnpm run typecheck` e
  `pnpm run check:react-versions`: tutti superati; il recovery harness ha
  riportato 12 test superati, inclusa la verifica del flag Xcode Debug/Release.
- `./android/gradlew assembleDebug`: bloccato prima della compilazione; l'host
  non dispone di Java (`JAVA_HOME` non impostato e comando `java` assente),
  exit code 1.
- `./android/gradlew --version`: stesso blocco per Java assente, exit code 1.
- La risoluzione dei comandi `adb` ed `emulator` non restituisce alcun
  eseguibile; `ANDROID_HOME` e `ANDROID_SDK_ROOT` non sono impostati.
- `eas whoami`: bloccato perché questo workspace non è autenticato a EAS
  (`Not logged in`, exit code 1); non è quindi disponibile nemmeno una build
  cloud da installare durante questa sessione.
- `xcodebuild`, `xcrun` e `simctl`: comandi assenti sull'host Linux; non è
  possibile produrre una build `.app`/`.ipa`, avviare un simulatore iOS o
  interrogare un dispositivo Apple collegato.
- Android: `AppIconManager` è registrato nel package React Native; il manifest
  dichiara l'alias standard attivo e cinque alias alternativi disattivati, con
  risorse mipmap in tutte le densità.
- iOS: `AppIcon.appiconset` resta l'icona standard; sono presenti cinque set
  alternativi 1024×1024, `CFBundleAlternateIcons` e l'implementazione
  `setAlternateIconName`.
- L'host è Linux e non dispone di `xcodebuild`, `xcrun`, Xcode o macOS; non è
  stato possibile compilare né installare una build iOS.
- Non sono disponibili `adb` o un emulatore/dispositivo collegato, quindi non
  è stato possibile verificare cambio, reset o chiusura/riapertura su Android.

## Harness controllato Android e iOS

L’harness è presente nelle build native di sviluppo/QA e non è un controllo
visibile o configurabile nelle build release. Su Android, dopo aver installato
una `debug` build e aver aperto il negozio con un account di test, armare il
prossimo flusso dal terminale:

```sh
adb shell am start -a android.intent.action.VIEW \
  -d "eduai-test-master://native-icon-test?reject=acquisto" \
  com.eduai.testmaster
```

Su iOS Simulator, usare il comando equivalente:

```sh
xcrun simctl openurl booted \
  "eduai-test-master://native-icon-test?reject=acquisto"
```

Su un iPhone, aprire lo stesso link in Safari (o in un’app che consenta di
aprire URL personalizzati) dopo avere installato la build QA. Usare
`reject=equipaggiamento` per un’icona già posseduta oppure
`reject=ripristino` per il pulsante `Icona standard originale`. Il rifiuto è
associato all’operazione scelta, quindi la sincronizzazione dell’icona durante
l’avvio non lo consuma. Completare quindi il flusso dalla UI: il server applica
la mutazione reale, il bridge rifiuta una sola volta, il messaggio mostra
`Riprova`, e il tentativo successivo non è armato e deve riuscire.

Il parametro viene consumato solo quando il bridge riceve la stessa operazione;
armare un nuovo scenario sostituisce quello precedente. Per ripetere una prova
dopo una chiusura forzata, riaprire la build QA e inviare nuovamente il deep
link. Non usare chiamate al database o modifiche manuali all’inventario per
provocare il rifiuto. Il comando non abilita l’harness in una build release:
il JavaScript di release non lo invoca, il bridge iOS è compilato senza la
possibilità di rifiuto e il flag `EduAIIconDebugHarnessEnabled` è disattivato.

### Procedura iOS per ogni scenario

Ripetere i passaggi seguenti separatamente su simulatore e su almeno un iPhone
reale:

1. Installare una build QA con il flag dell’harness attivo e accedere con
   l’account di test.
2. Armare `acquisto`, `equipaggiamento` o `ripristino` tramite il deep link
   sopra, quindi eseguire l’azione corrispondente nel negozio.
3. Verificare il rifiuto reale di `setAlternateIconName`, il messaggio
   localizzato con `Riprova` e che l’icona precedente resti visibile.
4. Premere `Riprova`: il bridge è già riabilitato, quindi il tentativo deve
   riuscire senza un secondo rifiuto.
5. Per `acquisto`, verificare che l’acquisto resti nella collezione e non venga
   addebitato di nuovo. Per `equipaggiamento` e `ripristino`, verificare che
   l’inventario server mantenga l’icona precedente.
6. Chiudere forzatamente e riaprire l’app; confrontare l’icona nel launcher con
   l’elemento `icona_futura` equipaggiato e verificare che non risultino mai
   due icone personalizzate equipaggiate.

## Verifiche ancora necessarie su host nativi

Dopo l'aggiunta degli artefatti nativi, eseguire su una build installabile:

La matrice seguente è il criterio di accettazione da eseguire su ciascun
emulatore/simulatore e almeno un dispositivo reale. La prova di rifiuto può
essere ottenuta con un bridge nativo di debug che restituisce un errore una
volta per lo scenario; non va simulata modificando l'inventario direttamente.

| Piattaforma | Flusso | Rifiuto da verificare | Risultato atteso | Esito su questo host |
| --- | --- | --- | --- | --- |
| Android | acquisto di una nuova icona | rifiuto del bridge dopo la risposta positiva dell'acquisto | l'acquisto resta nella collezione, l'icona precedente resta visibile e una sola `icona_futura` è equipaggiata | Non eseguito: manca build/emulatore/dispositivo |
| Android | equipaggiamento di un'icona già posseduta | rifiuto del bridge dopo l'equipaggiamento server | l'inventario torna all'icona precedente, che resta visibile; il messaggio italiano offre `Riprova` | Non eseguito: manca build/emulatore/dispositivo |
| Android | reset con `Icona standard originale` | rifiuto del bridge durante il ritorno a `standard` | l'icona personalizzata precedente resta visibile e resta l'unica equipaggiata | Non eseguito: manca build/emulatore/dispositivo |
| iOS | acquisto di una nuova icona | rifiuto della chiamata `setAlternateIconName` | l'acquisto resta nella collezione, l'icona precedente resta visibile, il messaggio localizzato contiene `Riprova` e dopo la riapertura resta una sola icona personalizzata equipaggiata | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |
| iOS | equipaggiamento di un'icona già posseduta | rifiuto della chiamata `setAlternateIconName` | l'inventario torna all'icona precedente, che resta visibile; il messaggio localizzato contiene `Riprova` e dopo la riapertura resta una sola icona personalizzata equipaggiata | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |
| iOS | reset con `Icona standard originale` | rifiuto della chiamata con nome alternativo `nil` | l'icona personalizzata precedente resta visibile; il messaggio localizzato contiene `Riprova` e dopo la riapertura l'inventario resta coerente con una sola icona personalizzata equipaggiata | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |

### Matrice Android per versione del sistema

Per ridurre il rischio di differenze tra versioni Android, la verifica è
separata tra la versione minima dichiarata dalla toolchain Expo/RN del
progetto (API 24) e una versione recente (API 36, allineata a
`compileSdk`/`targetSdk`). Ogni riga richiede una build installabile, il
rifiuto controllato una tantum, il retry riuscito, la chiusura/riapertura
forzata e il controllo dell'inventario server.

| Versione Android scelta | Build/installazione | Acquisto + rifiuto/retry | Equipaggiamento + rifiuto/retry | Reset + rifiuto/retry | Riapertura forzata + icona visibile + inventario server |
| --- | --- | --- | --- | --- | --- |
| Android 7.0 / API 24 (minima supportata) | N/E — Java, SDK ed emulatore assenti su questo host | N/E — nessun rifiuto reale del bridge; verificare acquisto conservato, `Riprova` e icona precedente | N/E — nessun rifiuto reale del bridge; verificare `Riprova`, icona precedente e una sola icona custom | N/E — nessun rifiuto reale del bridge; verificare `Riprova`, icona precedente e una sola icona custom | N/E — nessuna build installata per confrontare launcher e `icona_futura` equipaggiata |
| Android 16 / API 36 (recente) | N/E — Java, SDK ed emulatore assenti su questo host | N/E — nessun rifiuto reale del bridge; verificare acquisto conservato, `Riprova` e icona precedente | N/E — nessun rifiuto reale del bridge; verificare `Riprova`, icona precedente e una sola icona custom | N/E — nessun rifiuto reale del bridge; verificare `Riprova`, icona precedente e una sola icona custom | N/E — nessuna build installata per confrontare launcher e `icona_futura` equipaggiata |

### Evidenza per host installabile

Le celle `N/E` significano “non eseguito”: non rappresentano un esito
negativo del prodotto, ma l'assenza dell'host nativo richiesto. Questa matrice
separa esplicitamente simulatore/emulatore e dispositivo reale, così ogni
installazione futura può essere registrata senza sostituire l'evidenza
automatica con una prova indiretta.

| Piattaforma | Host | Acquisto + rifiuto/retry | Equipaggiamento + rifiuto/retry | Reset + rifiuto/retry | Riapertura forzata + inventario server |
| --- | --- | --- | --- | --- | --- |
| Android | Emulatore | N/E — Java/ADB/emulatore assenti | N/E — Java/ADB/emulatore assenti | N/E — Java/ADB/emulatore assenti | N/E — nessuna build installata |
| Android | Dispositivo reale | N/E — Java/ADB assenti | N/E — Java/ADB assenti | N/E — Java/ADB assenti | N/E — nessuna build installata |
| iOS | Simulatore | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — nessuna build installata |
| iOS | Dispositivo reale | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — nessuna build installata |

### Matrice iOS separata

Queste sono le righe iOS da compilare su un host Apple. Ogni cella è
indipendente: un esito positivo in simulatore non sostituisce quello su
dispositivo reale, e un flusso completato non rende superati gli altri due.

| Host iOS | Build/installazione | Acquisto + rifiuto/retry | Equipaggiamento + rifiuto/retry | Reset + rifiuto/retry | Riapertura forzata + inventario |
| --- | --- | --- | --- | --- | --- |
| Simulatore | N/E — `xcodebuild`/`xcrun`/`simctl` assenti su Linux | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova`, acquisto conservato e una sola icona custom | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessun rifiuto reale con nome `nil`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessuna build installata |
| Dispositivo reale | N/E — `xcodebuild`/firma/dispositivo Apple assenti su Linux | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova`, acquisto conservato e una sola icona custom | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessun rifiuto reale con nome `nil`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessuna build installata |

Per ogni riga, dopo il rifiuto:

1. controllare che il messaggio localizzato spieghi il problema e mostri
   `Riprova`;
2. premere `Riprova` dopo aver riabilitato il bridge e verificare che il nuovo
   tentativo riesca;
3. chiudere forzatamente e riaprire l'app;
4. confrontare l'icona mostrata nel launcher con l'elemento `icona_futura`
   equipaggiato nell'inventario server;
5. verificare che non risultino mai due icone personalizzate equipaggiate.

Questa macchina non consente di spuntare la matrice: non dispone di Java per
compilare Android, di SDK/`adb`/emulatore o di macOS/Xcode per compilare e
installare iOS. Di conseguenza in questa sessione non è stato possibile
installare alcuna build, provocare un rifiuto reale del bridge, verificare
`Riprova`, osservare l'icona nel launcher o eseguire la chiusura/riapertura
forzata su un emulatore/simulatore o dispositivo reale. Le prove automatiche
sono invece tutte superate e coprono i tre rollback, l'inventario serializzato,
il messaggio localizzato e la disponibilità del retry. Le differenze tra
simulatore/emulatore e dispositivo reale vanno registrate quando sarà
disponibile un host nativo; le celle `N/E` non costituiscono evidenza
installabile.
