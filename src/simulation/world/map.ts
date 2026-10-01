import { GAME_CONFIG } from '../../config/game';
import { LAND, REGIONS, START } from '../../data/balance';
import { clamp } from '../../utils/math';
import type { Rng } from '../../utils/rng';
import type { GameState, Parcel, RegionId, Tile } from '../types';

export function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
}

export function getTile(state: GameState, x: number, y: number): Tile | null {
  if (!inBounds(state, x, y)) return null;
  return state.map.tiles[tileIndex(state.map.width, x, y)];
}

export function parcelAt(state: GameState, x: number, y: number): Parcel | null {
  if (!inBounds(state, x, y)) return null;
  const size = GAME_CONFIG.parcelSize;
  const perRow = Math.ceil(state.map.width / size);
  const id = Math.floor(y / size) * perRow + Math.floor(x / size);
  return state.parcels[id] ?? null;
}

export function isOwned(state: GameState, x: number, y: number): boolean {
  return parcelAt(state, x, y)?.owned ?? false;
}

export function ownedTileCount(state: GameState): number {
  return state.parcels.filter((p) => p.owned).reduce((s, p) => s + p.w * p.h, 0);
}

export function farmableOwnedTiles(state: GameState): number {
  let n = 0;
  for (const p of state.parcels) {
    if (!p.owned) continue;
    forEachParcelTile(state, p, (t) => {
      if (t.terrain === 'grass' && t.building === null) n++;
    });
  }
  return n;
}

export function forEachParcelTile(
  state: GameState,
  p: Parcel,
  fn: (tile: Tile, x: number, y: number, index: number) => void,
): void {
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      const i = tileIndex(state.map.width, x, y);
      fn(state.map.tiles[i], x, y, i);
    }
  }
}

/** A parcel is for sale when not owned and orthogonally adjacent to an owned parcel. */
export function isParcelForSale(state: GameState, parcel: Parcel): boolean {
  if (parcel.owned) return false;
  const size = GAME_CONFIG.parcelSize;
  const perRow = Math.ceil(state.map.width / size);
  const px = parcel.x / size;
  const py = parcel.y / size;
  const neighbours = [
    [px - 1, py],
    [px + 1, py],
    [px, py - 1],
    [px, py + 1],
  ];
  return neighbours.some(([nx, ny]) => {
    if (nx < 0 || ny < 0 || nx >= perRow || ny >= Math.ceil(state.map.height / size)) return false;
    return state.parcels[ny * perRow + nx]?.owned ?? false;
  });
}

export function parcelPrice(state: GameState, parcel: Parcel, costMult: number): number {
  let value = 0;
  forEachParcelTile(state, parcel, (t) => {
    let f = 0.6 + (t.fertility / 100) * 0.8;
    if (t.terrain === 'water') f = LAND.waterTileFactor;
    else if (t.terrain === 'forest') f *= LAND.forestTileFactor;
    else if (t.terrain === 'road') f = 0.3;
    value += LAND.pricePerTile * f;
  });
  const owned = state.parcels.filter((p) => p.owned).length;
  const region = REGIONS[state.region];
  return Math.round((value * region.landPriceMult * costMult * (1 + LAND.expansionPremium * (owned - 1))) / 10) * 10;
}

/** Simple value noise for fertility patterns. */
function makeNoise(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gw * gh; i++) grid.push(rng.next());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const v = (ix: number, iy: number) => grid[iy * gw + ix];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

export interface GeneratedWorld {
  width: number;
  height: number;
  tiles: Tile[];
  parcels: Parcel[];
}

