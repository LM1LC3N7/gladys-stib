// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widgets).
// -----------------------------------------------------------------------------

const every = (seconds) => (seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`);

export const T = {
  ok: (stops, pacing) =>
    pacing.anonymous
      ? {
          en: `Watching ${stops} stop${stops === 1 ? '' : 's'} without a subscription key: refreshed every ${every(pacing.pollSeconds)} to stay within the anonymous quota (100 requests a day). A free key gives real time.`,
          fr: `${stops} arrêt${stops > 1 ? 's' : ''} suivi${stops > 1 ? 's' : ''} sans clé d'abonnement : rafraîchi${stops > 1 ? 's' : ''} toutes les ${every(pacing.pollSeconds)} pour rester dans le quota anonyme (100 requêtes par jour). Une clé gratuite donne le temps réel.`,
        }
      : {
          en: `Watching ${stops} stop${stops === 1 ? '' : 's'}, refreshed every ${every(pacing.pollSeconds)}.`,
          fr: `${stops} arrêt${stops > 1 ? 's' : ''} suivi${stops > 1 ? 's' : ''}, rafraîchi${stops > 1 ? 's' : ''} toutes les ${every(pacing.pollSeconds)}.`,
        },
  noStop: {
    en: 'No stop yet: open Discovery and add a stop, or type stops in the configuration.',
    fr: 'Aucun arrêt : ouvrez Découverte et ajoutez un arrêt, ou saisissez des arrêts dans la configuration.',
  },
  unreachable: (message) => ({
    en: `The STIB-MIVB open data is unreachable: ${message}. Retrying at the next refresh.`,
    fr: `Les données ouvertes de la STIB-MIVB sont injoignables : ${message}. Nouvel essai au prochain rafraîchissement.`,
  }),
  unknownStop: (query) => ({
    en: `Unknown stop "${query}": check the spelling (the "Search stops" button helps).`,
    fr: `Arrêt inconnu « ${query} » : vérifiez l'orthographe (le bouton « Chercher des arrêts » aide).`,
  }),
  tested: ({ stops, points, watched, anonymous }) => ({
    en: `STIB-MIVB answers: ${stops} stops (${points} platforms) known, ${watched} watched. ${anonymous ? 'No subscription key: anonymous quota, departures every 20 minutes.' : 'Subscription key set.'}`,
    fr: `La STIB-MIVB répond : ${stops} arrêts (${points} quais) connus, ${watched} suivi(s). ${anonymous ? "Pas de clé d'abonnement : quota anonyme, départs toutes les 20 minutes." : "Clé d'abonnement renseignée."}`,
  }),
  widget: {
    noStop: {
      en: 'Pick a stop in the widget settings',
      fr: 'Choisissez un arrêt dans les réglages du widget',
    },
    notLoaded: { en: 'Waiting for the first reading…', fr: 'En attente de la première lecture…' },
    noDeparture: { en: 'No departure announced', fr: 'Aucun départ annoncé' },
    none: {
      en: 'No notice for your stops and lines',
      fr: 'Aucun avis pour vos arrêts et lignes',
    },
    inMinutes: (m) => ({
      en: m === 0 ? 'now' : `in ${m} min`,
      fr: m === 0 ? 'maintenant' : `dans ${m} min`,
    }),
    last: { en: 'last', fr: 'dernier' },
    network: { en: 'STIB network', fr: 'Réseau STIB' },
    myStop: { en: 'My stop', fr: 'Mon arrêt' },
    myLine: { en: 'My line', fr: 'Ma ligne' },
    line: { en: 'Line', fr: 'Ligne' },
    lines: { en: 'Lines', fr: 'Lignes' },
    total: (n) => ({ en: `${n} notices on the network`, fr: `${n} avis sur le réseau` }),
    readAt: { en: 'Updated', fr: 'Mis à jour' },
    source: { en: 'STIB-MIVB open data', fr: 'données ouvertes STIB-MIVB' },
  },
};
