# Verifica icone launcher native

Data verifica: 28 agosto 2026

## Esito

La verifica installabile richiesta da questa task non è eseguibile nell'ambiente
corrente. Il catalogo applicativo e quello server risultano allineati sulle
cinque alternative (`app_icon_midnight`, `app_icon_neon`,
`app_icon_scholar`, `app_icon_aurora`, `app_icon_legend`) più l'icona standard,
ma il progetto nativo non contiene ancora gli artefatti necessari per applicare
le scelte.

## Controlli eseguiti

- `pnpm run typecheck`: superato.
- `pnpm run check:react-versions`: superato.
- `./android/gradlew assembleDebug`: non avviato; l'host non dispone di Java,
  quindi Gradle termina prima della compilazione.
- `./android/gradlew --version`: stesso blocco per Java assente.
- Android: non sono presenti `AppIconManager`, alias `activity-alias` o risorse
  mipmap per le cinque icone alternative; il manifest dichiara soltanto
  `@mipmap/ic_launcher`.
- iOS: `AppIcon.appiconset` contiene soltanto l'icona standard; non risultano
  `CFBundleAlternateIcons`, set alternativi o implementazione
  `setAlternateIconName`.
- L'host è Linux e non dispone di Xcode/macOS; non è stato possibile compilare
  né installare una build iOS.
- Non sono disponibili `adb` o un emulatore/dispositivo collegato, quindi non
  è stato possibile verificare cambio, reset o chiusura/riapertura su Android.

## Verifiche ancora necessarie su host nativi

Dopo l'aggiunta degli artefatti nativi, eseguire su una build installabile:

1. Android: `assembleDebug`, installazione su emulatore e dispositivo reale,
   applicazione di tutte le cinque alternative, reset allo standard, chiusura
   forzata e riapertura.
2. iOS: build da macOS/Xcode, verifica di tutte le sei scelte tramite
   `setAlternateIconName`, reset allo standard, chiusura e riapertura.
3. Dopo ogni riapertura, confrontare l'icona visualizzata con l'elemento
   `icona_futura` equipaggiato nell'inventario server.

Le differenze tra simulatore/emulatore e dispositivo reale restano da
registrare dopo l'esecuzione: questa macchina non consente di osservarle.