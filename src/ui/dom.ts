type Child = Node | string | number | null | undefined | false | Child[];
type Handler = (ev: Event) => void;

export interface Attrs {
  [key: string]: string | number | boolean | Handler | null | undefined;
}

/** Tiny hyperscript helper for building DOM without a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as Handler);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'style') {
        el.setAttribute('style', String(v));
      } else if (k === 'disabled' || k === 'checked' || k === 'selected') {
        (el as unknown as Record<string, boolean>)[k] = Boolean(v);
      } else if (k === 'value') {
        (el as unknown as Record<string, string>).value = String(v);
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

/** Appends children, skipping null/false values. */
export function mount(el: HTMLElement, ...children: Child[]): void {
  append(el, children);
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Progress bar element (0..1). */
export function bar(value: number, cls = ''): HTMLElement {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const color = v < 0.25 ? 'var(--bad)' : v < 0.5 ? 'var(--warn)' : 'var(--good)';
  return h(
    'div',
    { class: `bar ${cls}` },
    h('div', { class: 'bar-fill', style: `width:${(v * 100).toFixed(1)}%;background:${color}` }),
  );
}

export const ICONS = {
  money: '💰',
  date: '📅',
  select: '🖱️',
  buyLand: '🏷️',
  prepare: '🚜',
  plant: '🌱',
  irrigate: '💧',
  harvest: '🌾',
  build: '🏗️',
  cancel: '✖',
  land: '🗺️',
  crops: '🌽',
  machines: '🚜',
  buildings: '🏠',
  workers: '👷',
  market: '📈',
  finance: '📊',
  bank: '🏦',
  tech: '🔬',
  stats: '🏆',
  settings: '⚙️',
  notifications: '🔔',
  save: '💾',
  menu: '☰',
  pause: '⏸',
  play: '▶',
  storage: '📦',
  level: '⭐',
  sunny: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  heavyRain: '⛈️',
  heat: '🔥',
  drought: '🏜️',
  cold: '❄️',
  storm: '🌪️',
  spring: '🌸',
  summer: '🌞',
  autumn: '🍂',
  winter: '⛄',
  corn: '🌽',
  soy: '🫘',
  wheat: '🌾',
  potato: '🥔',
  sunflower: '🌻',
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '⛔',
  weather: '🌦️',
  economy: '💲',
} as const;

export function icon(key: string): string {
  return (ICONS as Record<string, string>)[key] ?? '•';
}
