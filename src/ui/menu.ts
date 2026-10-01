import { audio } from '../audio/AudioManager';
import { GAME_CONFIG } from '../config/game';
import type { Settings } from '../config/settings';
import { REGION_IDS } from '../data/balance';
import { formatMoney, t } from '../i18n';
import type { SaveManager } from '../save/saveManager';
import type { NewGameOptions } from '../simulation/game';
import type { Difficulty, RegionId } from '../simulation/types';
import { clear, h, mount } from './dom';
import { confirmDialog, openModal } from './modal';
import { renderSettingsView } from './settingsView';

export interface MenuHost {
  settings: Settings;
  saves: SaveManager;
  corruptSave: boolean;
  startNewGame(opts: NewGameOptions & { tutorial: boolean }): void;
  continueGame(): void;
  applySettings(languageChanged: boolean): void;
}

/** Main menu: NOVO JOGO / CONTINUAR / CONFIGURAÇÕES / SOBRE. */
export class MainMenu {
  private el: HTMLElement;

  constructor(
    private root: HTMLElement,
    private host: MenuHost,
  ) {
    this.el = h('div', { id: 'menu', 'data-testid': 'main-menu' });
    root.appendChild(this.el);
    this.render();
  }

  render(): void {
    clear(this.el);
    const peek = this.host.saves.peek();
    const hasSave = peek !== null;
    const card = h('div', { class: 'menu-card' });
    mount(
      card,
      h('div', { class: 'menu-logo' }, h('span', { class: 'sprout' }, '🌱'), GAME_CONFIG.name.toUpperCase()),
      h('div', { class: 'tagline' }, t('menu.tagline')),
      this.host.corruptSave
        ? h('div', { class: 'menu-warning', 'data-testid': 'corrupt-warning' }, t('menu.corruptSave'))
        : null,
      !this.host.saves.available ? h('div', { class: 'menu-warning' }, t('menu.noStorage')) : null,
      h(
        'button',
        {
          class: hasSave ? '' : 'primary',
          'data-testid': 'menu-new',
          onclick: () => {
            audio.unlock();
            void this.openNewGame();
          },
        },
        `🌾 ${t('menu.newGame')}`,
      ),
      h(
        'button',
        {
          class: hasSave ? 'primary' : '',
          disabled: !hasSave,
          'data-testid': 'menu-continue',
          onclick: () => {
            audio.unlock();
            this.host.continueGame();
          },
        },
        `▶ ${t('menu.continue')}`,
      ),
      peek
        ? h(
            'div',
            { class: 'info' },
            t('menu.continueInfo', {
              farm: peek.farmName,
              day: peek.day + 1,
              money: formatMoney(peek.money),
            }),
          )
        : null,
      h(
        'button',
        { 'data-testid': 'menu-settings', onclick: () => this.openSettings() },
        `⚙️ ${t('menu.settings')}`,
      ),
      h('button', { onclick: () => this.openAbout() }, `ℹ️ ${t('menu.about')}`),
      h('div', { class: 'version' }, t('menu.version', { version: GAME_CONFIG.version })),
    );
    this.el.appendChild(card);
  }

