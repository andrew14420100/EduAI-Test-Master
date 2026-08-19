/**
 * Defines which Italian study paths get labs by default (STEM/technical)
 * and which are humanities-only (opt-in).
 */

// Paths that receive labs by default
export const STEM_PATHS: readonly string[] = [
  // Licei
  "Liceo Scientifico",
  "Liceo Artistico",
  "Liceo Musicale",
  // Istituti tecnici
  "Istituto Tecnico Tecnologico – Informatica",
  "Istituto Tecnico Tecnologico – Elettronica",
  "Istituto Tecnico Tecnologico – Meccanica",
  "Istituto Tecnico Economico – Amministrazione",
  "Istituto Tecnico Economico – Marketing",
  "Istituto Professionale – Alberghiero",
  "Istituto Professionale – Servizi Socio-Sanitari",
  "Istituto Professionale – Manutenzione",
  // Università STEM e sanitarie
  "Medicina e Chirurgia",
  "Professioni Sanitarie",
  "Ingegneria Informatica",
  "Ingegneria Meccanica",
  "Ingegneria Civile",
  "Ingegneria Gestionale",
  "Economia e Commercio",
  "Scienze Matematiche, Fisiche e Naturali",
  "Scienze Politiche",
  "Architettura",
  "Chimica",
];

// Paths that are humanities-only (labs opt-in via toggle)
export const HUMANITIES_PATHS: readonly string[] = [
  "Liceo Classico",
  "Liceo Linguistico",
  "Liceo delle Scienze Umane",
  "Giurisprudenza",
  "Psicologia",
  "Lettere e Filosofia",
  "Lingue e Letterature Straniere",
];

/**
 * Returns true for paths that should have labs enabled by default.
 * Unknown paths (not in either list) default to STEM treatment.
 */
export function hasLabsByDefault(level: string | null): boolean {
  if (!level) return false;
  // Humanities opt-in: return false
  if (HUMANITIES_PATHS.includes(level)) return false;
  // Everything else (STEM + unknown) defaults to true
  return true;
}

/**
 * Subject names (as stored in lab_exercises.subject) that map to a given path.
 * Returns an array of subject strings to use as filter.
 * Falls back to returning all subjects if no specific mapping found.
 */
export function subjectsForPath(level: string | null): string[] | null {
  if (!level) return null;

  const map: Record<string, string[]> = {
    "Liceo Scientifico": [
      "Liceo Scientifico",
      "Chimica",
      "Scienze Matematiche, Fisiche e Naturali",
    ],
    "Liceo Artistico": ["Liceo Artistico"],
    "Liceo Musicale": ["Liceo Musicale"],
    "Istituto Tecnico Tecnologico – Informatica": [
      "Istituto Tecnico Tecnologico – Informatica",
      "Ingegneria Informatica",
    ],
    "Istituto Tecnico Tecnologico – Elettronica": [
      "Istituto Tecnico Tecnologico – Elettronica",
    ],
    "Istituto Tecnico Tecnologico – Meccanica": [
      "Istituto Tecnico Tecnologico – Meccanica",
      "Ingegneria Meccanica",
    ],
    "Istituto Tecnico Economico – Amministrazione": [
      "Istituto Tecnico Economico – Amministrazione",
    ],
    "Istituto Tecnico Economico – Marketing": [
      "Istituto Tecnico Economico – Marketing",
    ],
    "Istituto Professionale – Alberghiero": [
      "Istituto Professionale – Alberghiero",
    ],
    "Istituto Professionale – Servizi Socio-Sanitari": [
      "Istituto Professionale – Servizi Socio-Sanitari",
    ],
    "Istituto Professionale – Manutenzione": [
      "Istituto Professionale – Manutenzione",
    ],
    "Medicina e Chirurgia": ["Medicina e Chirurgia", "Professioni Sanitarie"],
    "Professioni Sanitarie": ["Professioni Sanitarie", "Medicina e Chirurgia"],
    "Ingegneria Informatica": ["Ingegneria Informatica"],
    "Ingegneria Meccanica": ["Ingegneria Meccanica"],
    "Ingegneria Civile": ["Ingegneria Meccanica", "Architettura"],
    "Ingegneria Gestionale": ["Ingegneria Meccanica", "Ingegneria Informatica"],
    "Economia e Commercio": ["Economia e Commercio"],
    "Scienze Matematiche, Fisiche e Naturali": [
      "Scienze Matematiche, Fisiche e Naturali",
      "Chimica",
    ],
    "Scienze Politiche": ["Scienze Politiche"],
    "Architettura": ["Architettura"],
    // Humanities — mapped anyway for when user enables labs
    "Liceo Classico": ["Liceo Classico"],
    "Liceo Linguistico": ["Liceo Linguistico"],
    "Liceo delle Scienze Umane": ["Liceo delle Scienze Umane"],
    "Giurisprudenza": ["Giurisprudenza"],
    "Psicologia": ["Psicologia"],
    "Lettere e Filosofia": ["Lettere e Filosofia"],
    "Lingue e Letterature Straniere": ["Lingue e Letterature Straniere"],
  };

  return map[level] ?? null; // null means all subjects
}
