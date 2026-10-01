import { GAME_CONFIG, type GameSpeed } from '../config/game';
import { CROPS } from '../data/balance';
import { t } from '../i18n';
import { audio } from '../audio/AudioManager';
import { analytics } from '../analytics/AnalyticsService';
import type { GamePlatform } from '../platform';
import type { SaveManager } from '../save/saveManager';
import { canPlaceBuilding } from '../simulation/buildings/buildings';
import { normalizeRect, type OpPreview, type Rect } from '../simulation/crops/fieldOps';
import type { Game } from '../simulation/game';
import { isOwned, parcelAt } from '../simulation/world/map';
import { canBuyParcel } from '../simulation/world/land';
import type { BuildingType, CropId, FieldOperation, NotificationCategory, Parcel } from '../simulation/types';
import { toDate } from '../simulation/time/calendar';
import { Emitter } from '../utils/emitter';

export type ToolId = 'select' | 'buyLand' | 'prepare' | 'plant' | 'irrigate' | 'harvest' | 'build';
export type ViewMode = 'normal' | 'moisture' | 'fertility';

export const FIELD_TOOLS: Partial<Record<ToolId, FieldOperation>> = {
  prepare: 'prepare',
  plant: 'plant',
  irrigate: 'irrigate',
  harvest: 'harvest',
};

export interface SessionEvents {
  tool: ToolId;
  crop: CropId;
  building: BuildingType;
  selection: Rect | null;
  preview: OpPreview | null;
  hover: { x: number; y: number } | null;
  inspect: { x: number; y: number } | null;
  speed: GameSpeed;
  viewMode: ViewMode;
  saved: boolean;
  focusTile: { x: number; y: number };
  blocked: boolean;
  cameraMoved: undefined;
}

/** UI hooks the session needs (implemented by the DOM UI). */
export interface SessionUI {
  confirm(title: string, message: string): Promise<boolean>;
  toast(category: NotificationCategory, text: string): void;
}

export interface SessionDeps {
  saves: SaveManager;
  platform: GamePlatform;
}

/**
 * Controller between the simulation (Game), the renderer (Phaser scene) and
 * the DOM UI. Owns the clock (render frames → simulation ticks), tools,
 * selection and autosave.
 */
export class GameSession {
  readonly bus = new Emitter<SessionEvents>();
  ui: SessionUI | null = null;

  tool: ToolId = 'select';
  crop: CropId = 'soy';
  building: BuildingType = 'silo';
  selection: Rect | null = null;
  preview: OpPreview | null = null;
  hover: { x: number; y: number } | null = null;
  speed: GameSpeed = 0;
  private lastSpeed: GameSpeed = 1;
  viewMode: ViewMode = 'normal';
  /** Keys currently held (camera movement), filled by the DOM keyboard handler. */
  readonly keys = new Set<string>();

  private acc = 0;
  private autosaveAcc = 0;
  private blockers = 0;
  private disposed = false;
  private unsub: (() => void)[] = [];

  constructor(
    public readonly game: Game,
    private readonly deps: SessionDeps,
  ) {
    const ev = game.events;
    this.unsub.push(
      ev.on('requestSave', () => this.save(false)),
      ev.on('analytics', (a) => analytics.track(a.name, a.props)),
      ev.on('day', () => this.refreshPreview()),
      ev.on('money', () => this.refreshPreview()),
      ev.on('gameOver', () => {
        this.setSpeed(0);
        this.save(false);
      }),
    );
    if (game.state.day === 0 && game.state.stats.tilesPlanted === 0) this.speed = 0;
  }

  get blocked(): boolean {
    return this.blockers > 0;
  }

  /** Modal dialogs block the simulation while open. */
  pushBlock(): void {
    this.blockers++;
    if (this.blockers === 1) {
      this.deps.platform.gameplayStop();
      this.bus.emit('blocked', true);
    }
  }

  popBlock(): void {
    this.blockers = Math.max(0, this.blockers - 1);
    if (this.blockers === 0) {
      if (this.speed > 0) this.deps.platform.gameplayStart();
      this.bus.emit('blocked', false);
    }
  }

  // ------------------------------------------------------------- clock ---

  /** Called every render frame by the scene. */
  update(deltaMs: number): void {
    if (this.disposed) return;
    const dt = Math.min(deltaMs, 250);
    this.autosaveAcc += dt;
    if (this.autosaveAcc >= GAME_CONFIG.autosaveMs) {
      this.autosaveAcc = 0;
      this.save(false);
    }
    if (this.speed === 0 || this.blocked || this.game.isGameOver) return;
    this.acc += dt * this.speed;
    let steps = 0;
    // Cap catch-up steps per frame so a slow frame never spirals.
    while (this.acc >= GAME_CONFIG.msPerDayAt1x && steps < 4) {
      this.acc -= GAME_CONFIG.msPerDayAt1x;
      this.game.advanceDay();
      steps++;
      if (this.blocked || this.game.isGameOver) break;
    }
    if (steps === 4) this.acc = Math.min(this.acc, GAME_CONFIG.msPerDayAt1x);
  }

  /** Fraction of the current day elapsed (for smooth UI clocks). */
  get dayProgress(): number {
    return this.acc / GAME_CONFIG.msPerDayAt1x;
  }

