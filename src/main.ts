import './ui/styles.css';
import { App } from './app';
import { GAME_CONFIG } from './config/game';
import { t } from './i18n';
import { createPlatform } from './platform';

function showFatal(message: string): void {
  const el = document.createElement('div');
  el.id = 'fatal';
  el.innerHTML = '';
  const box = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = GAME_CONFIG.name;
  const p = document.createElement('p');
  p.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = '↻';
  btn.onclick = () => window.location.reload();
  box.append(title, p, btn);
  el.append(box);
  document.body.append(el);
}

let errorToasts = 0;
function reportError(err: unknown): void {
  console.error('[runtime]', err);
  // Minor errors never produce a white screen: show a discreet message instead.
  if (errorToasts > 3) return;
  errorToasts++;
  const toasts = document.getElementById('toasts');
  if (toasts) {
    const n = document.createElement('div');
    n.className = 'toast error';
    n.textContent = `⛔ ${t('error.generic')}`;
    toasts.prepend(n);
    window.setTimeout(() => n.remove(), 5000);
  }
}

window.addEventListener('error', (e) => reportError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

async function boot(): Promise<void> {
  const uiRoot = document.getElementById('ui-root');
  const container = document.getElementById('game-container');
  if (!uiRoot || !container) throw new Error('missing root elements');
  const platform = await createPlatform();
  const app = new App(uiRoot, container, platform);
  app.showMenu();
}

boot().catch((err) => {
  console.error(err);
  showFatal(String(err instanceof Error ? err.message : err));
});
