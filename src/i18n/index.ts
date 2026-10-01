import { en } from './en';
import { ptBR, type MessageKey } from './pt-BR';

export type Language = 'pt-BR' | 'en';
export const LANGUAGES: Language[] = ['pt-BR', 'en'];

export type Params = Record<string, string | number>;

const dictionaries: Record<Language, Partial<Record<MessageKey, string>>> = {
  'pt-BR': ptBR,
  en,
};

let current: Language = 'pt-BR';

export function setLanguage(lang: Language): void {
  current = LANGUAGES.includes(lang) ? lang : 'pt-BR';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function getLanguage(): Language {
  return current;
}

function locale(): string {
  return current === 'pt-BR' ? 'pt-BR' : 'en-US';
}

export function formatMoney(v: number, decimals = 0): string {
  const n = Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n).toLocaleString(locale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

export function formatNumber(v: number, decimals = 1): string {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatPercent(v: number, decimals = 0, signed = false): string {
  const n = Number.isFinite(v) ? v * 100 : 0;
  const s = n.toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${signed && n > 0 ? '+' : ''}${s}%`;
}

/** Whether a key exists in the base dictionary. */
export function hasKey(key: string): key is MessageKey {
  return key in ptBR;
}

/**
 * Translates a key. Template placeholders: {name}, {name:money}, {name:num},
 * {name:pct}. Param values starting with "@" are themselves translated.
 */
export function t(key: string, params?: Params): string {
  const dict = dictionaries[current];
  const template =
    (dict as Record<string, string | undefined>)[key] ??
    (ptBR as Record<string, string | undefined>)[key] ??
    key;
  if (!params) return template;
  return template.replace(/\{(\w+)(?::(\w+))?\}/g, (_m, name: string, fmt?: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    if (typeof v === 'string') return v.startsWith('@') ? t(v.slice(1)) : v;
    switch (fmt) {
      case 'money':
        return formatMoney(v);
      case 'num':
        return formatNumber(v);
      case 'pct':
        return formatPercent(v);
      default:
        return String(v);
    }
  });
}

/** Localizes a stored "key|{json params}" string (ledger, notifications). */
export function localizeStored(text: string): string {
  const bar = text.indexOf('|');
  if (bar < 0) return t(text);
  try {
    return t(text.slice(0, bar), JSON.parse(text.slice(bar + 1)) as Params);
  } catch {
    return t(text.slice(0, bar));
  }
}
