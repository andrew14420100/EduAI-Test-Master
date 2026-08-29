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

## Pipeline macOS per la build QA

La verifica installabile non dipende da questo workspace Linux: il workflow
GitHub Actions `iOS native icon QA` (`.github/workflows/ios-native-icon-qa.yml`)
usa un runner `macos-14`, installa le dipendenze CocoaPods, controlla i
build settings risolti da Xcode e pubblica la build Debug per iOS Simulator
insieme ai log. Può essere avviato con `workflow_dispatch` oppure da una
modifica ai file nativi/documentali coinvolti.

La pipeline esegue, nell'ordine:

1. `pnpm run test:native-icons` e `pnpm run test:icon-recovery`;
2. `pod install --project-directory=ios --repo-update`;
3. `pnpm run verify:ios-harness`, che interroga Xcode per entrambe le
   configurazioni e richiede `EDUAI_ICON_DEBUG_HARNESS_ENABLED = YES` in
   `Debug` e `NO` in `Release`;
4. `xcodebuild` con `-configuration Debug`, `-sdk iphonesimulator`,
   `CODE_SIGNING_ALLOWED=NO` e `SKIP_BUNDLING=0`, producendo
   `EduAITestMaster-Debug-iphonesimulator.zip`;
5. upload dell'app e di `ios-harness-settings.log`/`ios-debug-build.log`
   nell'artefatto `ios-native-icon-qa-<run_id>`.

Il flag `SKIP_BUNDLING=0` è intenzionale: una build Debug lanciata dalla
pipeline deve contenere il bundle JavaScript ed essere installabile senza un
Metro locale. La modifica non cambia il comportamento delle build Debug
avviate normalmente da Xcode, che continuano a usare Metro quando il flag non
è impostato.

La build del simulatore non dimostra firma o provisioning per un iPhone. Per un
dispositivo reale è disponibile un percorso separato e manuale nello stesso
workflow: selezionare `Esegui anche la build IPA firmata e l'installazione su
iPhone QA` durante `workflow_dispatch`. Il job richiede l'environment GitHub
protetto `ios-hardware-qa`, un runner macOS self-hosted con label
`ios-hardware-qa` e un iPhone già accoppiato. Non parte su push né quando
l'input manuale è disattivato.

Prima di abilitarlo, configurare esclusivamente nell'environment protetto questi
segreti: `IOS_QA_CERTIFICATE_BASE64` (certificato `.p12` codificato base64),
`IOS_QA_CERTIFICATE_PASSWORD`, `IOS_QA_PROVISIONING_PROFILE_BASE64` (profilo
development codificato base64), `IOS_QA_TEAM_ID` e `IOS_QA_DEVICE_UDID`.
Facoltativamente, le variabili `IOS_QA_DEVICE_NAME`,
`IOS_QA_DEVICE_MODEL` e `IOS_QA_DEVICE_OS_VERSION` aggiungono etichette alla
scheda. Il job usa un keychain temporaneo, verifica che il profilo autorizzi
l'UDID, esporta una IPA `development` e installa con `xcrun devicectl`.
Certificato, password, profilo e keychain vengono rimossi a fine job; l'artefatto
non contiene il certificato, la password o il profilo sorgente come file
separati, ma solo la IPA firmata (con il profilo embedded richiesto da iOS), i
log di firma/installazione e i metadati del dispositivo.

L'artefatto del percorso hardware è
`ios-native-icon-hardware-qa-<run_id>` e conserva
`EduAITestMaster-QA-signed.ipa`, `ios-signing-metadata.log`,
`ios-device-metadata.log`, i log di archive/export/installazione e le
impostazioni del harness. Il job può fallire sull'installazione se il telefono
non è accoppiato o autorizzato, ma i log vengono comunque pubblicati per la
checklist. Non classificare come "superato" un test reale solo perché la
pipeline macOS ha compilato il simulatore o prodotto la IPA: compilazione,
installazione e tre scenari di rifiuto restano evidenze indipendenti.

## Checklist di esecuzione su host Apple

