// -----------------------------------------------------------------------------
// The dashboard widgets: "STIB departures" and "STIB network". Pure.
//
// `language` is the language of the dashboard (labels); `nameLanguage` the
// one chosen for the STIB names (fr/nl), as in the devices.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { T } from './i18n.js';
import { noticeText, statusText } from './model.js';
import { localized, prettyName } from './text.js';

const pick = (text, language) =>
  typeof text === 'string' ? text : (text[language] ?? text.en ?? text.fr);

function clock(iso, language) {
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : `${language}-BE`, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Brussels',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

const caption = (reading, language) => ({
  type: 'text',
  text: `${pick(T.widget.readAt, language)} ${clock(reading.readAt, language)} · ${pick(T.widget.source, language)}`,
  variant: 'caption',
});

export function departuresWidget({ stopName, reading, language = 'fr', nameLanguage = 'fr' }) {
  const components = [
    { type: 'text', text: (stopName ?? 'STIB').slice(0, 40), variant: 'heading' },
  ];
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 30, components };
  }
  if (reading.departures.length === 0) {
    // Two texts at most in a widget: the status replaces the caption.
    components.push({
      type: 'text',
      text: statusText(reading, nameLanguage) ?? T.widget.noDeparture,
      variant: 'body',
    });
    return { ttl_seconds: 60, components };
  }
  const items = reading.departures.slice(0, 8).map((d) => {
    const parts = [clock(d.expectedAt, language), pick(T.widget.inMinutes(d.minutes), language)];
    if (d.last) {
      parts.push(pick(T.widget.last, language));
    }
    return {
      label: `${d.line} → ${prettyName(localized(d.destination, nameLanguage))}`.slice(0, 40),
      value: parts.join(' · ').slice(0, 40),
      icon: 'navigation',
      color: d.last ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    };
  });
  components.push({ type: 'status', items });
  components.push(caption(reading, language));
  // The countdowns are recomputed at every pull (no request): a short TTL.
  return { ttl_seconds: 30, components };
}

export function networkWidget({ reading, lines = [], language = 'fr', nameLanguage = 'fr' }) {
  const components = [{ type: 'text', text: T.widget.network, variant: 'heading' }];
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 60, components };
  }
  const notices =
    lines.length > 0
      ? reading.items.filter((n) => n.lines.some((l) => lines.includes(l)))
      : reading.mine;
  const items = notices.slice(0, 8).map((n) => {
    const text = noticeText(n, nameLanguage);
    const badge = n.atMyStop
      ? { text: pick(T.widget.myStop, language), color: WIDGET_COLORS.WARNING }
      : { text: pick(T.widget.myLine, language), color: WIDGET_COLORS.INFO };
    return {
      title: text.slice(0, 60),
      subtitle:
        n.lines.length > 0
          ? `${pick(n.lines.length > 1 ? T.widget.lines : T.widget.line, language)} ${n.lines.join(', ')}`
          : undefined,
      badge: lines.length > 0 && !n.mine ? undefined : badge,
      description: text.slice(0, 2000),
    };
  });
  const total = T.widget.total(reading.total);
  if (items.length === 0) {
    // Two texts at most in a widget: the count joins the body.
    components.push({
      type: 'text',
      text: { en: `${T.widget.none.en} (${total.en})`, fr: `${T.widget.none.fr} (${total.fr})` },
      variant: 'body',
    });
    return { ttl_seconds: 300, components };
  }
  components.push({ type: 'card-list', display: 'list', items });
  components.push({
    type: 'text',
    text: `${pick(total, language)} · ${pick(T.widget.source, language)}`,
    variant: 'caption',
  });
  return { ttl_seconds: 300, components };
}
