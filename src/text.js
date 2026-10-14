// -----------------------------------------------------------------------------
// Small text helpers shared by the pure modules. Pure.
// -----------------------------------------------------------------------------

/** Lowercase, no accents, no punctuation: "Gare de l'Ouest" -> "gare de l ouest". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The datasets embed JSON documents as strings ("passingtimes", "name"...):
 * parse them, or fall back when a field is missing or broken.
 */
export function parseJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

/** The text of a { fr, nl, en, de } object in a language, with fallbacks. */
export function localized(texts, language = 'fr') {
  if (!texts || typeof texts !== 'object') {
    return typeof texts === 'string' ? texts : null;
  }
  return texts[language] ?? texts.fr ?? texts.nl ?? texts.en ?? texts.de ?? null;
}

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'aux', 'au', 'sur']);
const SMALL_WORDS_NL = new Set(['van', 'het', 'ter', 'der', 'den', 'en', 'op']);

/**
 * STIB writes its names in capitals ("GARE DE L'OUEST"): a readable form
 * for the device names and the widgets ("Gare de l'Ouest").
 */
export function prettyName(text) {
  const words = String(text ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return words
    .map((word, i) => {
      if (i > 0 && (SMALL_WORDS.has(word) || SMALL_WORDS_NL.has(word))) {
        return word;
      }
      const elided = /^([ld]')(.+)$/.exec(word);
      const capitalize = (w) =>
        w.replace(/(^|[-.'(/])(\p{L})/gu, (_m, s, c) => s + c.toUpperCase());
      return elided && i > 0 ? elided[1] + capitalize(elided[2]) : capitalize(word);
    })
    .join(' ');
}

/** Lines in the order a reader expects: 1, 2, 5, 6, 8, 54, 92, T81. */
export function compareLines(a, b) {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const ka = Number.isFinite(na) ? na : 10_000;
  const kb = Number.isFinite(nb) ? nb : 10_000;
  return ka - kb || String(a).localeCompare(String(b));
}
