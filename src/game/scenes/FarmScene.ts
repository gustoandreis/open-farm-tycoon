import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/game';
import { BUILDINGS, IRRIGATION } from '../../data/balance';
import { t, type Params } from '../../i18n';
import { canPlaceBuilding } from '../../simulation/buildings/buildings';
import { cropStage } from '../../simulation/crops/growth';
import type { FeedbackEvent } from '../../simulation/context';
import type { Tile } from '../../simulation/types';
import { isParcelForSale, parcelAt } from '../../simulation/world/map';
import { FIELD_TOOLS, type GameSession } from '../GameSession';
import { buildTileAtlas, cropTileId, drawBuilding, drawMachine, TILE, TILE_ID } from '../rendering/art';

const T = GAME_CONFIG.tileSize;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const PAN_SPEED = 900; // px per second at zoom 1

interface FloatingText {
  text: Phaser.GameObjects.Text;
  busy: boolean;
}

/** Main map scene: tilemap rendering, camera and pointer input. */
export class FarmScene extends Phaser.Scene {
  private session!: GameSession;
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private overlay!: Phaser.Tilemaps.TilemapLayer;
  private borders!: Phaser.GameObjects.Graphics;
  private selectionG!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  private rainG!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private buildingSprites = new Map<number, Phaser.GameObjects.Image>();
  private machineSprites: Phaser.GameObjects.Image[] = [];
  private floating: FloatingText[] = [];
  private unsub: (() => void)[] = [];
  private dragStart: { x: number; y: number; tx: number; ty: number; button: number } | null = null;
  private panning = false;
  private rectSelecting = false;
  private rain: { x: number; y: number; s: number }[] = [];
  private quality: 'low' | 'high' = 'high';
  private reducedMotion = false;

  constructor() {
    super('FarmScene');
  }

  init(data: { session: GameSession; quality: 'low' | 'high'; reducedMotion: boolean }): void {
    this.session = data.session;
    this.quality = data.quality;
    this.reducedMotion = data.reducedMotion;
  }

  setGraphics(quality: 'low' | 'high', reducedMotion: boolean): void {
    this.quality = quality;
    this.reducedMotion = reducedMotion;
  }