Creare una scheda per ogni run e conservarla insieme all'artefatto della
pipeline. Il campo `ID log/evidenza` deve contenere il GitHub Actions run ID
e il nome dell'artefatto, oppure il percorso del log esportato da Xcode.

### Dati comuni

- Run ID / ID log pipeline:
- Commit:
- Data e ora (UTC):
- Versione Xcode:
- Versione macOS:
- Versione app / build number:
- Account di test:
- Endpoint API usato:

### Simulatore iOS

- Modello e versione iOS:
- UDID simulatore:
- Build installata: `EduAITestMaster-Debug-iphonesimulator.zip`
- Firma/provisioning: `CODE_SIGNING_ALLOWED=NO` (simulatore)
- ID log/evidenza installazione:
- Installazione e avvio: `N/E` / `PASS` / `FAIL`
- `acquisto`: rifiuto una volta, collezione conservata, `Riprova`, riapertura:
- `equipaggiamento`: rifiuto una volta, inventario precedente, `Riprova`, riapertura:
- `ripristino`: rifiuto una volta con nome `nil`, icona precedente, `Riprova`, riapertura:
- Note:

### Dispositivo iOS reale

- Modello e versione iOS: `N/E` — compilare da `ios-device-metadata.log`
- UDID dispositivo: `N/E` — compilare da `ios-device-metadata.log`
- Build/IPA installata: `N/E` — `EduAITestMaster-QA-signed.ipa` nell'artefatto hardware
- Team / certificato di firma: `N/E` — compilare da `ios-signing-metadata.log`
- Profilo di provisioning e scadenza: `N/E` — compilare da `ios-signing-metadata.log`
- Stato firma/installazione: `N/E` — eseguire il job hardware manuale su host Apple
- ID log/evidenza installazione: `N/E` — usare `run_id` e artefatto `ios-native-icon-hardware-qa-<run_id>`
- `acquisto`: `N/E` — verificare rifiuto reale, `Riprova`, riapertura e inventario server
- `equipaggiamento`: `N/E` — verificare rifiuto reale, `Riprova`, riapertura e inventario server
- `ripristino`: `N/E` — verificare rifiuto reale, `Riprova`, riapertura e inventario server
- Note: il job hardware richiede un host Apple, un iPhone accoppiato, un profilo development valido e l'environment GitHub protetto.

Per ciascuno dei tre scenari compilare il risultato solo dopo aver verificato
il rifiuto reale di `setAlternateIconName`, il messaggio con `Riprova`, il
secondo tentativo riuscito, la chiusura forzata/riapertura e la coerenza
dell'inventario server. Simulatore e dispositivo reale sono evidenze
indipendenti.

## Controlli eseguiti

- `pnpm run typecheck`: superato.
- `pnpm run test:native-icons`: superato; mapping standard + cinque alternative
  coerente.
- `pnpm run test:icon-recovery`: superato; 13 test, 13 passati, 0 falliti.
- `pnpm run verify:ios-harness`: N/E su Linux; eseguibile nella pipeline macOS
  dopo `pod install`, con log `ios-harness-settings.log`.
- `pnpm run check:react-versions`: superato.
- Nella sessione del 29 agosto 2026 sono stati rieseguiti `pnpm run
  test:native-icons`, `pnpm run test:icon-recovery`, `pnpm run typecheck` e
  `pnpm run check:react-versions`: tutti superati; il recovery harness ha
  riportato 13 test superati, inclusa la verifica del flag Xcode Debug/Release
  e della pipeline macOS.
