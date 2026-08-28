# Verifica icone launcher native

Data verifica: 28 agosto 2026

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
- `pnpm run test:icon-recovery`: superato; 5 test, 5 passati, 0 falliti.
- `pnpm run check:react-versions`: superato.
- `./android/gradlew assembleDebug`: bloccato prima della compilazione; l'host
  non dispone di Java (`JAVA_HOME` non impostato e comando `java` assente).
- `./android/gradlew --version`: stesso blocco per Java assente.
- `eas whoami`: bloccato perché questo workspace non è autenticato a EAS; non è
  quindi disponibile nemmeno una build cloud da installare durante questa
  sessione.
- Android: `AppIconManager` è registrato nel package React Native; il manifest
  dichiara l'alias standard attivo e cinque alias alternativi disattivati, con
  risorse mipmap in tutte le densità.
- iOS: `AppIcon.appiconset` resta l'icona standard; sono presenti cinque set
  alternativi 1024×1024, `CFBundleAlternateIcons` e l'implementazione
  `setAlternateIconName`.
- L'host è Linux e non dispone di Xcode/macOS; non è stato possibile compilare
  né installare una build iOS.
- Non sono disponibili `adb` o un emulatore/dispositivo collegato, quindi non
  è stato possibile verificare cambio, reset o chiusura/riapertura su Android.

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
| iOS | acquisto di una nuova icona | rifiuto della chiamata `setAlternateIconName` | stessi risultati di Android | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |
| iOS | equipaggiamento di un'icona già posseduta | rifiuto della chiamata `setAlternateIconName` | stessi risultati di Android | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |
| iOS | reset con `Icona standard originale` | rifiuto della chiamata con nome alternativo `nil` | l'icona personalizzata precedente resta visibile e resta l'unica equipaggiata | Non eseguito: manca macOS/Xcode e simulatore/dispositivo |

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
compilare Android, di `adb`/emulatore o di macOS/Xcode per compilare e
installare iOS. Le prove automatiche sostitutive sono invece tutte superate e
coprono i tre rollback, l'inventario serializzato, il messaggio localizzato e
la disponibilità del retry. Le differenze tra simulatore/emulatore e
dispositivo reale vanno registrate quando sarà disponibile un host nativo.