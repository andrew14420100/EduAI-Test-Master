import { randomUUID } from "crypto";
import { db, labExercisesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

type SeedExercise = {
  subject: string;
  topic: string;
  title: string;
  prompt: string;
  exerciseType: "multiple_choice" | "free_text";
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  difficultyLevel: "base" | "medio" | "avanzato";
  points: number;
};

const EXERCISES: SeedExercise[] = [
  // ── Ingegneria Informatica ─────────────────────────────────────────────────
  {
    subject: "Ingegneria Informatica",
    topic: "Algoritmi",
    title: "Complessità Bubble Sort",
    prompt:
      "Qual è la complessità temporale nel caso peggiore dell'algoritmo Bubble Sort?",
    exerciseType: "multiple_choice",
    options: ["O(n)", "O(n log n)", "O(n²)", "O(log n)"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Algoritmi",
    title: "Ricerca binaria: precondizione",
    prompt:
      "Per applicare correttamente la ricerca binaria, quale condizione deve soddisfare l'array di input?",
    exerciseType: "multiple_choice",
    options: [
      "Deve contenere solo numeri interi",
      "Deve essere ordinato",
      "Deve avere lunghezza pari a una potenza di 2",
      "Non ci sono precondizioni",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Strutture dati",
    title: "Stack vs Queue",
    prompt:
      "Descrivi la differenza principale tra uno stack e una coda, indicando il principio di accesso di ciascuna struttura e un esempio di utilizzo reale.",
    exerciseType: "free_text",
    correctAnswer:
      "Lo stack segue il principio LIFO (Last In, First Out): l'ultimo elemento inserito è il primo ad essere rimosso. Esempio: gestione delle chiamate a funzione (call stack). La coda segue il principio FIFO (First In, First Out): il primo elemento inserito è il primo ad essere rimosso. Esempio: gestione delle richieste in un server web.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Strutture dati",
    title: "Albero binario di ricerca",
    prompt:
      "In un albero binario di ricerca (BST) con n nodi bilanciato, qual è la complessità temporale media di una ricerca?",
    exerciseType: "multiple_choice",
    options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Ricorsione",
    title: "Caso base della ricorsione",
    prompt:
      "Perché ogni funzione ricorsiva deve obbligatoriamente avere almeno un caso base? Cosa accade se è assente?",
    exerciseType: "free_text",
    correctAnswer:
      "Il caso base è la condizione che interrompe le chiamate ricorsive. Senza di esso la funzione continua a richiamare sé stessa all'infinito, causando uno stack overflow (esaurimento dello stack di chiamate) e il crash del programma.",
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Reti",
    title: "Protocollo TCP vs UDP",
    prompt:
      "Quale delle seguenti affermazioni descrive correttamente la differenza tra TCP e UDP?",
    exerciseType: "multiple_choice",
    options: [
      "TCP è più veloce di UDP perché non usa checksum",
      "UDP garantisce la consegna dei pacchetti, TCP no",
      "TCP garantisce la consegna e l'ordine dei pacchetti; UDP è privo di connessione e non garantisce la consegna",
      "TCP e UDP sono equivalenti ma operano su livelli OSI diversi",
    ],
    correctIndex: 2,
    difficultyLevel: "avanzato",
    points: 14,
  },
  {
    subject: "Ingegneria Informatica",
    topic: "Algoritmi",
    title: "Algoritmo di Dijkstra",
    prompt:
      "L'algoritmo di Dijkstra per il cammino minimo non funziona correttamente in presenza di archi con peso negativo. Spiega il motivo.",
    exerciseType: "free_text",
    correctAnswer:
      "Dijkstra si basa sulla proprietà di selezione greedy: una volta estratto un nodo dalla coda con priorità, il suo costo viene considerato definitivo. Con pesi negativi, un percorso più lungo potrebbe diventare ottimale dopo aver attraversato un arco negativo, ma l'algoritmo non rivede i nodi già estratti, portando a risultati errati.",
    difficultyLevel: "avanzato",
    points: 16,
  },

  // ── Ingegneria Meccanica / Civile / Gestionale ─────────────────────────────
  {
    subject: "Ingegneria Meccanica",
    topic: "Meccanica dei materiali",
    title: "Legge di Hooke",
    prompt:
      "Enuncia la legge di Hooke e specifica il campo di validità in termini di comportamento del materiale.",
    exerciseType: "free_text",
    correctAnswer:
      "La legge di Hooke afferma che la deformazione di un corpo elastico è direttamente proporzionale alla forza applicata: σ = E·ε, dove σ è la tensione, E il modulo di Young e ε la deformazione unitaria. È valida solo nel campo elastico lineare, cioè al di sotto del limite di proporzionalità del materiale.",
    difficultyLevel: "base",
    points: 10,
  },
  {
    subject: "Ingegneria Meccanica",
    topic: "Termodinamica",
    title: "Primo principio della termodinamica",
    prompt:
      "Quale formula esprime correttamente il primo principio della termodinamica per un sistema chiuso?",
    exerciseType: "multiple_choice",
    options: [
      "ΔU = Q + W (con W lavoro compiuto sul sistema)",
      "ΔU = Q − W (con W lavoro compiuto dal sistema)",
      "ΔU = W − Q",
      "Q = ΔU",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Ingegneria Meccanica",
    topic: "Dinamica",
    title: "Seconda legge di Newton",
    prompt:
      "Un oggetto di massa 5 kg è soggetto a una forza risultante di 20 N. Qual è la sua accelerazione?",
    exerciseType: "multiple_choice",
    options: ["1 m/s²", "4 m/s²", "10 m/s²", "100 m/s²"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Ingegneria Meccanica",
    topic: "Resistenza dei materiali",
    title: "Trave inflessa: tensione massima",
    prompt:
      "In una trave soggetta a flessione, in quale zona della sezione trasversale si raggiunge la tensione normale massima?",
    exerciseType: "multiple_choice",
    options: [
      "Al baricentro della sezione",
      "Alle fibre più lontane dall'asse neutro",
      "Al centro dell'anima",
      "Uniformemente su tutta la sezione",
    ],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Ingegneria Meccanica",
    topic: "Progettazione meccanica",
    title: "Coefficiente di sicurezza",
    prompt:
      "Spiega il concetto di coefficiente di sicurezza nella progettazione meccanica e indica come viene calcolato.",
    exerciseType: "free_text",
    correctAnswer:
      "Il coefficiente di sicurezza (CS) è il rapporto tra la resistenza del materiale (o carico di rottura) e la tensione di esercizio: CS = σ_limite / σ_esercizio. Garantisce che il componente operi con un margine di sicurezza rispetto al cedimento, tenendo conto di incertezze sui carichi, variabilità dei materiali e imperfezioni costruttive.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Ingegneria Meccanica",
    topic: "Macchine",
    title: "Rendimento di una macchina",
    prompt:
      "Il rendimento η di una macchina è definito come il rapporto tra energia utile prodotta e energia fornita. Se una macchina riceve 500 J e ne restituisce 350 J di energia utile, qual è il rendimento?",
    exerciseType: "multiple_choice",
    options: ["35%", "60%", "70%", "85%"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 8,
  },

  // ── Scienze Matematiche, Fisiche e Naturali ────────────────────────────────
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Analisi matematica",
    title: "Derivata di una funzione composta",
    prompt:
      "Qual è la derivata di f(x) = sin(x²) rispetto a x?",
    exerciseType: "multiple_choice",
    options: ["cos(x²)", "2x · cos(x²)", "2x · sin(x²)", "cos(2x)"],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Fisica",
    title: "Conservazione dell'energia meccanica",
    prompt:
      "In assenza di forze dissipative, l'energia meccanica di un sistema si conserva. Spiega cosa si intende per energia meccanica e scrivi l'espressione della sua conservazione.",
    exerciseType: "free_text",
    correctAnswer:
      "L'energia meccanica è la somma di energia cinetica (Ec = ½mv²) e energia potenziale (Ep). In assenza di attriti: Ec₁ + Ep₁ = Ec₂ + Ep₂. Per esempio, in un campo gravitazionale uniforme: ½mv₁² + mgh₁ = ½mv₂² + mgh₂.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Algebra lineare",
    title: "Determinante e invertibilità",
    prompt:
      "Una matrice quadrata A è invertibile se e solo se:",
    exerciseType: "multiple_choice",
    options: [
      "La sua traccia è diversa da zero",
      "Il suo determinante è diverso da zero",
      "È una matrice simmetrica",
      "Ha tutti gli autovalori uguali",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Fisica quantistica",
    title: "Principio di indeterminazione di Heisenberg",
    prompt:
      "Enuncia il principio di indeterminazione di Heisenberg e spiega le sue implicazioni fisiche.",
    exerciseType: "free_text",
    correctAnswer:
      "Il principio di indeterminazione di Heisenberg afferma che non è possibile conoscere simultaneamente con precisione arbitraria la posizione e la quantità di moto di una particella: Δx · Δp ≥ ħ/2. Implica che la natura ha un limite fondamentale alla precisione di misura di coppie di variabili coniugate, non per limiti strumentali ma per la natura ondulatoria della materia.",
    difficultyLevel: "avanzato",
    points: 16,
  },
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Statistica",
    title: "Distribuzione normale",
    prompt:
      "In una distribuzione normale standard, quale percentuale di dati cade entro ±1 deviazione standard dalla media?",
    exerciseType: "multiple_choice",
    options: ["50%", "68%", "95%", "99,7%"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Scienze Matematiche, Fisiche e Naturali",
    topic: "Analisi matematica",
    title: "Teorema fondamentale del calcolo",
    prompt:
      "Enuncia il teorema fondamentale del calcolo integrale e spiega il collegamento tra derivazione e integrazione.",
    exerciseType: "free_text",
    correctAnswer:
      "Il teorema fondamentale del calcolo afferma che se F è una primitiva di f su [a,b], allora ∫ₐᵇ f(x)dx = F(b) − F(a). Il collegamento è bidirezionale: la derivata di un integrale definito rispetto al suo estremo superiore restituisce l'integranda, mostrando che derivazione e integrazione sono operazioni inverse.",
    difficultyLevel: "avanzato",
    points: 14,
  },

  // ── Liceo Scientifico ──────────────────────────────────────────────────────
  {
    subject: "Liceo Scientifico",
    topic: "Matematica",
    title: "Equazioni di secondo grado",
    prompt:
      "Qual è il discriminante dell'equazione 2x² − 5x + 3 = 0?",
    exerciseType: "multiple_choice",
    options: ["1", "25", "−24", "49"],
    correctIndex: 0,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Liceo Scientifico",
    topic: "Fisica",
    title: "Leggi di Keplero",
    prompt:
      "Enuncia la seconda legge di Keplero (legge delle aree) e spiega il suo legame con la conservazione del momento angolare.",
    exerciseType: "free_text",
    correctAnswer:
      "La seconda legge di Keplero afferma che il raggio vettore tra il Sole e un pianeta spazza aree uguali in tempi uguali. Questo è una conseguenza della conservazione del momento angolare: in assenza di forze tangenziali (la forza gravitazionale è centrale), il momento angolare L = m·r·v_perp si conserva, quindi quando il pianeta è più vicino al Sole si muove più velocemente.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Liceo Scientifico",
    topic: "Matematica",
    title: "Limite notevole",
    prompt:
      "Qual è il valore del limite: lim(x→0) [sin(x)/x]?",
    exerciseType: "multiple_choice",
    options: ["0", "∞", "1", "Non esiste"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Liceo Scientifico",
    topic: "Chimica",
    title: "Legami covalenti",
    prompt:
      "Descrivi la differenza tra un legame covalente polare e uno apolare, con un esempio per ciascuno.",
    exerciseType: "free_text",
    correctAnswer:
      "Un legame covalente apolare si forma tra atomi della stessa elettronegatività: gli elettroni sono condivisi equamente (es. H₂, O₂). Un legame covalente polare si forma tra atomi con elettronegatività diversa: gli elettroni sono spostati verso l'atomo più elettronegativo, creando dipoli parziali (es. HCl, H₂O).",
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Liceo Scientifico",
    topic: "Fisica",
    title: "Circuiti in serie e parallelo",
    prompt:
      "Due resistenze R₁ = 4Ω e R₂ = 6Ω sono collegate in parallelo. Qual è la resistenza equivalente?",
    exerciseType: "multiple_choice",
    options: ["10 Ω", "2,4 Ω", "5 Ω", "1 Ω"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Liceo Scientifico",
    topic: "Matematica",
    title: "Logaritmi: proprietà fondamentali",
    prompt:
      "Quale delle seguenti è la corretta proprietà del logaritmo di un prodotto?",
    exerciseType: "multiple_choice",
    options: [
      "log(a · b) = log(a) · log(b)",
      "log(a · b) = log(a) + log(b)",
      "log(a · b) = log(a) − log(b)",
      "log(a · b) = log(a)^b",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },

  // ── Istituto Tecnico Tecnologico (Informatica/Elettronica/Meccanica) ────────
  {
    subject: "Istituto Tecnico Tecnologico – Informatica",
    topic: "Elettronica di base",
    title: "Transistor come interruttore",
    prompt:
      "In un circuito digitale, in quale condizione un transistor BJT NPN funziona come interruttore chiuso (conduzione)?",
    exerciseType: "multiple_choice",
    options: [
      "Quando la tensione base-emettitore è nulla",
      "Quando la corrente di base è sufficiente a portarlo in saturazione",
      "Quando la tensione collettore-emettitore supera 5V",
      "Quando la base è collegata direttamente al collettore",
    ],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Istituto Tecnico Tecnologico – Informatica",
    topic: "Logica digitale",
    title: "Porta logica NAND",
    prompt:
      "Quale valore produce una porta NAND con due ingressi A=1 e B=1?",
    exerciseType: "multiple_choice",
    options: ["1", "0", "Non definito", "Dipende dall'alimentazione"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 6,
  },
  {
    subject: "Istituto Tecnico Tecnologico – Informatica",
    topic: "Programmazione",
    title: "Ciclo for vs while",
    prompt:
      "Spiega in quali situazioni è preferibile usare un ciclo for rispetto a un ciclo while, e viceversa. Porta un esempio per ciascuno.",
    exerciseType: "free_text",
    correctAnswer:
      "Il ciclo for è preferibile quando si conosce a priori il numero di iterazioni (es. scorrere un array di 10 elementi). Il ciclo while è preferibile quando il numero di iterazioni dipende da una condizione che cambia a runtime (es. leggere dati fino a EOF). Esempio for: for i in range(10). Esempio while: while line := input().",
    difficultyLevel: "base",
    points: 10,
  },
  {
    subject: "Istituto Tecnico Tecnologico – Elettronica",
    topic: "Elettronica di base",
    title: "Legge di Ohm",
    prompt:
      "Secondo la legge di Ohm, se una resistenza di 10 Ω è collegata a una tensione di 5 V, qual è la corrente che la attraversa?",
    exerciseType: "multiple_choice",
    options: ["50 A", "2 A", "0,5 A", "0,05 A"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 6,
  },
  {
    subject: "Istituto Tecnico Tecnologico – Elettronica",
    topic: "Segnali",
    title: "Segnale analogico vs digitale",
    prompt:
      "Descrivi la differenza fondamentale tra un segnale analogico e uno digitale, indicando vantaggi e svantaggi di ciascuno.",
    exerciseType: "free_text",
    correctAnswer:
      "Un segnale analogico assume valori continui in un intervallo e rappresenta grandezze fisiche in modo diretto (es. tensione audio). Un segnale digitale assume solo valori discreti (tipicamente 0 e 1). Vantaggi del digitale: maggiore immunità al rumore, facilità di memorizzazione e trasmissione. Svantaggio: richiede conversione (ADC/DAC) per interfacciarsi col mondo fisico.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Istituto Tecnico Tecnologico – Meccanica",
    topic: "Meccanica",
    title: "Forza di attrito",
    prompt:
      "Un blocco di 10 kg è su un piano orizzontale con coefficiente di attrito statico μs = 0,4. Qual è la forza massima prima che il blocco si metta in moto? (g = 10 m/s²)",
    exerciseType: "multiple_choice",
    options: ["4 N", "40 N", "400 N", "0,4 N"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },

  // ── Chimica ────────────────────────────────────────────────────────────────
  {
    subject: "Chimica",
    topic: "Bilanciamento reazioni",
    title: "Bilanciamento reazione di combustione",
    prompt:
      "Bilancia la seguente reazione di combustione del metano: CH₄ + O₂ → CO₂ + H₂O",
    exerciseType: "multiple_choice",
    options: [
      "CH₄ + O₂ → CO₂ + H₂O",
      "CH₄ + 2O₂ → CO₂ + 2H₂O",
      "2CH₄ + O₂ → 2CO₂ + H₂O",
      "CH₄ + 3O₂ → CO₂ + 2H₂O",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Chimica",
    topic: "Stechiometria",
    title: "Calcolo massa molare",
    prompt:
      "Qual è la massa molare dell'acqua (H₂O)? (Masse atomiche: H = 1, O = 16)",
    exerciseType: "multiple_choice",
    options: ["8 g/mol", "16 g/mol", "18 g/mol", "20 g/mol"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 6,
  },
  {
    subject: "Chimica",
    topic: "Equilibrio chimico",
    title: "Principio di Le Chatelier",
    prompt:
      "Enuncia il principio di Le Chatelier e spiega come si applica a una reazione esotermica all'equilibrio quando si aumenta la temperatura.",
    exerciseType: "free_text",
    correctAnswer:
      "Il principio di Le Chatelier afferma che se un sistema all'equilibrio è soggetto a una perturbazione, il sistema evolve in modo da contrastare la perturbazione e ristabilire un nuovo equilibrio. Per una reazione esotermica, aumentare la temperatura equivale ad aggiungere calore al sistema: l'equilibrio si sposta verso i reagenti (reazione inversa, endotermica) per assorbire il calore in eccesso.",
    difficultyLevel: "medio",
    points: 14,
  },
  {
    subject: "Chimica",
    topic: "Stechiometria",
    title: "Moli e numero di Avogadro",
    prompt:
      "Quante molecole sono contenute in 2 moli di CO₂? (Numero di Avogadro = 6,022 × 10²³)",
    exerciseType: "multiple_choice",
    options: [
      "6,022 × 10²³",
      "1,204 × 10²⁴",
      "3,011 × 10²³",
      "2,408 × 10²⁴",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Chimica",
    topic: "Chimica organica",
    title: "Isomeria strutturale",
    prompt:
      "Spiega il concetto di isomeria strutturale in chimica organica, con un esempio relativo ai butani.",
    exerciseType: "free_text",
    correctAnswer:
      "Due composti sono isomeri strutturali se hanno la stessa formula molecolare ma diversa connettività degli atomi (struttura). Esempio: n-butano (catena lineare C-C-C-C) e isobutano/2-metilpropano (con un carbonio centrale ramificato): entrambi hanno formula C₄H₁₀ ma proprietà fisiche diverse.",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Chimica",
    topic: "Equilibrio chimico",
    title: "pH e concentrazione di H⁺",
    prompt:
      "Una soluzione ha una concentrazione di ioni H⁺ pari a 10⁻³ mol/L. Qual è il suo pH?",
    exerciseType: "multiple_choice",
    options: ["3", "−3", "7", "11"],
    correctIndex: 0,
    difficultyLevel: "base",
    points: 6,
  },

  // ── Medicina e Professioni Sanitarie ──────────────────────────────────────
  {
    subject: "Medicina e Chirurgia",
    topic: "Anatomia",
    title: "Sistema nervoso centrale",
    prompt:
      "Quali strutture compongono il sistema nervoso centrale (SNC)?",
    exerciseType: "multiple_choice",
    options: [
      "Nervi periferici e gangli",
      "Encefalo e midollo spinale",
      "Encefalo e nervi cranici",
      "Midollo spinale e ganglio dorsale",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Medicina e Chirurgia",
    topic: "Biochimica",
    title: "ATP e metabolismo energetico",
    prompt:
      "Spiega il ruolo dell'ATP nel metabolismo cellulare e indica le principali vie di sintesi.",
    exerciseType: "free_text",
    correctAnswer:
      "L'ATP (adenosina trifosfato) è la principale moneta energetica della cellula: immagazzina e trasferisce energia chimica attraverso l'idrolisi del legame fosfoanidrido (ATP → ADP + Pᵢ). Le principali vie di sintesi sono: glicolisi (citoplasma, 2 ATP netti per glucosio), ciclo di Krebs e fosforilazione ossidativa/catena respiratoria (mitocondri, ~30-32 ATP totali per glucosio in condizioni aerobiche).",
    difficultyLevel: "avanzato",
    points: 16,
  },
  {
    subject: "Medicina e Chirurgia",
    topic: "Fisiologia",
    title: "Potenziale d'azione",
    prompt:
      "Qual è la sequenza corretta degli eventi durante un potenziale d'azione neuronale?",
    exerciseType: "multiple_choice",
    options: [
      "Depolarizzazione → Ripolarizzazione → Iperpolarizzazione",
      "Iperpolarizzazione → Depolarizzazione → Ripolarizzazione",
      "Ripolarizzazione → Depolarizzazione → Iperpolarizzazione",
      "Depolarizzazione → Iperpolarizzazione → Ripolarizzazione",
    ],
    correctIndex: 0,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Medicina e Chirurgia",
    topic: "Anatomia",
    title: "Muscolo cardiaco",
    prompt:
      "Elenca tre caratteristiche che distinguono il muscolo cardiaco dal muscolo scheletrico.",
    exerciseType: "free_text",
    correctAnswer:
      "1) Il muscolo cardiaco è striato ma involontario, mentre lo scheletrico è volontario. 2) Le cellule cardiache (cardiomiociti) sono interconnesse da dischi intercalari con gap junction, che permettono la propagazione rapida del segnale elettrico come un sincizio. 3) Il muscolo cardiaco ha un periodo refrattario assoluto molto lungo (circa 250 ms) che impedisce la tetania, garantendo la rilassazione diastolica necessaria al riempimento.",
    difficultyLevel: "avanzato",
    points: 16,
  },
  {
    subject: "Professioni Sanitarie",
    topic: "Farmacologia",
    title: "Farmacocinetica: biodisponibilità",
    prompt:
      "Cosa si intende per biodisponibilità di un farmaco e perché la via orale può avere biodisponibilità inferiore alla via endovenosa?",
    exerciseType: "free_text",
    correctAnswer:
      "La biodisponibilità è la frazione del farmaco somministrato che raggiunge la circolazione sistemica in forma attiva. La via endovenosa ha biodisponibilità del 100% perché il farmaco è iniettato direttamente nel sangue. La via orale può avere biodisponibilità inferiore per: assorbimento intestinale incompleto, metabolismo di primo passaggio epatico (il farmaco viene parzialmente metabolizzato prima di entrare in circolo) e instabilità gastrica.",
    difficultyLevel: "avanzato",
    points: 16,
  },
  {
    subject: "Professioni Sanitarie",
    topic: "Anatomia",
    title: "Ossa dello scheletro assile",
    prompt:
      "Quante vertebre compone la colonna vertebrale umana adulta in condizioni normali?",
    exerciseType: "multiple_choice",
    options: ["24", "26", "30", "33"],
    correctIndex: 3,
    difficultyLevel: "base",
    points: 6,
  },

  // ── Architettura ──────────────────────────────────────────────────────────
  {
    subject: "Architettura",
    topic: "Geometria descrittiva",
    title: "Proiezione ortogonale",
    prompt:
      "Nella proiezione ortogonale (diedro europeo), dove sono collocate le viste in pianta, prospetto e sezione rispetto al foglio?",
    exerciseType: "free_text",
    correctAnswer:
      "Nel metodo europeo (primo diedro): la pianta (vista dall'alto) è posizionata sotto il prospetto frontale; i prospetti laterali sono affiancati al prospetto frontale (a destra e sinistra). In pratica: in alto c'è il prospetto frontale, sotto di esso la pianta, a destra il prospetto laterale destro (visto da sinistra), a sinistra il prospetto laterale sinistro (visto da destra).",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Architettura",
    topic: "Statica",
    title: "Tipologie di vincoli",
    prompt:
      "Qual è il numero di reazioni vincolari fornite da un appoggio doppio (carrello) in una struttura piana?",
    exerciseType: "multiple_choice",
    options: ["1", "2", "3", "0"],
    correctIndex: 0,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Architettura",
    topic: "Composizione architettonica",
    title: "Proporzione aurea",
    prompt:
      "Spiega il concetto di sezione aurea (proporzione φ) e fornisci un esempio della sua applicazione in architettura storica.",
    exerciseType: "free_text",
    correctAnswer:
      "La sezione aurea (φ ≈ 1,618) è il rapporto in cui un segmento è diviso in due parti tali che il rapporto della parte maggiore alla minore è uguale al rapporto del segmento intero alla parte maggiore. In architettura è stata applicata, tra l'altro, nelle proporzioni del Partenone di Atene, dove molte relazioni tra lunghezza, altezza e colonne si avvicinano al valore aureo. Ha influenzato anche la composizione rinascimentale (Vitruvio, Alberti).",
    difficultyLevel: "medio",
    points: 12,
  },
  {
    subject: "Architettura",
    topic: "Materiali da costruzione",
    title: "Calcestruzzo armato",
    prompt:
      "Perché nel calcestruzzo armato si utilizza l'acciaio come rinforzo e non altri metalli comuni come l'alluminio?",
    exerciseType: "free_text",
    correctAnswer:
      "L'acciaio è preferito perché: 1) ha un coefficiente di dilatazione termica simile al calcestruzzo, evitando tensioni interne durante le variazioni di temperatura; 2) ha alta resistenza a trazione, compensando la debolezza del calcestruzzo a trazione; 3) aderisce bene al calcestruzzo anche senza rivestimenti speciali. L'alluminio avrebbe un coefficiente di dilatazione molto diverso e reagisce con il calcestruzzo alcalino, degradandosi.",
    difficultyLevel: "avanzato",
    points: 14,
  },
  {
    subject: "Architettura",
    topic: "Storia dell'architettura",
    title: "Arco a tutto sesto vs arco a sesto acuto",
    prompt:
      "Qual è la differenza strutturale tra l'arco a tutto sesto (romanico) e l'arco a sesto acuto (gotico), e come questa differenza influisce sulle spinte trasmesse ai pilastri?",
    exerciseType: "free_text",
    correctAnswer:
      "L'arco a tutto sesto è semicircolare e trasmette spinte prevalentemente verticali e orizzontali elevate ai piedritti; richiede muri spessi o contrafforti robusti. L'arco a sesto acuto concentra la spinta più verticalmente (riduce la componente orizzontale), permettendo muri più sottili, finestre più grandi e volte più alte — caratteristiche del gotico, compensate dall'uso di archi rampanti.",
    difficultyLevel: "avanzato",
    points: 16,
  },
  {
    subject: "Architettura",
    topic: "Statica",
    title: "Struttura isostatica",
    prompt:
      "Una trave appoggiata su due appoggi semplici è isostatica. Quante equazioni di equilibrio sono disponibili in un problema piano e quante incognite vincola questa configurazione?",
    exerciseType: "multiple_choice",
    options: [
      "3 equazioni, 2 incognite — struttura labile",
      "3 equazioni, 3 incognite — struttura isostatica",
      "3 equazioni, 4 incognite — struttura iperstatica",
      "2 equazioni, 2 incognite — struttura isostatica",
    ],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },

  // ── Liceo Artistico / Liceo Musicale ──────────────────────────────────────
  {
    subject: "Liceo Artistico",
    topic: "Teoria del colore",
    title: "Colori complementari",
    prompt:
      "Nel modello di colore RGB, quali sono i colori complementari del rosso, del verde e del blu?",
    exerciseType: "multiple_choice",
    options: [
      "Ciano, magenta, giallo",
      "Verde, blu, rosso",
      "Giallo, viola, arancione",
      "Arancione, ciano, magenta",
    ],
    correctIndex: 0,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Liceo Artistico",
    topic: "Composizione visiva",
    title: "Regola dei terzi",
    prompt:
      "Spiega la regola dei terzi nella composizione visiva e indica perché è preferita alla composizione centrata nella fotografia e nella pittura.",
    exerciseType: "free_text",
    correctAnswer:
      "La regola dei terzi divide l'immagine in una griglia 3×3 con due linee orizzontali e due verticali. I soggetti principali vengono posizionati lungo queste linee o ai loro incroci (punti di forza). È preferita alla composizione centrata perché crea dinamismo e tensione visiva, guida l'occhio dello spettatore in modo più naturale e lascia spazio narrativo intorno al soggetto.",
    difficultyLevel: "base",
    points: 10,
  },
  {
    subject: "Liceo Artistico",
    topic: "Storia dell'arte",
    title: "Impressionismo: caratteristiche",
    prompt:
      "Quale delle seguenti NON è una caratteristica dell'Impressionismo?",
    exerciseType: "multiple_choice",
    options: [
      "Pittura en plein air",
      "Cattura degli effetti di luce istantanei",
      "Pennellate rapide e visibili",
      "Rappresentazione dettagliata e accademica della forma",
    ],
    correctIndex: 3,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Liceo Artistico",
    topic: "Disegno tecnico",
    title: "Scala di rappresentazione",
    prompt:
      "Un edificio lungo 30 m deve essere rappresentato in scala 1:200. Quanto misura il disegno?",
    exerciseType: "multiple_choice",
    options: ["0,15 m", "15 cm", "1,5 m", "6000 m"],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 6,
  },
  {
    subject: "Liceo Musicale",
    topic: "Teoria musicale",
    title: "Intervalli musicali",
    prompt:
      "Quanti semitoni compone un'ottava nel sistema temperato?",
    exerciseType: "multiple_choice",
    options: ["7", "8", "12", "24"],
    correctIndex: 2,
    difficultyLevel: "base",
    points: 6,
  },
  {
    subject: "Liceo Musicale",
    topic: "Armonia",
    title: "Accordo di dominante",
    prompt:
      "In tonalità di Do maggiore, quali note compongono l'accordo di settima di dominante (V7)?",
    exerciseType: "multiple_choice",
    options: [
      "Do – Mi – Sol – Si",
      "Sol – Si – Re – Fa",
      "Sol – Si – Re – Mi",
      "Re – Fa – La – Do",
    ],
    correctIndex: 1,
    difficultyLevel: "medio",
    points: 10,
  },
  {
    subject: "Liceo Musicale",
    topic: "Forme musicali",
    title: "Forma Sonata",
    prompt:
      "Descrivi le tre sezioni principali della forma Sonata classica e la funzione armonico-tematica di ciascuna.",
    exerciseType: "free_text",
    correctAnswer:
      "1) Esposizione: presenta i due temi contrastanti (primo in tonica, secondo in dominante o relativa maggiore). 2) Sviluppo: elabora motivicamente i temi, modulando a tonalità lontane, creando tensione. 3) Riesposizione (ripresa): ripresenta entrambi i temi nella tonica, risolvendo la tensione armonica. Spesso è preceduta da un'Introduzione lenta e seguita da una Coda.",
    difficultyLevel: "avanzato",
    points: 16,
  },

  // ── Istituto Professionale ─────────────────────────────────────────────────
  {
    subject: "Istituto Professionale – Alberghiero",
    topic: "Pratica tecnica",
    title: "Temperature di sicurezza alimentare",
    prompt:
      "A quale temperatura i cibi potenzialmente pericolosi devono essere conservati per prevenire la moltiplicazione batterica, secondo le norme HACCP?",
    exerciseType: "multiple_choice",
    options: [
      "Sotto 0°C o sopra 100°C",
      "Sotto 4°C o sopra 65°C",
      "Sotto 10°C o sopra 50°C",
      "Non ci sono limiti specifici",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
  {
    subject: "Istituto Professionale – Servizi Socio-Sanitari",
    topic: "Pratica tecnica",
    title: "Comunicazione con l'utente",
    prompt:
      "Descrivi tre principi fondamentali della comunicazione efficace con un anziano con difficoltà uditive in ambito socio-sanitario.",
    exerciseType: "free_text",
    correctAnswer:
      "1) Parlare lentamente e con tono chiaro, evitando di urlare (distorce il suono). 2) Mantenere il contatto visivo e il viso visibile per facilitare la lettura labiale. 3) Usare frasi brevi e semplici, verificare la comprensione chiedendo conferma e, se necessario, scrivere le informazioni più importanti.",
    difficultyLevel: "base",
    points: 10,
  },
  {
    subject: "Istituto Professionale – Manutenzione",
    topic: "Pratica tecnica",
    title: "Sicurezza elettrica",
    prompt:
      "Prima di eseguire qualsiasi intervento su un quadro elettrico, qual è la prima operazione obbligatoria per la sicurezza dell'operatore?",
    exerciseType: "multiple_choice",
    options: [
      "Indossare i guanti",
      "Sezionare e bloccare l'alimentazione (LOTO) e verificare l'assenza di tensione",
      "Avvisare il responsabile",
      "Leggere il manuale del quadro",
    ],
    correctIndex: 1,
    difficultyLevel: "base",
    points: 8,
  },
];

let seeded = false;

export async function seedLabExercisesIfEmpty(): Promise<void> {
  if (seeded) return;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(labExercisesTable);

  if (count > 0) {
    seeded = true;
    return;
  }

  const rows = EXERCISES.map((ex) => ({
    id: randomUUID(),
    subject: ex.subject,
    topic: ex.topic,
    title: ex.title,
    prompt: ex.prompt,
    exerciseType: ex.exerciseType,
    options: ex.options ?? null,
    correctIndex: ex.correctIndex ?? null,
    correctAnswer: ex.correctAnswer ?? null,
    difficultyLevel: ex.difficultyLevel,
    points: ex.points,
  }));

  await db.insert(labExercisesTable).values(rows);
  seeded = true;
}
