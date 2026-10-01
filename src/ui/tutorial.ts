import { analytics } from '../analytics/AnalyticsService';
import type { GameSession } from '../game/GameSession';
import { t } from '../i18n';
import { growthFraction } from '../simulation/crops/growth';
import type { GameState } from '../simulation/types';
import { clear, h } from './dom';

export type TutorialSignal = 'camera' | 'inspect' | 'market';

interface Step {
  /** Element id to highlight. */
  highlight?: string;
  done(s: GameState, signals: Set<TutorialSignal>, startDay: number): boolean;
}

const STEPS: Step[] = [
  { done: (_s, sig) => sig.has('camera') },
  { highlight: 'tool-select', done: (_s, sig) => sig.has('inspect') },
  { highlight: 'tool-prepare', done: (s) => s.map.tiles.some((x) => x.field !== 'natural') },
  { highlight: 'tool-plant', done: (s) => s.stats.tilesPlanted > 0 },
  { highlight: 'speed-group', done: (s, _sig, start) => s.day > start },
  {
    highlight: 'tool-irrigate',
    done: (s, _sig, start) =>
      s.map.tiles.some((x) => x.crop && growthFraction(x.crop) >= 0.5) || s.day - start >= 10,
  },
  { highlight: 'tool-harvest', done: (s) => s.stats.tilesHarvested > 0 },
  { highlight: 'mgmt-market', done: (_s, sig) => sig.has('market') },
  { highlight: 'mgmt-market', done: (s) => s.stats.salesCount > 0 },
  { highlight: 'mgmt-land', done: () => false },
];

export const TUTORIAL_STEPS = STEPS.length;

/** Contextual first-game tutorial. Progress is stored in the game state. */
export class Tutorial {
  private el: HTMLElement;
  private signals = new Set<TutorialSignal>();
  private stepStartDay: number;
  private highlighted: HTMLElement | null = null;

  constructor(
    private root: HTMLElement,
    private session: GameSession,
  ) {
    this.el = h('div', { id: 'tutorial', class: 'hidden', 'data-testid': 'tutorial' });
    root.appendChild(this.el);
    this.stepStartDay = session.game.state.day;
    if (this.state.active && this.state.step === 0 && session.game.state.day === 0)
      analytics.track('tutorial_start');
    this.render();
  }

  private get state() {
    return this.session.game.state.tutorial;
  }

  signal(sig: TutorialSignal): void {
    if (!this.state.active) return;
    this.signals.add(sig);
    this.check();
  }

  /** Re-evaluates the current step (called on game events). */
  check(): void {
    const tut = this.state;
    if (!tut.active) return;
    const step = STEPS[tut.step];
    if (step && step.done(this.session.game.state, this.signals, this.stepStartDay)) this.next();
  }

  next(): void {
    const tut = this.state;
    if (tut.step >= STEPS.length - 1) {
      this.finish(false);
      return;
    }
    tut.step++;
    this.stepStartDay = this.session.game.state.day;
    this.render();
    // A step may already be satisfied (player is ahead of the tutorial).
    queueMicrotask(() => this.check());
  }

  finish(skipped: boolean): void {
    const tut = this.state;
    tut.active = false;
    tut.completed = !skipped;
    tut.skipped = skipped;
    analytics.track(skipped ? 'tutorial_skip' : 'tutorial_complete');
    this.render();
  }

  render(): void {
    const tut = this.state;
    this.highlighted?.classList.remove('pulse');
    this.highlighted = null;
    clear(this.el);
    if (!tut.active) {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    const i = tut.step;
    const last = i >= STEPS.length - 1;
    this.el.append(
      h('div', { class: 'muted small-text' }, t('tut.title', { step: i + 1, total: STEPS.length })),
      h('h4', null, t(`tut.${i}.title`)),
      h('p', null, t(`tut.${i}.text`)),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'small', 'data-testid': 'tutorial-skip', onclick: () => this.finish(true) },
          t('tut.skip'),
        ),
        h('span', { class: 'spacer' }),
        h(
          'button',
          { class: 'small primary', 'data-testid': 'tutorial-next', onclick: () => this.next() },
          last ? t('tut.done') : t('tut.next'),
        ),
      ),
    );
    const id = STEPS[i]?.highlight;
    if (id) {
      const target = this.root.querySelector<HTMLElement>(`#${id}`);
      if (target) {
        target.classList.add('pulse');
        this.highlighted = target;
      }
    }
  }

  destroy(): void {
    this.highlighted?.classList.remove('pulse');
    this.el.remove();
  }
}