- `./android/gradlew assembleDebug --no-daemon --stacktrace`: la JVM parte con
  OpenJDK 17, ma la configurazione nativa si arresta con `SDK location not
  found`; la directory `/home/runner/.android-sdk` indicata da
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` non esiste, exit code 1. La prova è stata
  ripetuta il 29 agosto 2026 dalle 14:37:07 alle 14:37:22 UTC sul commit
  `cdbd97836f505060f1665d7d480d3571a63933d6`. Evidenza:
  `ANDROID-GRADLE-SDK-2026-08-29-RUN4`
  (`docs/evidence/android-preflight-2026-08-29-run4.txt`).
- `adb` è disponibile (Android Debug Bridge 35.0.1), ma `adb devices -l`
  restituisce solo l'intestazione senza dispositivi; `emulator` non è
  installato, non esistono AVD o system image e `/dev/kvm` è assente. Anche
  `sdkmanager` e `avdmanager` non sono disponibili. Il controllo è stato
  ripetuto il 29 agosto 2026 alle 14:36:51 UTC. Evidenza:
  `ANDROID-PREFLIGHT-2026-08-29-RUN4`
  (`docs/evidence/android-preflight-2026-08-29-run4.txt`).
- `eas whoami`: bloccato perché questo workspace non è autenticato a EAS
  (`Not logged in`, exit code 1); non è quindi disponibile nemmeno una build
  cloud da installare durante questa sessione.
- `xcodebuild`, `xcrun` e `simctl`: comandi assenti sull'host Linux; non è
  possibile produrre una build `.app`/`.ipa`, avviare un simulatore iOS o
  interrogare un dispositivo Apple collegato.
- Il dispatch manuale non è stato avviato da questo workspace: `gh auth status`
  ha restituito `not logged into any GitHub hosts` e
  `gh workflow run ... -f run_hardware_qa=true` è terminato con exit code 4.
  Non esistono quindi `run_id`, IPA o artefatto hardware da associare a questa
  sessione; il dispatch va eseguito da un account autorizzato sul repository.
- Android: `AppIconManager` è registrato nel package React Native; il manifest
  dichiara l'alias standard attivo e cinque alias alternativi disattivati, con
  risorse mipmap in tutte le densità.
- iOS: `AppIcon.appiconset` resta l'icona standard; sono presenti cinque set
  alternativi 1024×1024, `CFBundleAlternateIcons` e l'implementazione
  `setAlternateIconName`.
- L'host è Linux e non dispone di `xcodebuild`, `xcrun`, Xcode o macOS; non è
  stato possibile compilare né installare una build iOS.
- `adb` è disponibile, ma non risultano emulatori o dispositivi collegati,
  quindi non è stato possibile verificare cambio, reset o chiusura/riapertura
  su Android. Evidenza: `ANDROID-PREFLIGHT-2026-08-29-RUN4`.
- Sul commit corrente `4a16c9f84c06a69d7c96cd39c6fd4caeea69a663` il preflight è
  stato ripetuto: `./gradlew assembleDebug --no-daemon --stacktrace` fallisce
  ancora in configurazione con `SDK location not found`, senza produrre APK;
  `adb devices -l` resta senza dispositivi e mancano `sdkmanager`,
  `avdmanager`, `emulator` e `/dev/kvm`. Evidenza aggiornata:
  `ANDROID-PREFLIGHT-2026-08-29-RUN5` e
  `ANDROID-GRADLE-SDK-2026-08-29-RUN5`
  (`docs/evidence/android-preflight-2026-08-29-run5.txt`).

Gli ID `ANDROID-PREFLIGHT-2026-08-29-RUN5` e
`ANDROID-GRADLE-SDK-2026-08-29-RUN5` sono
osservazioni del preflight eseguito sul commit corrente, non log di una build
installata. Le evidenze automatiche aggiornate sono
`ANDROID-STATIC-2026-08-29-RUN5` (`pnpm run test:native-icons`, superato) e
`ANDROID-RECOVERY-2026-08-29-RUN5` (`pnpm run test:icon-recovery`, 13/13
superati). Il preflight precedente resta disponibile come riferimento in
`ANDROID-PREFLIGHT-2026-08-29-RUN4` e
`ANDROID-GRADLE-SDK-2026-08-29-RUN4`;
non sostituiscono la prova su API 24 e API 36.

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
| Android | acquisto di una nuova icona | rifiuto del bridge dopo la risposta positiva dell'acquisto | l'acquisto resta nella collezione, l'icona precedente resta visibile e una sola `icona_futura` è equipaggiata | N/E — host installabili ora presenti, ma nessun account/inventario di test autenticato disponibile per completare l'azione reale |
| Android | equipaggiamento di un'icona già posseduta | rifiuto del bridge dopo l'equipaggiamento server | l'inventario torna all'icona precedente, che resta visibile; il messaggio italiano offre `Riprova` | N/E — host installabili ora presenti, ma nessun account/inventario di test autenticato disponibile per completare l'azione reale |
| Android | reset con `Icona standard originale` | rifiuto del bridge durante il ritorno a `standard` | l'icona personalizzata precedente resta visibile e resta l'unica equipaggiata | N/E — host installabili ora presenti, ma nessun account/inventario di test autenticato disponibile per completare l'azione reale |
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
| Android 7.0 / API 24 (minima supportata) | PASS — APK Debug standalone compilato con `qaBundle=true`, SHA-256 `78d963bc52076a7e3253ae26e1a60656be1fe247970c1d96df8c29fdcc411f19`; installazione riuscita su `emulator-5554`, package `com.eduai.testmaster`, `versionCode=5`, evidenza `ANDROID-INSTALL-API24-2026-08-29-RUN2` (`docs/evidence/android-api24-install-2026-08-29.txt`) | N/E — deep link `acquisto` consegnato all'Activity su `emulator-5554` (`ANDROID-API24-HARNESS-2026-08-29-RUN1`), ma senza account/inventario autenticato non è osservabile il rifiuto/retry reale | N/E — nessun account/inventario autenticato per eseguire il flusso | N/E — nessun account/inventario autenticato per eseguire il flusso | N/E — app avviata con bundle embedded e UI onboarding osservabile; manca sessione autenticata per confrontare launcher e inventario server |
| Android 16 / API 36 (recente) | N/E — APK Debug disponibile con lo stesso SHA-256 `78d963bc52076a7e3253ae26e1a60656be1fe247970c1d96df8c29fdcc411f19`; AVD `eduai-api36` e host ADB `emulator-5556` identificati, ma l'emulatore TCG ha terminato `system_server` durante il boot e il Package Installer non ha completato (`docs/evidence/android-api36-preflight-2026-08-29.txt`) | N/E — nessun install completato su API 36 | N/E — nessun install completato su API 36 | N/E — nessun install completato su API 36 | N/E — `system_server` dell'AVD API 36 non è rimasto operativo abbastanza per installazione e riapertura |

### Evidenza per host installabile

Le celle `N/E` significano “non eseguito”: non rappresentano un esito
negativo del prodotto, ma l'assenza dell'host nativo richiesto. Questa matrice
separa esplicitamente simulatore/emulatore e dispositivo reale, così ogni
installazione futura può essere registrata senza sostituire l'evidenza
automatica con una prova indiretta.

| Piattaforma | Host | Acquisto + rifiuto/retry | Equipaggiamento + rifiuto/retry | Reset + rifiuto/retry | Riapertura forzata + inventario server |
| --- | --- | --- | --- | --- | --- |
| Android | Emulatore | N/E — JDK 17 e ADB 35.0.1 disponibili, ma SDK, `emulator`, system image API 24/36 e AVD non sono presenti; `/dev/kvm` non è disponibile (`ANDROID-PREFLIGHT-2026-08-29-RUN5`) | N/E — nessun ID di flusso; nessun rifiuto reale del bridge e manca un AVD installabile | N/E — nessun ID di flusso; nessun rifiuto reale del bridge e manca un AVD installabile | N/E — nessuna build/AVD installabile per verificare chiusura, riapertura, launcher e inventario server |
| Android | Dispositivo reale | N/E — JDK 17 e ADB 35.0.1 disponibili, ma `adb devices -l` non rileva dispositivi (`ANDROID-PREFLIGHT-2026-08-29-RUN5`); nessun APK o ID di installazione | N/E — nessun ID di flusso; nessun rifiuto reale del bridge e nessun dispositivo collegato | N/E — nessun ID di flusso; nessun rifiuto reale del bridge e nessun dispositivo collegato | N/E — nessuna build installata né dispositivo collegato per verificare chiusura, riapertura, launcher e inventario server |
| iOS | Simulatore | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — macOS/Xcode assenti | N/E — nessuna build installata |
| iOS | Dispositivo reale | N/E — job manuale `ios-hardware-qa` disponibile su runner macOS con IPA firmata | N/E — usare `ios-native-icon-hardware-qa-<run_id>` e verificare `Riprova`/riapertura dopo il rifiuto | N/E — verificare rifiuto reale, `Riprova`, riapertura e inventario server | N/E — installare la IPA e confrontare launcher, `icona_futura` e inventario server |

### Matrice iOS separata

Queste sono le righe iOS da compilare su un host Apple. Ogni cella è
indipendente: un esito positivo in simulatore non sostituisce quello su
dispositivo reale, e un flusso completato non rende superati gli altri due.

| Host iOS | Build/installazione | ID log/evidenza build | Acquisto + rifiuto/retry | Equipaggiamento + rifiuto/retry | Reset + rifiuto/retry | Riapertura forzata + inventario | Stato / ID log flussi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Simulatore | N/E — `xcodebuild`/`xcrun`/`simctl` assenti su Linux | N/E — nessun run macOS disponibile | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova`, acquisto conservato e una sola icona custom | N/E — nessun rifiuto reale di `setAlternateIconName`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessun rifiuto reale con nome `nil`; verificare icona precedente, `Riprova` e una sola icona custom | N/E — nessuna build installata | `N/E-2026-08-29-linux` |
| Dispositivo reale | N/E — job manuale `ios-hardware-qa` disponibile su runner macOS con IPA firmata e installazione `devicectl` | N/E — usare `ios-native-icon-hardware-qa-<run_id>` con IPA, log di firma/installazione e metadati dispositivo | N/E — verificare rifiuto reale di `setAlternateIconName`, acquisto conservato, `Riprova`, riapertura e inventario server | N/E — verificare rifiuto reale di `setAlternateIconName`, `Riprova`, riapertura e inventario server | N/E — verificare rifiuto reale con nome `nil`, `Riprova`, riapertura e inventario server | N/E — installare la IPA e confrontare launcher, `icona_futura` e unicità dell’icona | `N/E` — compilare con `run_id` e nome artefatto dopo il run hardware |