  private async openNewGame(): Promise<void> {
    let difficulty: Difficulty = 'normal';
    let region: RegionId = 'parana';
    const name = h('input', {
      type: 'text',
      maxlength: '40',
      value: t('ng.farmNameDefault'),
      'data-testid': 'ng-name',
    });
    const seed = h('input', {
      type: 'text',
      maxlength: '24',
      placeholder: 'ex: SAFRA2026',
      'data-testid': 'ng-seed',
    });
    const tutorial = h('input', { type: 'checkbox', id: 'ng-tut', checked: true });
    const diffDesc = h('div', { class: 'muted small-text' }, t('difficulty.normal.desc'));
    const regionDesc = h('div', { class: 'muted small-text' }, t('region.parana.desc'));
    const diffGroup = h(
      'div',
      { class: 'opt-group' },
      (['easy', 'normal', 'hard'] as Difficulty[]).map((d) =>
        h(
          'button',
          {
            class: d === difficulty ? 'active' : '',
            'data-testid': `ng-diff-${d}`,
            onclick: (e: Event) => {
              difficulty = d;
              diffGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
              (e.currentTarget as HTMLElement).classList.add('active');
              diffDesc.textContent = t(`difficulty.${d}.desc`);
            },
          },
          t(`difficulty.${d}`),
        ),
      ),
    );
    const regionSelect = h(
      'select',
      {
        onchange: (e: Event) => {
          region = (e.target as HTMLSelectElement).value as RegionId;
          regionDesc.textContent = t(`region.${region}.desc`);
        },
      },
      REGION_IDS.map((r) => h('option', { value: r, selected: r === region }, t(`region.${r}`))),
    );
    const start = h('button', { class: 'primary', 'data-testid': 'ng-start' }, `🌱 ${t('ng.start')}`);
    const cancel = h('button', null, t('common.cancel'));
    const m = openModal(
      this.root,
      h(
        'div',
        { 'data-testid': 'new-game-dialog' },
        h('h2', null, t('ng.title')),
        h('div', { class: 'field' }, h('label', null, t('ng.farmName')), name),
        h('div', { class: 'field' }, h('label', null, t('ng.difficulty')), diffGroup, diffDesc),
        h('div', { class: 'field' }, h('label', null, t('ng.region')), regionSelect, regionDesc),
        h(
          'div',
          { class: 'field' },
          h('label', null, t('ng.seed')),
          seed,
          h('div', { class: 'muted small-text' }, t('ng.seedHint')),
        ),
        h('div', { class: 'field row' }, tutorial, h('label', { for: 'ng-tut' }, t('ng.tutorial'))),
        h('div', { class: 'actions' }, cancel, start),
      ),
    );
    cancel.addEventListener('click', () => m.close());
    start.addEventListener('click', async () => {
      if (this.host.saves.hasSave()) {
        const ok = await confirmDialog(this.root, t('ng.title'), t('ng.overwrite'), true);
        if (!ok) return;
      }
      m.close();
      this.host.startNewGame({
        farmName: name.value.trim() || t('ng.farmNameDefault'),
        difficulty,
        region,
        seed: seed.value.trim() || undefined,
        tutorial: tutorial.checked,
      });
    });
    name.focus();
    name.select();
  }

  private openSettings(): void {
    const close = h('button', { class: 'primary' }, t('common.close'));
    const m = openModal(
      this.root,
      h(
        'div',
        null,
        h('h2', null, t('settings.title')),
        renderSettingsView({
          settings: this.host.settings,
          saves: this.host.saves,
          modalRoot: this.root,
          onChange: (_s, lang) => {
            this.host.applySettings(lang);
            if (lang) {
              m.close();
              this.render();
              this.openSettings();
            }
          },
          onSaveDeleted: () => this.render(),
        }),
        h('div', { class: 'actions' }, close),
      ),
      { onClose: () => this.render() },
    );
    close.addEventListener('click', () => m.close());
  }

  private openAbout(): void {
    const close = h('button', { class: 'primary' }, t('common.close'));
    const m = openModal(
      this.root,
      h(
        'div',
        null,
        h('h2', null, `🌱 ${GAME_CONFIG.name}`),
        h('p', null, t('about.text', { name: GAME_CONFIG.name })),
        h('h3', null, t('about.controls')),
        h('p', { class: 'small-text' }, t('about.controlsText')),
        h('p', { class: 'muted small-text' }, t('menu.version', { version: GAME_CONFIG.version })),
        h('div', { class: 'actions' }, close),
      ),
    );
    close.addEventListener('click', () => m.close());
  }

  destroy(): void {
    this.el.remove();
  }
}