  create(): void {
    this.createTextures();
    const s = this.session.game.state;
    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: s.map.width, height: s.map.height });
    const tileset = map.addTilesetImage('atlas', 'atlas', TILE, TILE, 1, 2);
    if (!tileset) throw new Error('tileset failed');
    const ground = map.createBlankLayer('ground', tileset);
    const overlay = map.createBlankLayer('overlay', tileset);
    if (!ground || !overlay) throw new Error('layer failed');
    this.ground = ground;
    this.overlay = overlay;
    this.overlay.setDepth(2);
    this.borders = this.add.graphics().setDepth(3);
    this.selectionG = this.add.graphics().setDepth(6);
    this.hoverG = this.add.graphics().setDepth(7);
    this.ghost = this.add.image(0, 0, 'bld-silo').setOrigin(0, 0).setAlpha(0.7).setDepth(8).setVisible(false);
    this.rainG = this.add.graphics().setDepth(20).setScrollFactor(0);

    this.redrawAllTiles();
    this.redrawOverlay();
    this.syncBuildings();
    this.syncMachines();
    this.setupCamera();
    this.setupInput();
    this.subscribe();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private createTextures(): void {
    if (!this.textures.exists('atlas')) this.textures.addCanvas('atlas', buildTileAtlas());
    for (const type of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]) {
      const key = `bld-${type}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawBuilding(type, 64));
    }
    for (const type of ['tractor', 'planter', 'harvester', 'sprayer'] as const) {
      const key = `mac-${type}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawMachine(type, 40, 28));
    }
  }

  private cleanup(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  // ------------------------------------------------------------ drawing ---

  private tileVisual(tile: Tile, x: number, y: number): number {
    if (tile.building !== null) return TILE_ID.yard;
    switch (tile.terrain) {
      case 'water':
        return TILE_ID.water;
      case 'road':
        return TILE_ID.road;
      case 'forest':
        return TILE_ID.forest;
      default:
        break;
    }
    if (tile.field === 'planted' && tile.crop) return cropTileId(tile.crop.cropId, cropStage(tile.crop));
    if (tile.field === 'prepared') return TILE_ID.prepared;
    return TILE_ID.grass[(x * 7 + y * 13 + ((x * y) % 5)) % 3];
  }

  private redrawTile(i: number): void {
    const s = this.session.game.state;
    const x = i % s.map.width;
    const y = Math.floor(i / s.map.width);
    this.ground.putTileAt(this.tileVisual(s.map.tiles[i], x, y), x, y);
    if (this.session.viewMode !== 'normal') this.redrawOverlayTile(x, y);
  }

  private redrawAllTiles(): void {
    const s = this.session.game.state;
    for (let i = 0; i < s.map.tiles.length; i++) {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      this.ground.putTileAt(this.tileVisual(s.map.tiles[i], x, y), x, y);
    }
  }

  private redrawOverlayTile(x: number, y: number): void {
    const s = this.session.game.state;
    const tile = s.map.tiles[y * s.map.width + x];
    const parcel = parcelAt(s, x, y);
    const mode = this.session.viewMode;
    if (mode === 'normal') {
      if (!parcel || parcel.owned) {
        this.overlay.removeTileAt(x, y);
        return;
      }
      if (isParcelForSale(s, parcel)) {
        const ot = this.overlay.putTileAt(TILE_ID.stripes, x, y);
        ot.alpha = 0.35;
        return;
      }
      const ot = this.overlay.putTileAt(TILE_ID.white, x, y);
      ot.tint = 0x000000;
      ot.alpha = 0.32;
      return;
    }
    if (tile.terrain !== 'grass' || tile.building !== null) {
      this.overlay.removeTileAt(x, y);
      return;
    }
    const v = mode === 'moisture' ? tile.moisture / 100 : tile.fertility / 100;
    const color =
      mode === 'moisture'
        ? Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(0xd9442b),
            Phaser.Display.Color.ValueToColor(0x2b6fd9),
            100,
            Math.round(v * 100),
          )
        : Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(0xc9b27a),
            Phaser.Display.Color.ValueToColor(0x1f8a2f),
            100,
            Math.round(v * 100),
          );
    const ot = this.overlay.putTileAt(TILE_ID.white, x, y);
    ot.tint = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    ot.alpha = parcel?.owned ? 0.6 : 0.35;
  }

  private redrawOverlay(): void {
    const s = this.session.game.state;
    for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) this.redrawOverlayTile(x, y);
    this.drawBorders();
  }

  private drawBorders(): void {
    const s = this.session.game.state;
    const g = this.borders;
    g.clear();
    for (const p of s.parcels) {
      const forSale = isParcelForSale(s, p);
      if (!p.owned && !forSale) continue;
      if (forSale) {
        g.lineStyle(2, 0xffd54a, 0.75);
        g.strokeRect(p.x * T + 2, p.y * T + 2, p.w * T - 4, p.h * T - 4);
        continue;
      }
      g.lineStyle(3, 0xffffff, 0.85);
      const owned = (px: number, py: number) => parcelAt(s, px, py)?.owned ?? false;
      if (!owned(p.x, p.y - 1)) g.lineBetween(p.x * T, p.y * T, (p.x + p.w) * T, p.y * T);
      if (!owned(p.x, p.y + p.h)) g.lineBetween(p.x * T, (p.y + p.h) * T, (p.x + p.w) * T, (p.y + p.h) * T);
      if (!owned(p.x - 1, p.y)) g.lineBetween(p.x * T, p.y * T, p.x * T, (p.y + p.h) * T);
      if (!owned(p.x + p.w, p.y)) g.lineBetween((p.x + p.w) * T, p.y * T, (p.x + p.w) * T, (p.y + p.h) * T);
    }
  }

  private syncBuildings(): void {
    const s = this.session.game.state;
    const ids = new Set(s.buildings.map((b) => b.id));
    for (const [id, img] of this.buildingSprites) {
      if (!ids.has(id)) {
        img.destroy();
        this.buildingSprites.delete(id);
      }
    }
    for (const b of s.buildings) {
      if (this.buildingSprites.has(b.id)) continue;
      const size = BUILDINGS[b.type].size;
      const img = this.add
        .image(b.x * T, b.y * T, `bld-${b.type}`)
        .setOrigin(0, 0)
        .setDisplaySize(size * T, size * T)
        .setDepth(4);
      this.buildingSprites.set(b.id, img);
      if (!this.reducedMotion) {
        img.setScale(0.01);
        this.tweens.add({
          targets: img,
          scaleX: (size * T) / 64,
          scaleY: (size * T) / 64,
          duration: 350,
          ease: 'Back.Out',
        });
      }
    }
  }

  /** Machines are drawn parked on the road below the farmhouse. */
  private syncMachines(): void {
    for (const m of this.machineSprites) m.destroy();
    this.machineSprites = [];
    const s = this.session.game.state;
    const house = s.buildings.find((b) => b.type === 'farmhouse');
    if (!house) return;
    const baseX = house.x + 1;
    const y = house.y + 2;
    s.machines.slice(0, 10).forEach((m, i) => {
      const img = this.add
        .image((baseX - i) * T + T / 2, y * T + T / 2, `mac-${m.type}`)
        .setDisplaySize(T * 0.95, T * 0.67)
        .setDepth(5);
      if (m.broken) img.setTint(0xff7766);
      this.machineSprites.push(img);
    });
  }

  // ------------------------------------------------------------ camera ---

  private setupCamera(): void {
    const s = this.session.game.state;
    const cam = this.cameras.main;
    const w = s.map.width * T;
    const h = s.map.height * T;
    cam.setBounds(-w * 0.25, -h * 0.25, w * 1.5, h * 1.5);
    cam.setBackgroundColor('#3d6b33');
    cam.setZoom(1.25);
    const home = s.parcels.find((p) => p.owned) ?? s.parcels[0];
    cam.centerOn((home.x + home.w / 2) * T, (home.y + home.h / 2) * T);
    cam.setRoundPixels(true);
  }

  private zoomAt(factor: number, screenX: number, screenY: number): void {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM));
    const after = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  // ------------------------------------------------------------- input ---

  private tileAt(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const s = this.session.game.state;
    const x = Math.floor(p.worldX / T);
    const y = Math.floor(p.worldY / T);
    if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return null;
    return { x, y };
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomAt(dy > 0 ? 0.88 : 1.14, p.x, p.y);
      this.session.bus.emit('cameraMoved', undefined);
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const tile = this.tileAt(p);
      const button = p.button;
      this.dragStart = { x: p.x, y: p.y, tx: tile?.x ?? -1, ty: tile?.y ?? -1, button };
      this.panning = button === 1 || button === 2;
      this.rectSelecting = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const tile = this.tileAt(p);
      this.session.setHover(tile);
      const d = this.dragStart;
      if (!d || !p.isDown) return;
      const moved = Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 6;
      const isField = FIELD_TOOLS[this.session.tool] !== undefined;
      if (!this.panning && moved && d.button === 0) {
        if (isField && d.tx >= 0) this.rectSelecting = true;
        else if (!this.rectSelecting) this.panning = true;
      }
      if (this.panning) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
        this.session.bus.emit('cameraMoved', undefined);
      } else if (this.rectSelecting && tile) {
        this.session.setSelection({ x0: d.tx, y0: d.ty, x1: tile.x, y1: tile.y });
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.dragStart;
      this.dragStart = null;
      if (!d) return;
      const wasPanning = this.panning;
      const wasRect = this.rectSelecting;
      this.panning = false;
      this.rectSelecting = false;
      if (wasPanning || wasRect || d.button !== 0) return;
      const tile = this.tileAt(p);
      if (tile)
        void this.session.clickTile(tile.x, tile.y, p.event instanceof MouseEvent && p.event.shiftKey);
    });

    this.input.on('gameout', () => this.session.setHover(null));
  }

  // --------------------------------------------------------- subscribe ---

  private subscribe(): void {
    const ev = this.session.game.events;
    const bus = this.session.bus;
    this.unsub.push(
      ev.on('tilesChanged', (c) => {
        if (c === 'all') {
          this.redrawAllTiles();
          this.redrawOverlay();
        } else for (const i of c) this.redrawTile(i);
      }),
      ev.on('parcelsChanged', () => this.redrawOverlay()),
      ev.on('buildingsChanged', () => this.syncBuildings()),
      ev.on('machinesChanged', () => this.syncMachines()),
      ev.on('feedback', (f) => this.showFloating(f)),
      ev.on('day', () => {
        if (this.session.viewMode !== 'normal') this.redrawOverlay();
      }),
      bus.on('viewMode', () => this.redrawOverlay()),
      bus.on('selection', () => this.drawSelection()),
      bus.on('preview', () => this.drawSelection()),
      bus.on('hover', () => this.drawHover()),
      bus.on('tool', () => {
        this.drawHover();
        this.drawSelection();
      }),
      bus.on('building', () => this.drawHover()),
      bus.on('focusTile', ({ x, y }) => {
        const cam = this.cameras.main;
        if (this.reducedMotion) cam.centerOn(x * T + T / 2, y * T + T / 2);
        else cam.pan(x * T + T / 2, y * T + T / 2, 400, 'Sine.easeInOut');
      }),
    );
  }

  private drawSelection(): void {
    const g = this.selectionG;
    g.clear();
    const sel = this.session.selection;
    if (!sel) return;
    const p = this.session.preview;
    const s = this.session.game.state;
    const color = p && !p.ok ? 0xff6655 : 0xffffff;
    if (p) {
      g.fillStyle(0xffffff, 0.22);
      for (const i of p.tiles) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        g.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
      }
    }
    g.fillStyle(color, 0.08);
    g.fillRect(sel.x0 * T, sel.y0 * T, (sel.x1 - sel.x0 + 1) * T, (sel.y1 - sel.y0 + 1) * T);
    g.lineStyle(2, color, 0.95);
    g.strokeRect(sel.x0 * T, sel.y0 * T, (sel.x1 - sel.x0 + 1) * T, (sel.y1 - sel.y0 + 1) * T);
  }

  private drawHover(): void {
    const g = this.hoverG;
    g.clear();
    this.ghost.setVisible(false);
    const h = this.session.hover;
    if (!h) return;
    const s = this.session.game.state;
    const tool = this.session.tool;
    if (tool === 'buyLand') {
      const p = parcelAt(s, h.x, h.y);
      if (p && !p.owned) {
        const ok = isParcelForSale(s, p);
        g.fillStyle(ok ? 0xffd54a : 0xff5544, 0.25);
        g.fillRect(p.x * T, p.y * T, p.w * T, p.h * T);
        g.lineStyle(3, ok ? 0xffd54a : 0xff5544, 1);
        g.strokeRect(p.x * T, p.y * T, p.w * T, p.h * T);
      }
      return;
    }
    if (tool === 'build') {
      const type = this.session.building;
      const size = BUILDINGS[type].size;
      const check = canPlaceBuilding(s, type, h.x, h.y);
      this.ghost
        .setTexture(`bld-${type}`)
        .setPosition(h.x * T, h.y * T)
        .setDisplaySize(size * T, size * T)
        .setVisible(true);
      if (check.ok) this.ghost.clearTint();
      else this.ghost.setTint(0xff5544);
      g.lineStyle(2, check.ok ? 0x66ff88 : 0xff5544, 1);
      g.strokeRect(h.x * T, h.y * T, size * T, size * T);
      if (type === 'irrigation') {
        g.lineStyle(2, 0x5aa5ea, 0.9);
        g.strokeCircle((h.x + 1) * T, (h.y + 1) * T, IRRIGATION.stationRadius * T);
      }
      return;
    }
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeRect(h.x * T, h.y * T, T, T);
    // Show irrigation coverage when hovering a station.
    const tile = s.map.tiles[h.y * s.map.width + h.x];
    if (tile.building !== null) {
      const b = s.buildings.find((bb) => bb.id === tile.building);
      if (b?.type === 'irrigation') {
        g.lineStyle(2, 0x5aa5ea, 0.9);
        g.strokeCircle((b.x + 1) * T, (b.y + 1) * T, IRRIGATION.stationRadius * T);
      }
    }
  }

  private showFloating(f: FeedbackEvent): void {
    let item = this.floating.find((fl) => !fl.busy);
    if (!item) {
      if (this.floating.length >= 24) return;
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Trebuchet MS, Segoe UI, Arial, sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          stroke: '#1b2a14',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(30);
      item = { text, busy: false };
      this.floating.push(item);
    }
    const it = item;
    it.busy = true;
    const color = f.tone === 'good' ? '#9cff7a' : f.tone === 'bad' ? '#ffb199' : '#ffffff';
    it.text
      .setText(t(f.key, f.params as Params | undefined))
      .setColor(color)
      .setPosition(f.x * T + T / 2, f.y * T)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: it.text,
      y: this.reducedMotion ? it.text.y : it.text.y - 40,
      alpha: 0,
      delay: 900,
      duration: 900,
      onComplete: () => {
        it.text.setVisible(false);
        it.busy = false;
      },
    });
  }

  // ------------------------------------------------------------- update ---

  override update(_time: number, delta: number): void {
    this.session.update(delta);
    const cam = this.cameras.main;
    const k = this.session.keys;
    let dx = 0;
    let dy = 0;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    if (k.has('+') || k.has('=')) this.zoomAt(1 + delta / 600, cam.width / 2, cam.height / 2);
    if (k.has('-')) this.zoomAt(1 - delta / 600, cam.width / 2, cam.height / 2);
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      cam.scrollX += ((dx / len) * PAN_SPEED * delta) / 1000 / cam.zoom;
      cam.scrollY += ((dy / len) * PAN_SPEED * delta) / 1000 / cam.zoom;
    }
    this.updateRain(delta);
  }

  private updateRain(delta: number): void {
    const g = this.rainG;
    g.clear();
    const w = this.session.game.state.weather.today;
    const raining = w === 'rain' || w === 'heavyRain' || w === 'storm';
    if (!raining || this.quality === 'low' || this.reducedMotion) {
      this.rain.length = 0;
      return;
    }
    const cam = this.cameras.main;
    const target = w === 'rain' ? 70 : 160;
    while (this.rain.length < target)
      this.rain.push({
        x: Math.random() * cam.width,
        y: Math.random() * cam.height,
        s: 0.6 + Math.random() * 0.6,
      });
    if (this.rain.length > target) this.rain.length = target;
    g.lineStyle(1, 0xcfe6ff, 0.45);
    for (const d of this.rain) {
      d.y += delta * 0.9 * d.s;
      d.x -= delta * 0.15 * d.s;
      if (d.y > cam.height) {
        d.y = -10;
        d.x = Math.random() * (cam.width + 60);
      }
      g.lineBetween(d.x, d.y, d.x - 3, d.y + 10);
    }
    if (w === 'storm') {
      g.fillStyle(0x0a1020, 0.18);
      g.fillRect(0, 0, cam.width, cam.height);
    }
  }
}
