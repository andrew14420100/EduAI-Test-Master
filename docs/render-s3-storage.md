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