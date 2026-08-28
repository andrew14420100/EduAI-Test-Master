export type GamificationBadgeId =
  | 'badge_streak3'
  | 'badge_streak7'
  | 'badge_streak30'
  | 'badge_first_100'
  | 'badge_quiz50';

export type GamificationBadge = {
  id: GamificationBadgeId | string;
  title: string;
  description: string;
  icon: 'award' | 'flame' | 'star' | 'shield' | 'medal';
};

export const GAMIFICATION_LEVEL_NAMES = [
  'Recluta',
  'Novizio',
  'Esploratore',
  'Osservatore',
  'Apprendista',
  'Iniziato',
  'Ricercatore',
  'Lettore',
  'Analista',
  'Studente',
  'Studente Curioso',
  'Studente Attivo',
  'Allievo',
  'Aspirante',
  'Praticante',
  'Studioso Dedito',
  'Esperto',
  'Specialista',
  'Mentore',
  'Accademico',
  'Accademico Junior',
  'Accademico Senior',
  'Accademico Brillante',
  'Scholar',
  'Erudito',
  'Sapiente',
  'Stratega',
  'Pensatore',
  'Maestro Junior',
  'Maestro',
  'Maestro Senior',
  'Maestro del Metodo',
  'Virtuoso',
  'Eccellenza',
  'Prodigio',
  'Genio',
  'Genio Accademico',
  'Campione',
  'Campione della Conoscenza',
  'Legend',
  'Leggenda dello Studio',
  'Grande Accademico',
  'Grande Maestro',
  'Maestro Supremo Junior',
  'Maestro Supremo',
  'Maestro Supremo Elite',
  'Faro del Sapere',
  'Mente Illuminata',
  'Leggenda Vivente',
  'Maestro Supremo',
] as const;

export const GAMIFICATION_BADGES: GamificationBadge[] = [
  { id: 'badge_streak3', title: 'Primi tre giorni', description: 'Studia per 3 giorni consecutivi.', icon: 'flame' },
  { id: 'badge_streak7', title: 'Settimana perfetta', description: 'Studia per 7 giorni consecutivi.', icon: 'flame' },
  { id: 'badge_streak30', title: 'Mese inarrestabile', description: 'Studia per 30 giorni consecutivi.', icon: 'flame' },
  { id: 'badge_first_100', title: 'Cento percento', description: 'Completa il primo test con precisione perfetta.', icon: 'star' },
  { id: 'badge_quiz50', title: 'Maratoneta dei quiz', description: 'Completa 50 quiz.', icon: 'medal' },
  // Legacy ids remain readable in profiles created before achievement badges
  // were separated from the shop catalog.
  { id: 'badge_first_pass', title: 'Prima verifica superata', description: 'Prima verifica completata.', icon: 'award' },
  { id: 'badge_100', title: 'Cento percento', description: 'Verifica al 100%.', icon: 'star' },
  { id: 'badge_error_hunter', title: 'Cacciatore di errori', description: 'Recupera gli errori con costanza.', icon: 'shield' },
  { id: 'badge_speed', title: 'Lampo del sapere', description: 'Completa una verifica rapidamente.', icon: 'star' },
  { id: 'badge_library', title: 'Biblioteca viva', description: 'Costruisci una grande libreria di studio.', icon: 'award' },
  { id: 'badge_grandmaster', title: 'Gran Maestro', description: 'Raggiungi un traguardo avanzato di domande corrette.', icon: 'star' },
];

export function gamificationLevelFromXp(xp: number) {
  return Math.min(GAMIFICATION_LEVEL_NAMES.length, Math.floor(Math.max(0, xp) / 100) + 1);
}

export function gamificationGradeFromXp(xp: number) {
  return GAMIFICATION_LEVEL_NAMES[gamificationLevelFromXp(xp) - 1] ?? GAMIFICATION_LEVEL_NAMES[0];
}