Quando la pipeline viene eseguita, compilare la riga del dispositivo reale con
`run_id`, nome dell'artefatto, modello/iOS/UDID, IPA, certificato e profilo di
provisioning. Aggiungere anche il log di installazione firmata e i dati di
provisioning; il run del simulatore non è sufficiente.

Per ogni riga, dopo il rifiuto:

1. controllare che il messaggio localizzato spieghi il problema e mostri
   `Riprova`;
2. premere `Riprova` dopo aver riabilitato il bridge e verificare che il nuovo
   tentativo riesca;
3. chiudere forzatamente e riaprire l'app;
4. confrontare l'icona mostrata nel launcher con l'elemento `icona_futura`
   equipaggiato nell'inventario server;
5. verificare che non risultino mai due icone personalizzate equipaggiate.

Questa macchina ora dispone di uno SDK Android locale, di `emulator`/AVD e di
un host API 24 installabile. La build standalone e l'avvio dell'app su API 24
sono osservabili nelle evidenze sopra. L'AVD API 36 è stato creato e
identificato, ma con l'emulazione TCG senza `/dev/kvm` il `system_server` è
terminato prima che il Package Installer restasse operativo; l'installazione
API 36 e i flussi autenticati restano quindi `N/E`, come indicato nella
matrice. Non sono stati simulati dati server: per completare i tre flussi serve
una sessione autenticata con un inventario di test. La riga `Dispositivo reale`
resta `N/E` finché il job hardware manuale non viene eseguito; la verifica iOS
resta da eseguire su host Apple con build firmata. Le prove automatiche sono
invece tutte superate e coprono i tre rollback, l'inventario serializzato, il
messaggio localizzato e la disponibilità del retry.
