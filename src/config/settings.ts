import type { Language } from '../i18n';
import { GAME_CONFIG } from './game';
import { clamp } from '../utils/math';

export interface Settings {
  language: Language;
  music: number;
  sfx: number;
  ambient: number;
  uiScale: number;
  quality: 'low' | 'high';
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'pt-BR',
  music: 0.4,
  sfx: 0.7,
  ambient: 0.3,
  uiScale: 1,
  quality: 'high',
  reducedMotion: false,
};

export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return s;
  const r = raw as Record<string, unknown>;
  if (r.language === 'pt-BR' || r.language === 'en') s.language = r.language;
  for (const k of ['music', 'sfx', 'ambient'] as const) {
    if (typeof r[k] === 'number' && Number.isFinite(r[k])) s[k] = clamp(r[k] as number, 0, 1);
  }
  if (typeof r.uiScale === 'number' && Number.isFinite(r.uiScale)) s.uiScale = clamp(r.uiScale, 0.8, 1.5);
  if (r.quality === 'low' || r.quality === 'high') s.quality = r.quality;
  if (typeof r.reducedMotion === 'boolean') s.reducedMotion = r.reducedMotion;
  return s;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(GAME_CONFIG.settingsKey);
    if (raw) return sanitizeSettings(JSON.parse(raw));
  } catch {
    // Storage unavailable or invalid JSON: use defaults.
  }
  const s = { ...DEFAULT_SETTINGS };
  try {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      s.reducedMotion = true;
  } catch {
    // ignore
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(GAME_CONFIG.settingsKey, JSON.stringify(s));
  } catch {
    // ignore: settings are optional
  }
}
