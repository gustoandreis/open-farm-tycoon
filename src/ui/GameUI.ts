import { audio } from '../audio/AudioManager';
import { GAME_CONFIG, IS_DEV, type GameSpeed } from '../config/game';
import type { Settings } from '../config/settings';
import { BUILDING_TYPES, BUILDINGS, CROP_IDS, CROPS, IRRIGATION } from '../data/balance';
import {
  FIELD_TOOLS,
  type GameSession,
  type SessionUI,
  type ToolId,
  type ViewMode,
} from '../game/GameSession';
import { formatMoney, formatNumber, t, type Params } from '../i18n';
import type { SaveManager } from '../save/saveManager';
import {
  buildingCost,
  inIrrigationRange,
  storageCapacity,
  storageUsed,
} from '../simulation/buildings/buildings';
import { cropStage, estimateYield } from '../simulation/crops/growth';
import { landPrice } from '../simulation/world/land';
import { xpForNextLevel, currentObjective } from '../simulation/progression/progression';
import { toDate } from '../simulation/time/calendar';
import type { NotificationCategory, YearSummary } from '../simulation/types';
import { isParcelForSale, parcelAt } from '../simulation/world/map';
import { bar, clear, h, icon, isTypingTarget, mount } from './dom';
import { confirmDialog, dismissTopModal, modalOpen, openModal } from './modal';
import { renderBank, renderFinance } from './panels/finance';
import { renderBuildings, renderMachines, renderWorkers } from './panels/assets';
import { renderCrops, renderLand, renderNotifications, renderStats, renderTech } from './panels/info';
import { renderMarket } from './panels/market';
import type { PanelContext, PanelId, PanelRenderer } from './panels/types';
import { renderSettingsView } from './settingsView';
import { Tutorial } from './tutorial';

export interface GameUIHost {
  settings: Settings;
  saves: SaveManager;
  applySettings(languageChanged: boolean): void;
  exitToMenu(): void;
  newGame(): void;
  getFps(): number;
}

const TOOLS: { id: ToolId; key: string }[] = [
  { id: 'select', key: 'V' },
  { id: 'buyLand', key: 'B' },
  { id: 'prepare', key: 'P' },
  { id: 'plant', key: 'L' },
  { id: 'irrigate', key: 'I' },
  { id: 'harvest', key: 'H' },
  { id: 'build', key: 'C' },
];

const PANELS: { id: PanelId; icon: string; render: PanelRenderer | null }[] = [
  { id: 'land', icon: 'land', render: renderLand },
  { id: 'crops', icon: 'crops', render: renderCrops },
  { id: 'machines', icon: 'machines', render: renderMachines },
  { id: 'buildings', icon: 'buildings', render: renderBuildings },
  { id: 'workers', icon: 'workers', render: renderWorkers },
  { id: 'market', icon: 'market', render: renderMarket },
  { id: 'finance', icon: 'finance', render: renderFinance },
  { id: 'bank', icon: 'bank', render: renderBank },
  { id: 'tech', icon: 'tech', render: renderTech },
  { id: 'stats', icon: 'stats', render: renderStats },
  { id: 'notifications', icon: 'notifications', render: renderNotifications },
  { id: 'settings', icon: 'settings', render: null },
];

const SPEED_LABELS: Record<GameSpeed, string> = { 0: '❚❚', 1: '1×', 2: '2×', 4: '4×', 8: '8×' };

/** The in-game DOM interface: HUD, toolbar, management panels, dialogs. */
export class GameUI implements SessionUI {
  private els: Record<string, HTMLElement> = {};
  private panel: PanelId | null = null;
  private panelLocal = new Map<PanelId, Record<string, unknown>>();
  private hudDirty = true;
  private panelDirty = false;
  private lastPanelRender = 0;
  private raf = 0;
  private mouse = { x: 0, y: 0 };
  private inspect: { x: number; y: number } | null = null;
  private tutorial: Tutorial | null = null;
  private unsub: (() => void)[] = [];
  private debugVisible = false;
  private unread = 0;
  private destroyed = false;

