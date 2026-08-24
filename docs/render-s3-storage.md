# Storage esterno per Render

Il backend usa uno storage compatibile con l’API S3. Questo permette di mantenere
il backend su Render senza dipendere dal sidecar Object Storage locale di Replit.
Il flusso dell’app non cambia: il backend restituisce un URL `PUT` firmato,
l’app carica direttamente il file e poi finalizza il materiale.

## Variabili del servizio Render

Configurare queste variabili come segreti nel servizio API di Render:

| Variabile | Descrizione |
| --- | --- |
| `S3_ENDPOINT` | Endpoint HTTPS S3 del provider |
| `S3_REGION` | Regione del bucket; usare `auto` se indicato dal provider |
| `S3_BUCKET` | Nome del bucket |
| `S3_ACCESS_KEY_ID` | Access key del servizio S3 |
| `S3_SECRET_ACCESS_KEY` | Secret key del servizio S3 |

Variabile opzionale:

| Variabile | Default |
| --- | --- |
| `S3_FORCE_PATH_STYLE` | `true`; impostare `false` solo se il provider richiede URL virtual-hosted |

Per mantenere i percorsi già salvati nel database, configurare anche:

```text
PRIVATE_OBJECT_DIR=/nome-bucket/eduai-private
PUBLIC_OBJECT_SEARCH_PATHS=/nome-bucket/eduai-public
```

I valori delle due variabili devono usare il nome del bucket come primo segmento.
Il bucket deve restare privato: i materiali degli studenti non devono essere
pubblicati direttamente dal provider. L’accesso in lettura passa dall’endpoint
autenticato dell’API e dai controlli ACL applicativi.

## Requisiti del bucket

- endpoint raggiungibile via HTTPS da Render;
- permesso del servizio di creare URL firmati, leggere, aggiornare metadata e
  cancellare oggetti;
- CORS che permetta `PUT` dall’app mobile/web verso l’endpoint firmato;
- nessun accesso anonimo in lettura al prefisso `eduai-private`;
- limite di dimensione coerente con il limite applicativo di 250 MB per audio e video.

Le chiavi non devono essere inserite nel repository, nel file `.env` condiviso o
nel codice. Dopo aver configurato il servizio, riavviare Render e verificare in
ordine richiesta URL, upload binario, finalizzazione e analisi del materiale.

Per il test dal preview web o da una build web, il bucket R2 deve inoltre
permettere il preflight `OPTIONS` e il metodo `PUT` dall’origine dell’app,
esponendo almeno `ETag` e `Content-Length`. Il caricamento nativo Android/iOS
non usa il preflight del browser.

## Smoke test production

Eseguire il test con un account di test autenticato e con file non sensibili.
`TOKEN` è il bearer token Clerk dell’account di test e non deve essere
committato o incollato nei log.

```bash
API=https://eduai-test-master-backend.onrender.com/api
TOKEN='token-temporaneo-non-committare'
FILE=sample.pdf
TYPE=application/pdf
SIZE=$(wc -c < "$FILE")

curl -fsS "$API/storage/uploads/request-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$FILE\",\"size\":$SIZE,\"contentType\":\"$TYPE\"}"
```

Dalla risposta usare `uploadURL` e `objectPath` nei passaggi successivi:

```bash
curl -fsS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: $TYPE" \
  --upload-file "$FILE"

curl -fsS -X POST "$API/materials" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"objectPath\":\"$OBJECT_PATH\",\"contentType\":\"$TYPE\",\"size\":$SIZE}"
```

Ripetere la sequenza con almeno questi campioni:

| Tipo | MIME da dichiarare | Risultato atteso |
| --- | --- | --- |
| PDF | `application/pdf` | analisi testo/OCR `ready` |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | estrazione testo `ready` |
| Immagine | `image/jpeg` o `image/png` | OCR `ready` con testo leggibile |
| Audio | `audio/m4a`, `audio/mpeg` o `audio/wav` | trascrizione `ready` |
| Video | `video/mp4` | trascrizione dalla traccia audio `ready` |

La finalizzazione deve rifiutare dimensione o MIME alterati e non deve
accettare un `objectPath` di un altro utente. Verificare inoltre che una
richiesta senza `Authorization` a
`GET /storage/objects/<path>` risponda `401` e che l’URL S3 non sia leggibile
anonimamente. L’app Android usa già
`https://eduai-test-master-backend.onrender.com` come API fallback in
`app.json`; per una nuova `.aab` usare il profilo EAS `production` e verificare
che il `versionCode` remoto sia stato incrementato prima di inviare a Google
Play.