  setSpeed(speed: GameSpeed): void {
    if (speed > 0) this.lastSpeed = speed;
    if (this.speed === speed) return;
    this.speed = speed;
    if (speed > 0 && !this.blocked) this.deps.platform.gameplayStart();
    else this.deps.platform.gameplayStop();
    this.bus.emit('speed', speed);
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? this.lastSpeed : 0);
  }

  // ------------------------------------------------------------- tools ---

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.clearSelection();
    this.bus.emit('tool', tool);
  }

  setCrop(crop: CropId): void {
    this.crop = crop;
    this.bus.emit('crop', crop);
    this.refreshPreview();
  }

  setBuilding(b: BuildingType): void {
    this.building = b;
    this.bus.emit('building', b);
  }

  setViewMode(m: ViewMode): void {
    this.viewMode = m;
    this.bus.emit('viewMode', m);
  }

  focusTile(x: number, y: number): void {
    this.bus.emit('focusTile', { x, y });
  }

  setHover(tile: { x: number; y: number } | null): void {
    if (tile && this.hover && tile.x === this.hover.x && tile.y === this.hover.y) return;
    this.hover = tile;
    this.bus.emit('hover', tile);
  }

  clearSelection(): void {
    this.selection = null;
    this.preview = null;
    this.bus.emit('selection', null);
    this.bus.emit('preview', null);
  }

  /** Live rectangle while dragging (field tools). */
  setSelection(rect: Rect | null): void {
    this.selection = rect ? normalizeRect(rect) : null;
    this.bus.emit('selection', this.selection);
    this.refreshPreview();
  }

  /** Whole owned part of the parcel under (x,y) (Shift+click). */
  selectParcelAt(x: number, y: number): void {
    const p = parcelAt(this.game.state, x, y);
    if (!p) return;
    this.setSelection({ x0: p.x, y0: p.y, x1: p.x + p.w - 1, y1: p.y + p.h - 1 });
  }

  refreshPreview(): void {
    const op = FIELD_TOOLS[this.tool];
    if (!op || !this.selection) {
      if (this.preview) {
        this.preview = null;
        this.bus.emit('preview', null);
      }
      return;
    }
    this.preview = this.game.previewOperation(op, this.selection, op === 'plant' ? this.crop : null);
    this.bus.emit('preview', this.preview);
  }

  /** Executes the previewed field operation. */
  confirmOperation(): void {
    const op = FIELD_TOOLS[this.tool];
    if (!op || !this.selection) return;
    const res = this.game.executeOperation(op, this.selection, op === 'plant' ? this.crop : null);
    if (!res.ok) {
      audio.play('error');
      this.ui?.toast('error', t(res.reason ?? 'err.unknown'));
      this.refreshPreview();
      return;
    }
    audio.play(op === 'harvest' ? 'harvest' : op === 'plant' ? 'plant' : 'click');
    this.clearSelection();
  }

  cancel(): void {
    if (this.selection) this.clearSelection();
    else if (this.tool !== 'select') this.setTool('select');
  }

  /** A click (no drag) on a tile, dispatched by tool. */
  async clickTile(x: number, y: number, shift: boolean): Promise<void> {
    const s = this.game.state;
    switch (this.tool) {
      case 'select':
        this.bus.emit('inspect', { x, y });
        audio.play('click');
        break;
      case 'buyLand': {
        const p = parcelAt(s, x, y);
        if (p) await this.tryBuyParcel(p);
        break;
      }
      case 'build':
        await this.tryBuild(x, y);
        break;
      default:
        if (shift) this.selectParcelAt(x, y);
        else this.setSelection({ x0: x, y0: y, x1: x, y1: y });
    }
  }

  async tryBuyParcel(p: Parcel): Promise<void> {
    const check = canBuyParcel(this.game.state, p.id);
    if (!check.ok) {
      if (check.reason !== 'err.alreadyOwned') {
        audio.play('error');
        this.ui?.toast('error', t(check.reason));
      }
      return;
    }
    const ok =
      (await this.ui?.confirm(
        t('action.buyLandTitle'),
        t('action.buyLand', { tiles: p.w * p.h, amount: check.cost }),
      )) ?? true;
    if (!ok) return;
    const r = this.game.buyParcel(p.id);
    if (r.ok) audio.play('coin');
    else this.ui?.toast('error', t(r.reason));
  }

  async tryBuild(x: number, y: number): Promise<void> {
    const type = this.building;
    const check = canPlaceBuilding(this.game.state, type, x, y);
    if (!check.ok) {
      audio.play('error');
      this.ui?.toast('error', t(check.reason));
      return;
    }
    const ok =
      (await this.ui?.confirm(
        t('action.buildTitle'),
        t('action.build', { building: `@building.${type}`, amount: check.cost }),
      )) ?? true;
    if (!ok) return;
    const r = this.game.build(type, x, y);
    if (r.ok) audio.play('build');
    else this.ui?.toast('error', t(r.reason));
  }

  isOwned(x: number, y: number): boolean {
    return isOwned(this.game.state, x, y);
  }

  // -------------------------------------------------------------- save ---

  save(manual: boolean): boolean {
    if (this.disposed) return false;
    const ok = this.deps.saves.save(this.game.snapshot());
    if (manual) this.bus.emit('saved', ok);
    return ok;
  }

  dateLabel(): string {
    const d = toDate(this.game.state.day);
    return t('date.format', { day: d.day, month: `@month.${d.month}`, year: d.year });
  }

  cropUnlocked(c: CropId): boolean {
    return this.game.state.progression.level >= CROPS[c].unlockLevel;
  }

  dispose(): void {
    this.disposed = true;
    for (const u of this.unsub) u();
    this.bus.clear();
    this.deps.platform.gameplayStop();
  }
}