  constructor(
    private root: HTMLElement,
    private session: GameSession,
    private host: GameUIHost,
  ) {
    session.ui = this;
    this.build();
    this.subscribe();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onPointerMove);
    this.loop();
    if (session.game.isGameOver) queueMicrotask(() => this.showGameOver());
  }

  // ------------------------------------------------------------ build ---

  private build(): void {
    clear(this.root);
    this.root.append(
      this.buildHud(),
      this.buildToolbar(),
      h('div', { id: 'tool-options' }),
      this.buildMgmt(),
      h('div', { id: 'panel', class: 'hidden' }),
      h('div', { id: 'action-bar', class: 'hidden', 'data-testid': 'action-bar' }),
      h('div', { id: 'objectives' }),
      h('div', { id: 'toasts' }),
      h('div', { id: 'tooltip', class: 'hidden' }),
      h('div', { id: 'debug', class: 'hidden' }),
    );
    for (const id of ['tool-options', 'panel', 'action-bar', 'objectives', 'toasts', 'tooltip', 'debug']) {
      const el = this.root.querySelector<HTMLElement>(`#${id}`);
      if (el) this.els[id] = el;
    }
    this.tutorial?.destroy();
    this.tutorial = new Tutorial(this.root, this.session);
    this.renderToolOptions();
    this.renderActionBar();
    this.updateHud();
    this.updateObjectives();
    if (this.panel) this.renderPanel();
  }

  /** Full rebuild (e.g. after a language change). */
  rebuild(): void {
    this.build();
  }

  private buildHud(): HTMLElement {
    const speedGroup = h(
      'div',
      { class: 'speed-group', id: 'speed-group', title: t('hud.speed') },
      GAME_CONFIG.speeds.map((sp) =>
        h(
          'button',
          {
            'data-speed': String(sp),
            'data-testid': `speed-${sp}`,
            title: sp === 0 ? t('hud.pause') : `${sp}× (${GAME_CONFIG.speeds.indexOf(sp)})`,
            onclick: () => {
              audio.unlock();
              this.session.setSpeed(sp);
            },
          },
          SPEED_LABELS[sp],
        ),
      ),
    );
    const hud = h(
      'div',
      { id: 'hud' },
      h(
        'div',
        { class: 'logo' },
        `🌱 ${GAME_CONFIG.name}`,
        h('small', null, this.session.game.state.farmName),
      ),
      h(
        'div',
        { class: 'hud-item hud-money', id: 'hud-money', 'data-testid': 'hud-money' },
        h('span', { class: 'label' }, t('hud.money')),
        h('span', { class: 'value' }),
      ),
      h(
        'div',
        { class: 'hud-item', id: 'hud-date' },
        h('span', { class: 'label', id: 'hud-season' }),
        h('span', { class: 'value' }),
      ),
      h(
        'div',
        { class: 'hud-item', id: 'hud-weather' },
        h('span', { class: 'label' }, t('hud.weather')),
        h('span', { class: 'value' }),
      ),
      h(
        'div',
        { class: 'hud-item', title: t('hud.forecast') },
        h('span', { class: 'label' }, t('hud.forecast').split('(')[0]),
        h('div', { class: 'forecast', id: 'hud-forecast' }),
      ),
      h(
        'div',
        { class: 'hud-item optional', id: 'hud-storage' },
        h('span', { class: 'label' }, `${icon('storage')}`),
        h('span', { class: 'value' }),
      ),
      h('div', { class: 'grow' }),
      h('span', { class: 'paused-badge', id: 'hud-paused' }, t('hud.paused')),
      speedGroup,
      h(
        'button',
        {
          title: t('hud.save'),
          'data-testid': 'save-btn',
          onclick: () => {
            const ok = this.session.save(true);
            this.toast(
              ok ? 'success' : 'error',
              ok ? `${icon('save')} ${t('hud.saved')}` : t('hud.saveFailed'),
            );
          },
        },
        `${icon('save')} ${t('hud.save')}`,
      ),
      h(
        'button',
        { title: t('hud.menu'), 'data-testid': 'menu-btn', onclick: () => this.openPauseMenu() },
        icon('menu'),
      ),
    );
    return hud;
  }

  private buildToolbar(): HTMLElement {
    return h(
      'div',
      { id: 'toolbar' },
      TOOLS.map((tool) =>
        h(
          'button',
          {
            class: 'tool-btn',
            id: `tool-${tool.id}`,
            'data-testid': `tool-${tool.id}`,
            title: `${t(`tool.${tool.id}`)} (${tool.key})`,
            onclick: () => {
              audio.unlock();
              audio.play('click');
              this.session.setTool(tool.id);
            },
          },
          h('span', { class: 'ico' }, icon(tool.id)),
          h('span', { class: 'lbl' }, t(`tool.${tool.id}`)),
          h('kbd', null, tool.key),
        ),
      ),
      h(
        'button',
        {
          class: 'tool-btn',
          id: 'tool-cancel',
          title: `${t('tool.cancel')} (Esc)`,
          onclick: () => this.session.cancel(),
        },
        h('span', { class: 'ico' }, icon('cancel')),
        h('span', { class: 'lbl' }, t('tool.cancel')),
        h('kbd', null, 'Esc'),
      ),
    );
  }

  private buildMgmt(): HTMLElement {
    return h(
      'div',
      { id: 'mgmt' },
      PANELS.map((p) =>
        h(
          'button',
          {
            class: 'mgmt-btn',
            id: `mgmt-${p.id}`,
            'data-testid': `panel-${p.id}`,
            title: t(`panel.${p.id}`),
            onclick: () => {
              audio.unlock();
              audio.play('click');
              this.togglePanel(p.id);
            },
          },
          h('span', null, icon(p.icon)),
          h('span', { class: 'lbl' }, t(`panel.${p.id}`)),
          p.id === 'notifications'
            ? h('span', { class: 'badge', id: 'notif-badge', style: 'display:none' })
            : null,
        ),
      ),
    );
  }

  // -------------------------------------------------------- subscribe ---

  private subscribe(): void {
    const ev = this.session.game.events;
    const bus = this.session.bus;
    this.unsub.push(
      ev.on('money', () => this.markDirty()),
      ev.on('day', () => {
        this.markDirty();
        this.tutorial?.check();
      }),
      ev.on('tilesChanged', () => {
        this.tutorial?.check();
        if (this.inspect) this.renderActionBar();
      }),
      ev.on('notify', (n) => {
        this.toast(n.category, t(n.key, n.params as Params | undefined));
        this.unread++;
        this.markDirty();
      }),
      ev.on('levelUp', () => audio.play('levelUp')),
      ev.on('yearEnd', (y) => this.showYearSummary(y)),
      ev.on('gameOver', () => this.showGameOver()),
      ev.on('machinesChanged', () => this.markDirty()),
      ev.on('buildingsChanged', () => this.markDirty()),
      ev.on('parcelsChanged', () => this.markDirty()),
      bus.on('tool', () => {
        this.inspect = null;
        this.renderToolOptions();
        this.renderActionBar();
        this.updateToolbar();
      }),
      bus.on('crop', () => this.renderToolOptions()),
      bus.on('building', () => this.renderToolOptions()),
      bus.on('viewMode', () => this.renderToolOptions()),
      bus.on('preview', () => this.renderActionBar()),
      bus.on('selection', () => this.renderActionBar()),
      bus.on('speed', () => {
        this.updateHud();
        this.tutorial?.check();
      }),
      bus.on('hover', () => this.updateTooltip()),
      bus.on('cameraMoved', () => this.tutorial?.signal('camera')),
      bus.on('inspect', (p) => {
        this.inspect = p;
        this.tutorial?.signal('inspect');
        this.renderActionBar();
      }),
    );
  }

  private markDirty(): void {
    this.hudDirty = true;
    if (this.panel) this.panelDirty = true;
  }

  private loop = (): void => {
    if (this.destroyed) return;
    if (this.hudDirty) {
      this.hudDirty = false;
      this.updateHud();
      this.updateObjectives();
      if (this.session.preview) this.renderActionBar();
    }
    const now = performance.now();
    if (this.panelDirty && now - this.lastPanelRender > 350) {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement && this.els.panel.contains(active) && isTypingTarget(active);
      if (!typing) {
        this.panelDirty = false;
        this.renderPanel();
      }
    }
    if (this.debugVisible && Math.floor(now / 250) !== Math.floor((now - 17) / 250)) this.renderDebug();
    this.raf = requestAnimationFrame(this.loop);
  };

  // --------------------------------------------------------------- HUD ---

  private setVal(id: string, text: string): void {
    const v = this.root.querySelector(`#${id} .value`);
    if (v && v.textContent !== text) v.textContent = text;
  }

  updateHud(): void {
    const s = this.session.game.state;
    const d = toDate(s.day);
    this.setVal('hud-money', formatMoney(s.money));
    this.root.querySelector('#hud-money')?.classList.toggle('neg', s.money < 0);
    this.setVal('hud-date', this.session.dateLabel());
    const season = this.root.querySelector('#hud-season');
    if (season) season.textContent = `${icon(d.season)} ${t(`season.${d.season}`)}`;
    this.setVal('hud-weather', `${icon(s.weather.today)} ${t(`weather.${s.weather.today}`)}`);
    this.setVal('hud-storage', `${formatNumber(storageUsed(s), 0)}/${storageCapacity(s)} t`);
    const fc = this.root.querySelector('#hud-forecast');
    if (fc) {
      clear(fc as HTMLElement);
      s.weather.forecast.forEach((w, i) => {
        const day = toDate(s.day + i + 1).day;
        fc.appendChild(
          h('span', { title: t(`weather.${w.shown}`) }, icon(w.shown), h('small', null, String(day))),
        );
      });
    }
    this.root.querySelectorAll<HTMLButtonElement>('#speed-group button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === this.session.speed);
    });
    const paused = this.root.querySelector<HTMLElement>('#hud-paused');
    if (paused) paused.style.visibility = this.session.speed === 0 ? 'visible' : 'hidden';
    const badge = this.root.querySelector<HTMLElement>('#notif-badge');
    if (badge) {
      badge.style.display = this.unread > 0 ? '' : 'none';
      badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
    }
  }

  private updateToolbar(): void {
    for (const tool of TOOLS)
      this.root.querySelector(`#tool-${tool.id}`)?.classList.toggle('active', this.session.tool === tool.id);
  }

  private updateObjectives(): void {
    const el = this.els.objectives;
    if (!el) return;
    const s = this.session.game.state;
    const next = xpForNextLevel(s.progression.level);
    const obj = currentObjective(s);
    clear(el);
    mount(
      el,
      h(
        'div',
        { class: 'lvl' },
        h('b', null, `${icon('level')} ${t('common.level', { level: s.progression.level })}`),
        next ? bar(s.progression.xp / next) : null,
        h(
          'span',
          { class: 'muted small-text' },
          next ? t('hud.xp', { xp: s.progression.xp, next }) : t('hud.xpMax', { xp: s.progression.xp }),
        ),
      ),
      h(
        'div',
        { class: 'obj', 'data-testid': 'objective' },
        obj ? [h('b', null, `🎯 ${t('obj.title')}: `), t(`objective.${obj}`)] : t('obj.allDone'),
      ),
    );
  }

  // ------------------------------------------------------ tool options ---

  private renderToolOptions(): void {
    const el = this.els['tool-options'];
    if (!el) return;
    clear(el);
    const s = this.session.game.state;
    const tool = this.session.tool;
    const inner = h('div', { class: 'inner' });
    inner.append(h('span', { class: 'hint' }, t(`tool.${tool}.hint`, { gain: IRRIGATION.moistureGain })));
    if (tool === 'plant') {
      for (const c of CROP_IDS) {
        const unlocked = this.session.cropUnlocked(c);
        const season = toDate(s.day).season;
        inner.append(
          h(
            'button',
            {
              class: `chip ${this.session.crop === c ? 'active' : ''}`,
              disabled: !unlocked,
              'data-testid': `crop-${c}`,
              title: unlocked
                ? CROPS[c].plantingSeason.includes(season)
                  ? t('crops.inSeason')
                  : t('crops.outSeason')
                : t('crops.level', { level: CROPS[c].unlockLevel }),
              onclick: () => this.session.setCrop(c),
            },
            `${icon(c)} ${t(`crop.${c}`)}`,
            h(
              'small',
              null,
              unlocked
                ? `${formatMoney(CROPS[c].seedCost)}/ha${CROPS[c].plantingSeason.includes(season) ? '' : ' ⚠'}`
                : '🔒',
            ),
          ),
        );
      }
    } else if (tool === 'build') {
      for (const b of BUILDING_TYPES) {
        const unlocked = s.progression.level >= BUILDINGS[b].unlockLevel;
        inner.append(
          h(
            'button',
            {
              class: `chip ${this.session.building === b ? 'active' : ''}`,
              disabled: !unlocked,
              'data-testid': `building-${b}`,
              onclick: () => this.session.setBuilding(b),
            },
            t(`building.${b}`),
            h(
              'small',
              null,
              unlocked
                ? formatMoney(buildingCost(s, b))
                : `🔒 ${t('common.level', { level: BUILDINGS[b].unlockLevel })}`,
            ),
          ),
        );
      }
    }
    inner.append(h('span', { class: 'spacer', style: 'min-width:0.6rem' }));
    inner.append(h('span', { class: 'muted small-text' }, `${t('hud.view')}:`));
    for (const m of ['normal', 'moisture', 'fertility'] as ViewMode[]) {
      inner.append(
        h(
          'button',
          {
            class: `chip small ${this.session.viewMode === m ? 'active' : ''}`,
            onclick: () => this.session.setViewMode(m),
          },
          t(`view.${m}`),
        ),
      );
    }
    el.append(inner);
    this.updateToolbar();
  }

  // -------------------------------------------------------- action bar ---

  private actionBarSig = '';

  private renderActionBar(): void {
    const el = this.els['action-bar'];
    if (!el) return;
    const p = this.session.preview;
    const op = FIELD_TOOLS[this.session.tool];
    // Avoid rebuilding (and detaching buttons under the cursor) when nothing changed.
    const sig = JSON.stringify([
      this.session.tool,
      p && { ...p, tiles: p.tiles.length },
      this.inspect,
      this.inspect ? this.tileInfo(this.inspect.x, this.inspect.y) : null,
    ]);
    if (sig === this.actionBarSig && el.childElementCount > 0) return;
    this.actionBarSig = sig;
    clear(el);
    if (op && p) {
      const title =
        op === 'plant'
          ? t('action.plant', { crop: `@crop.${p.cropId}`, count: p.count })
          : t(`action.${op}`, { count: p.count });
      mount(
        el,
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'title' }, `${icon(this.session.tool)} ${title}`),
          h('span', { class: 'spacer' }),
          h('span', { class: 'cost' }, t('action.cost', { amount: p.totalCost })),
        ),
        h(
          'div',
          { class: 'muted small-text' },
          t('action.breakdown', { labor: p.laborCost, seeds: p.seedCost, fuel: p.fuelCost }),
          ' · ',
          p.usesMachine ? t('action.withMachine') : t('action.manual'),
          ' · ',
          t('action.capacity', { left: p.capacityLeft }),
        ),
        p.estimatedTonnes > 0
          ? h('div', { class: 'small-text' }, t('action.estimate', { tonnes: p.estimatedTonnes }))
          : null,
        h(
          'div',
          { class: 'warnings' },
          p.warnings.map((w) => h('div', null, `⚠ ${t(w)}`)),
        ),
        p.reason ? h('div', { class: 'reason' }, `⛔ ${t(p.reason)}`) : null,
        h(
          'div',
          { class: 'row', style: 'justify-content:flex-end;margin-top:6px' },
          h('button', { onclick: () => this.session.clearSelection() }, t('action.cancel')),
          h(
            'button',
            {
              class: 'primary',
              disabled: !p.ok,
              'data-testid': 'action-confirm',
              onclick: () => this.session.confirmOperation(),
            },
            t('action.confirm'),
          ),
        ),
      );
      el.classList.remove('hidden');
      return;
    }
    if (this.session.tool === 'select' && this.inspect) {
      const info = this.tileInfo(this.inspect.x, this.inspect.y);
      el.append(
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'title' }, `${icon('info')} ${info.title}`),
          h('span', { class: 'spacer' }),
          h(
            'button',
            {
              class: 'small',
              onclick: () => {
                this.inspect = null;
                this.renderActionBar();
              },
            },
            '✖',
          ),
        ),
        h(
          'div',
          { style: 'white-space:pre-line;margin-top:4px', 'data-testid': 'tile-info' },
          info.lines.join('\n'),
        ),
      );
      el.classList.remove('hidden');
      return;
    }
    if (op && !p) {
      el.append(h('div', { class: 'muted' }, t('action.selectArea')));
      el.classList.remove('hidden');
      return;
    }
    el.classList.add('hidden');
  }

  // ------------------------------------------------------------ tooltip ---

  private tileInfo(x: number, y: number): { title: string; lines: string[] } {
    const s = this.session.game.state;
    const tile = s.map.tiles[y * s.map.width + x];
    const parcel = parcelAt(s, x, y);
    const lines: string[] = [];
    let title = t(`terrain.${tile.terrain}`);
    if (tile.building !== null) {
      const b = s.buildings.find((bb) => bb.id === tile.building);
      if (b) title = t(`building.${b.type}`);
    } else if (tile.crop) {
      const c = tile.crop;
      title = t(`crop.${c.cropId}`).toUpperCase();
      lines.push(t(`stage.${cropStage(c)}`));
      lines.push(t('info.growth', { a: Math.floor(c.progress), b: CROPS[c.cropId].growthDays }));
    } else if (tile.terrain === 'grass') {
      lines.push(t(`field.${tile.field}`));
    }
    if (tile.terrain === 'grass' && tile.building === null) {
      lines.push(`${t('info.moisture')}: ${Math.round(tile.moisture)}%`);
      lines.push(`${t('info.fertility')}: ${Math.round(tile.fertility)}%`);
      if (tile.crop) lines.push(`${t('info.health')}: ${Math.round(tile.crop.health)}%`);
      else lines.push(`${t('info.soilHealth')}: ${Math.round(tile.soilHealth)}%`);
      if (tile.crop) lines.push(t('info.estimate', { tonnes: estimateYield(s, tile) }));
      if (inIrrigationRange(s, x, y) && parcel?.owned) lines.push(`💧 ${t('info.irrigationCovered')}`);
    }
    if (parcel?.owned) lines.push(`✔ ${t('info.owned')}`);
    else if (parcel && isParcelForSale(s, parcel))
      lines.push(`🏷️ ${t('info.forSale', { amount: landPrice(s, parcel) })}`);
    else lines.push(t('info.unavailable'));
    lines.push(t('info.tile', { x, y }));
    return { title, lines };
  }

  private updateTooltip(): void {
    const el = this.els.tooltip;
    if (!el) return;
    const hov = this.session.hover;
    if (!hov || modalOpen()) {
      el.classList.add('hidden');
      return;
    }
    const info = this.tileInfo(hov.x, hov.y);
    clear(el);
    if (this.session.tool === 'build') {
      const b = this.session.building;
      el.append(
        h(
          'b',
          null,
          t('action.buildHere', {
            building: `@building.${b}`,
            amount: buildingCost(this.session.game.state, b),
          }),
        ),
        '\n',
        info.lines.slice(-2).join('\n'),
      );
    } else {
      el.append(h('b', null, info.title), '\n', info.lines.join('\n'));
    }
    el.classList.remove('hidden');
    this.positionTooltip();
  }

  private positionTooltip(): void {
    const el = this.els.tooltip;
    if (!el || el.classList.contains('hidden')) return;
    const pad = 18;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let x = this.mouse.x + pad;
    let y = this.mouse.y + pad;
    if (x + w > window.innerWidth - 8) x = this.mouse.x - w - pad;
    if (y + hgt > window.innerHeight - 8) y = this.mouse.y - hgt - pad;
    el.style.left = `${Math.max(4, x)}px`;
    el.style.top = `${Math.max(4, y)}px`;
  }

  // ------------------------------------------------------------- panels ---

  togglePanel(id: PanelId): void {
    if (this.panel === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id: PanelId): void {
    this.panel = id;
    if (id === 'market') this.tutorial?.signal('market');
    if (id === 'notifications') this.unread = 0;
    this.renderPanel();
    this.updateHud();
    for (const p of PANELS) this.root.querySelector(`#mgmt-${p.id}`)?.classList.toggle('active', p.id === id);
  }

  closePanel(): void {
    this.panel = null;
    this.els.panel?.classList.add('hidden');
    for (const p of PANELS) this.root.querySelector(`#mgmt-${p.id}`)?.classList.remove('active');
  }

  private renderPanel(): void {
    const el = this.els.panel;
    if (!el || !this.panel) return;
    this.lastPanelRender = performance.now();
    const id = this.panel;
    const def = PANELS.find((p) => p.id === id);
    if (!def) return;
    const scroll = el.querySelector('.panel-body')?.scrollTop ?? 0;
    clear(el);
    let local = this.panelLocal.get(id);
    if (!local) {
      local = {};
      this.panelLocal.set(id, local);
    }
    const ctx: PanelContext = {
      session: this.session,
      game: this.session.game,
      confirm: (title, msg, danger) => this.confirm(title, msg, danger),
      toast: (c, text) => this.toast(c, text),
      refresh: () => {
        this.renderPanel();
        this.updateHud();
      },
      openPanel: (p) => this.openPanel(p),
      closePanel: () => this.closePanel(),
      local,
    };
    let body: HTMLElement;
    try {
      body =
        id === 'settings'
          ? renderSettingsView({
              settings: this.host.settings,
              saves: this.host.saves,
              modalRoot: this.root,
              onChange: (_s, lang) => this.host.applySettings(lang),
            })
          : def.render
            ? def.render(ctx)
            : h('div');
    } catch (err) {
      console.error('[ui] panel render failed', err);
      body = h('div', { class: 'bad' }, t('error.generic'));
    }
    const bodyWrap = h('div', { class: 'panel-body', 'data-testid': `panel-body-${id}` }, body);
    el.append(
      h(
        'div',
        { class: 'panel-head' },
        h('span', null, icon(def.icon)),
        h('h2', null, t(`panel.${id}`)),
        h('button', { class: 'small', 'data-testid': 'panel-close', onclick: () => this.closePanel() }, '✖'),
      ),
      bodyWrap,
    );
    el.classList.remove('hidden');
    bodyWrap.scrollTop = scroll;
  }

  // ------------------------------------------------------------- dialogs ---

  async confirm(title: string, message: string, danger = false): Promise<boolean> {
    this.session.pushBlock();
    try {
      return await confirmDialog(this.root, title, message, danger);
    } finally {
      this.session.popBlock();
    }
  }

  toast(category: NotificationCategory, text: string): void {
    const el = this.els.toasts;
    if (!el) return;
    const node = h('div', { class: `toast ${category}` }, `${icon(category)} ${text}`);
    el.prepend(node);
    while (el.children.length > 5) el.lastElementChild?.remove();
    if (category === 'error') audio.play('error');
    else if (category === 'success' || category === 'market') audio.play('notify');
    window.setTimeout(
      () => {
        node.classList.add('out');
        window.setTimeout(() => node.remove(), 450);
      },
      category === 'error' ? 5200 : 4200,
    );
  }

  private showYearSummary(y: YearSummary): void {
    this.session.pushBlock();
    const kv = (k: string, v: string, cls = '') => [
      h('div', { class: 'k' }, k),
      h('div', { class: `v ${cls}` }, v),
    ];
    const btn = h('button', { class: 'primary', 'data-testid': 'year-continue' }, t('yr.continue'));
    const m = openModal(
      this.root,
      h(
        'div',
        null,
        h('h2', null, `📅 ${t('yr.title', { year: y.year })}`),
        h(
          'div',
          { class: 'kv card' },
          ...kv(t('yr.revenue'), formatMoney(y.revenue), 'good'),
          ...kv(t('yr.expenses'), formatMoney(y.expenses), 'bad'),
          ...kv(t('yr.profit'), formatMoney(y.profit), y.profit >= 0 ? 'good' : 'bad'),
          ...kv(t('yr.production'), `${formatNumber(y.production)} t`),
          ...kv(t('yr.area'), `${y.area} ha`),
          ...kv(
            t('yr.best'),
            y.bestCommodity ? `${icon(y.bestCommodity)} ${t(`crop.${y.bestCommodity}`)}` : '—',
          ),
        ),
        h('div', { class: 'actions' }, btn),
      ),
      { onClose: () => this.session.popBlock() },
    );
    btn.addEventListener('click', () => m.close());
  }

  private showGameOver(): void {
    this.session.pushBlock();
    const s = this.session.game.state;
    const newBtn = h('button', { class: 'primary' }, t('go.newGame'));
    const menuBtn = h('button', null, t('go.mainMenu'));
    const m = openModal(
      this.root,
      h(
        'div',
        { 'data-testid': 'game-over' },
        h('h2', null, `💸 ${t('go.title')}`),
        h('p', null, t('go.text', { farm: s.farmName })),
        h(
          'div',
          { class: 'kv card' },
          h('div', { class: 'k' }, t('stats.daysPlayed')),
          h('div', { class: 'v' }, String(s.stats.daysPlayed)),
          h('div', { class: 'k' }, t('stats.production')),
          h('div', { class: 'v' }, `${formatNumber(s.stats.totalProduction)} t`),
          h('div', { class: 'k' }, t('stats.revenue')),
          h('div', { class: 'v' }, formatMoney(s.stats.totalRevenue)),
        ),
        h('p', { class: 'muted small-text' }, t('go.saveKept')),
        h('div', { class: 'actions' }, menuBtn, newBtn),
      ),
      { dismissable: false },
    );
    newBtn.addEventListener('click', () => {
      m.close();
      this.host.newGame();
    });
    menuBtn.addEventListener('click', () => {
      m.close();
      this.host.exitToMenu();
    });
  }

  openPauseMenu(): void {
    this.session.pushBlock();
    const resume = h('button', { class: 'primary', style: 'width:100%' }, `▶ ${t('pause.resume')}`);
    const save = h('button', { style: 'width:100%' }, `${icon('save')} ${t('hud.save')}`);
    const settings = h('button', { style: 'width:100%' }, `${icon('settings')} ${t('menu.settings')}`);
    const exit = h(
      'button',
      { style: 'width:100%', 'data-testid': 'exit-to-menu' },
      `🚪 ${t('pause.mainMenu')}`,
    );
    const m = openModal(
      this.root,
      h(
        'div',
        null,
        h('h2', null, t('pause.title')),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, resume, save, settings, exit),
      ),
      { onClose: () => this.session.popBlock() },
    );
    resume.addEventListener('click', () => m.close());
    save.addEventListener('click', () => {
      const ok = this.session.save(true);
      this.toast(ok ? 'success' : 'error', ok ? t('hud.saved') : t('hud.saveFailed'));
    });
    settings.addEventListener('click', () => {
      m.close();
      this.openPanel('settings');
    });
    exit.addEventListener('click', () => {
      m.close();
      this.host.exitToMenu();
    });
  }

  // ------------------------------------------------------------ keyboard ---

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      if (dismissTopModal()) return;
      if (this.inspect) {
        this.inspect = null;
        this.renderActionBar();
        return;
      }
      if (this.session.selection || this.session.tool !== 'select') {
        this.session.cancel();
        return;
      }
      if (this.panel) this.closePanel();
      return;
    }
    if (modalOpen()) return;
    if (
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '=', '-'].includes(key)
    ) {
      this.session.keys.add(key);
      this.tutorial?.signal('camera');
      e.preventDefault();
      return;
    }
    if (key === ' ') {
      e.preventDefault();
      audio.unlock();
      this.session.togglePause();
      return;
    }
    if (key === 'enter') {
      if (this.session.preview?.ok) this.session.confirmOperation();
      return;
    }
    const speedIdx = ['1', '2', '3', '4'].indexOf(key);
    if (speedIdx >= 0) {
      this.session.setSpeed(GAME_CONFIG.speeds[speedIdx + 1]);
      return;
    }
    if (key === '0') {
      this.session.setSpeed(0);
      return;
    }
    const tool = TOOLS.find((tl) => tl.key.toLowerCase() === key);
    if (tool) {
      this.session.setTool(tool.id);
      return;
    }
    if (IS_DEV && (key === 'f3' || key === '`')) {
      e.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.els.debug?.classList.toggle('hidden', !this.debugVisible);
      this.renderDebug();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.session.keys.delete(e.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.session.keys.clear();
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.positionTooltip();
  };

  // --------------------------------------------------------------- debug ---

  private renderDebug(): void {
    const el = this.els.debug;
    if (!el || !IS_DEV) return;
    const s = this.session.game.state;
    const hov = this.session.hover;
    clear(el);
    el.append(
      h('div', null, h('b', null, t('debug.title'))),
      h('div', null, `FPS ${this.host.getFps().toFixed(0)} · seed ${s.seed} · tick ${s.tick}`),
      h('div', null, `tile ${hov ? `${hov.x},${hov.y}` : '-'} · $${s.money.toFixed(0)}`),
      h(
        'div',
        null,
        `weather ${s.weather.today} · events ${s.events.active.map((a) => a.id).join(',') || '-'}`,
      ),
      h(
        'div',
        null,
        (['money', 'day', 'month', 'rain', 'drought', 'ripen', 'priceUp', 'priceDown', 'event'] as const).map(
          (c) => h('button', { onclick: () => this.session.game.cheat(c) }, t(`cheat.${c}`)),
        ),
      ),
    );
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const u of this.unsub) u();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.tutorial?.destroy();
    clear(this.root);
    this.session.ui = null;
  }
}