export function generateWorld(rng: Rng, region: RegionId): GeneratedWorld {
  const width = GAME_CONFIG.mapWidth;
  const height = GAME_CONFIG.mapHeight;
  const size = GAME_CONFIG.parcelSize;
  const n1 = makeNoise(rng, width, height, 12);
  const n2 = makeNoise(rng, width, height, 5);
  const forestNoise = makeNoise(rng, width, height, 7);
  const tiles: Tile[] = [];
  const { min, max } = START.initialFertility;
  const startPx = START.parcel.px * size;
  const startPy = START.parcel.py * size;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const f = n1(x, y) * 0.7 + n2(x, y) * 0.3;
      tiles.push({
        terrain: 'grass',
        field: 'natural',
        fertility: Math.round(clamp(min + (max - min) * f, 10, 100)),
        moisture: START.initialMoisture + Math.round((n2(x, y) - 0.5) * 20),
        soilHealth: 100,
        crop: null,
        building: null,
        lastCrop: null,
      });
    }
  }
  const at = (x: number, y: number) => tiles[tileIndex(width, x, y)];
  const inStart = (x: number, y: number) =>
    x >= startPx - 1 && x < startPx + size + 1 && y >= startPy - 1 && y < startPy + size + 1;

  // River: meandering band from top to bottom, kept away from the starting parcel.
  let rx = rng.pick([10, 12, 48, 52]);
  for (let y = 0; y < height; y++) {
    rx += rng.int(-1, 1);
    rx = clamp(rx, 4, width - 5);
    if (rx > startPx - 4 && rx < startPx + size + 3) rx = rx < startPx + size / 2 ? startPx - 4 : startPx + size + 3;
    const widthHere = 2 + (rng.chance(0.3) ? 1 : 0);
    for (let dx = 0; dx < widthHere; dx++) {
      const t = at(rx + dx, y);
      t.terrain = 'water';
      t.moisture = 100;
    }
    // River banks are more fertile and moist.
    for (const bx of [rx - 1, rx + widthHere]) {
      if (bx >= 0 && bx < width) {
        const t = at(bx, y);
        if (t.terrain === 'grass') {
          t.fertility = Math.min(100, t.fertility + 12);
          t.moisture = Math.min(90, t.moisture + 15);
        }
      }
    }
  }

  // A pond.
  const pcx = rng.int(40, 56);
  const pcy = rng.int(8, 20);
  for (let y = pcy - 3; y <= pcy + 3; y++) {
    for (let x = pcx - 4; x <= pcx + 4; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if ((x - pcx) ** 2 / 16 + (y - pcy) ** 2 / 9 <= 1) at(x, y).terrain = 'water';
    }
  }

  // Forest patches outside the start area.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = at(x, y);
      if (t.terrain !== 'grass' || inStart(x, y)) continue;
      if (forestNoise(x, y) > 0.72) t.terrain = 'forest';
    }
  }

  // Main road (horizontal) just below the starting parcel, plus a vertical road.
  const roadY = startPy + size;
  for (let x = 0; x < width; x++) {
    const t = at(x, roadY);
    t.terrain = 'road';
    t.fertility = 0;
  }
  const roadX = startPx + size;
  for (let y = 0; y < height; y++) {
    const t = at(roadX, y);
    if (t.terrain === 'water') continue; // bridge-less crossing: keep water visible
    t.terrain = 'road';
    t.fertility = 0;
  }

  // Region climate tweak on initial moisture.
  const regionDef = REGIONS[region];
  const moistBias = (regionDef.weatherBias.rain ?? 0) - (regionDef.weatherBias.drought ?? 0) * 2;
  if (moistBias !== 0) {
    for (const t of tiles) if (t.terrain === 'grass') t.moisture = clamp(t.moisture + moistBias, 10, 95);
  }

  const parcels: Parcel[] = [];
  const perRow = Math.ceil(width / size);
  const perCol = Math.ceil(height / size);
  for (let py = 0; py < perCol; py++) {
    for (let px = 0; px < perRow; px++) {
      parcels.push({
        id: py * perRow + px,
        x: px * size,
        y: py * size,
        w: Math.min(size, width - px * size),
        h: Math.min(size, height - py * size),
        owned: px === START.parcel.px && py === START.parcel.py,
        purchasePrice: 0,
      });
    }
  }
  return { width, height, tiles, parcels };
}
