/**
 * Procedural, original artwork drawn with Canvas 2D. Used both by Phaser
 * (canvas textures) and by the DOM UI (data URLs). No external image assets.
 */
import type { BuildingType, CropId, CropStage, MachineType } from '../../simulation/types';

export const TILE = 32;
/** Atlas cell = tile + 1px extrusion on each side (prevents seams when zooming). */
export const CELL = TILE + 2;
export const ATLAS_COLS = 8;

export const TILE_ID = {
  grass: [0, 1, 2],
  water: 3,
  road: 4,
  forest: 5,
  prepared: 6,
  yard: 7,
  white: 8,
  stripes: 9,
  cropBase: 10,
} as const;

export const CROP_ORDER: CropId[] = ['corn', 'soy', 'wheat', 'potato', 'sunflower'];
export const STAGE_ORDER: CropStage[] = ['seed', 'sprout', 'early', 'mid', 'mature', 'ready'];
export const ATLAS_TILE_COUNT = TILE_ID.cropBase + CROP_ORDER.length * STAGE_ORDER.length;

export function cropTileId(crop: CropId, stage: CropStage): number {
  return TILE_ID.cropBase + CROP_ORDER.indexOf(crop) * STAGE_ORDER.length + STAGE_ORDER.indexOf(stage);
}

type Ctx = CanvasRenderingContext2D;

/** Tiny deterministic PRNG for texture details. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function speckle(ctx: Ctx, rnd: () => number, colors: string[], count: number, size = 1): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), size, size);
  }
}

function drawGrass(ctx: Ctx, variant: number): void {
  const rnd = prng(11 + variant * 97);
  ctx.fillStyle = ['#5f9e45', '#64a349', '#5a9842'][variant];
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rnd, ['#4f8a3a', '#72b455', '#7cc15d', '#568f3e'], 70);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * TILE);
    ctx.fillStyle = '#86c866';
    ctx.fillRect(x, y, 1, 2);
  }
}

function drawWater(ctx: Ctx): void {
  const g = ctx.createLinearGradient(0, 0, TILE, TILE);
  g.addColorStop(0, '#2f6fc2');
  g.addColorStop(1, '#3a82d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  const rnd = prng(5);
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 8 + Math.floor(rnd() * 3);
    const x = Math.floor(rnd() * 16);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, y - 2, x + 8, y);
    ctx.quadraticCurveTo(x + 12, y + 2, x + 16, y);
    ctx.stroke();
  }
}

function drawRoad(ctx: Ctx): void {
  ctx.fillStyle = '#a08c6e';
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, prng(7), ['#8d7a5e', '#b29e80', '#958164'], 90);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, TILE, 2);
  ctx.fillRect(0, TILE - 2, TILE, 2);
  ctx.fillRect(0, 0, 2, TILE);
  ctx.fillRect(TILE - 2, 0, 2, TILE);
}

function drawForest(ctx: Ctx): void {
  drawGrass(ctx, 2);
  const trees = [
    [9, 10, 8],
    [23, 9, 7],
    [15, 22, 9],
    [27, 25, 5],
  ];
  for (const [x, y, r] of trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6b2a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f8636';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSoil(ctx: Ctx, seed = 3, rows = true): void {
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, prng(seed), ['#6b4628', '#875d38', '#5f3d22'], 60);
  if (rows) {
    for (let y = 2; y < TILE; y += 6) {
      ctx.fillStyle = '#5e3b1f';
      ctx.fillRect(0, y, TILE, 2);
      ctx.fillStyle = '#93673f';
      ctx.fillRect(0, y + 2, TILE, 1);
    }
  }
}

function drawYard(ctx: Ctx): void {
  ctx.fillStyle = '#b9ad94';
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, prng(19), ['#a69a80', '#c9bea6', '#9d917a'], 110);
}

function drawStripes(ctx: Ctx): void {
  ctx.clearRect(0, 0, TILE, TILE);
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 3;
  for (let i = -TILE; i < TILE * 2; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + TILE, TILE);
    ctx.stroke();
  }
}

/** Row positions used by crops (aligned with the furrows). */
const ROWS = [4, 10, 16, 22, 28];
const COLS = [4, 10, 16, 22, 28];

function plantGrid(fn: (x: number, y: number, i: number) => void): void {
  let i = 0;
  for (const y of ROWS) for (const x of COLS) fn(x, y, i++);
}

function drawCrop(ctx: Ctx, crop: CropId, stage: CropStage): void {
  drawSoil(ctx, 3, true);
  const rnd = prng(crop.length * 31 + STAGE_ORDER.indexOf(stage) * 7);
  if (stage === 'seed') {
    plantGrid((x, y) => {
      ctx.fillStyle = '#d9c08a';
      ctx.fillRect(x, y, 1, 1);
    });
    return;
  }
  if (stage === 'sprout') {
    plantGrid((x, y) => {
      ctx.fillStyle = '#8fd16a';
      ctx.fillRect(x - 1, y - 1, 1, 1);
      ctx.fillRect(x + 1, y - 1, 1, 1);
      ctx.fillStyle = '#6fb04f';
      ctx.fillRect(x, y, 1, 1);
    });
    return;
  }
  const scale = stage === 'early' ? 0.45 : stage === 'mid' ? 0.75 : 1;
  switch (crop) {
    case 'corn': {
      const leaf = stage === 'ready' ? '#c9a54b' : stage === 'mature' ? '#5c9a34' : '#4f9a36';
      const leaf2 = stage === 'ready' ? '#e0c56a' : '#6fbf4a';
      for (const x of [5, 11, 17, 23, 29]) {
        for (let y = 3; y < TILE; y += 7) {
          const h = Math.round(6 * scale) + 1;
          ctx.fillStyle = leaf;
          ctx.fillRect(x, y - h + 4, 2, h);
          ctx.fillStyle = leaf2;
          ctx.fillRect(x - 2, y + 1 - Math.round(2 * scale), 2, 1);
          ctx.fillRect(x + 2, y + 2 - Math.round(3 * scale), 2, 1);
          if (stage === 'mature' || stage === 'ready') {
            ctx.fillStyle = stage === 'ready' ? '#f2d34f' : '#e7e3a0';
            ctx.fillRect(x, y - h + 3, 2, 2);
          }
        }
      }
      break;
    }
    case 'soy': {
      const c1 = stage === 'ready' ? '#b98b3a' : '#5ea83c';
      const c2 = stage === 'ready' ? '#d7aa52' : '#79c552';
      plantGrid((x, y) => {
        const r = 2.4 * scale + 0.6;
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'wheat': {
      const base = stage === 'ready' ? '#e3c160' : stage === 'mature' ? '#a9c25a' : '#7fbf55';
      const tip = stage === 'ready' ? '#f5dd8a' : stage === 'mature' ? '#d6d27a' : '#9bd46f';
      const density = stage === 'early' ? 40 : stage === 'mid' ? 90 : 150;
      if (stage === 'mature' || stage === 'ready') {
        ctx.fillStyle = stage === 'ready' ? 'rgba(220,180,80,0.65)' : 'rgba(150,190,80,0.55)';
        ctx.fillRect(0, 0, TILE, TILE);
      }
      for (let i = 0; i < density; i++) {
        const x = Math.floor(rnd() * TILE);
        const y = Math.floor(rnd() * TILE);
        ctx.fillStyle = base;
        ctx.fillRect(x, y, 1, Math.max(1, Math.round(3 * scale)));
        ctx.fillStyle = tip;
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    }
    case 'potato': {
      const leaf = stage === 'ready' ? '#9a9a48' : '#3f8a35';
      const leaf2 = stage === 'ready' ? '#b8b25a' : '#58a944';
      plantGrid((x, y, i) => {
        if (i % 2 === 1 && stage === 'early') return;
        const r = 3 * scale + 0.5;
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k === 0 ? leaf : leaf2;
          ctx.beginPath();
          ctx.arc(x + (k - 1) * r * 0.6, y + (k === 1 ? -r * 0.4 : 0), r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        if (stage === 'ready') {
          ctx.fillStyle = '#c99a5b';
          ctx.fillRect(x + 2, y + 2, 2, 2);
          ctx.fillRect(x - 3, y + 1, 2, 2);
        }
      });
      break;
    }
    case 'sunflower': {
      for (const x of [5, 13, 21, 29]) {
        for (const y of [6, 15, 24]) {
          const h = Math.round(5 * scale) + 1;
          ctx.fillStyle = stage === 'ready' ? '#8a7a3a' : '#4d9a35';
          ctx.fillRect(x, y - h + 4, 1, h);
          ctx.fillStyle = stage === 'ready' ? '#a59248' : '#68b84a';
          ctx.fillRect(x - 2, y + 1, 2, 1);
          ctx.fillRect(x + 1, y, 2, 1);
          if (stage === 'mature') {
            ctx.fillStyle = '#ffd21f';
            ctx.beginPath();
            ctx.arc(x, y - h + 3, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#6b3d14';
            ctx.beginPath();
            ctx.arc(x, y - h + 3, 1.4, 0, Math.PI * 2);
            ctx.fill();
          } else if (stage === 'ready') {
            ctx.fillStyle = '#5a3a18';
            ctx.beginPath();
            ctx.arc(x + 1, y - h + 4, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#c99f2a';
            ctx.fillRect(x - 1, y - h + 2, 1, 1);
          } else if (stage === 'mid') {
            ctx.fillStyle = '#9ccc4a';
            ctx.fillRect(x - 1, y - h + 2, 3, 2);
          }
        }
      }
      break;
    }
  }
}

/** Builds the tile atlas canvas (with 1px edge extrusion). */
export function buildTileAtlas(): HTMLCanvasElement {
  const rows = Math.ceil(ATLAS_TILE_COUNT / ATLAS_COLS);
  const atlas = makeCanvas(ATLAS_COLS * CELL, rows * CELL);
  const actx = atlas.getContext('2d');
  if (!actx) throw new Error('2D canvas not supported');
  const tile = makeCanvas(TILE, TILE);
  const ctx = tile.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');

  const drawers: (() => void)[] = [];
  drawers[TILE_ID.grass[0]] = () => drawGrass(ctx, 0);
  drawers[TILE_ID.grass[1]] = () => drawGrass(ctx, 1);
  drawers[TILE_ID.grass[2]] = () => drawGrass(ctx, 2);
  drawers[TILE_ID.water] = () => drawWater(ctx);
  drawers[TILE_ID.road] = () => drawRoad(ctx);
  drawers[TILE_ID.forest] = () => drawForest(ctx);
  drawers[TILE_ID.prepared] = () => drawSoil(ctx, 3, true);
  drawers[TILE_ID.yard] = () => drawYard(ctx);
  drawers[TILE_ID.white] = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TILE, TILE);
  };
  drawers[TILE_ID.stripes] = () => drawStripes(ctx);
  for (const crop of CROP_ORDER)
    for (const stage of STAGE_ORDER) drawers[cropTileId(crop, stage)] = () => drawCrop(ctx, crop, stage);

  for (let id = 0; id < ATLAS_TILE_COUNT; id++) {
    ctx.clearRect(0, 0, TILE, TILE);
    drawers[id]?.();
    const cx = (id % ATLAS_COLS) * CELL;
    const cy = Math.floor(id / ATLAS_COLS) * CELL;
    actx.drawImage(tile, cx + 1, cy + 1);
    // Extrude edges.
    actx.drawImage(tile, 0, 0, TILE, 1, cx + 1, cy, TILE, 1);
    actx.drawImage(tile, 0, TILE - 1, TILE, 1, cx + 1, cy + TILE + 1, TILE, 1);
    actx.drawImage(tile, 0, 0, 1, TILE, cx, cy + 1, 1, TILE);
    actx.drawImage(tile, TILE - 1, 0, 1, TILE, cx + TILE + 1, cy + 1, 1, TILE);
  }
  return atlas;
}

// ------------------------------------------------------------- buildings --

function shadow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 3, y + 4, w, h);
}

function roof(ctx: Ctx, x: number, y: number, w: number, h: number, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c2;
  ctx.fillRect(x, y, w, Math.floor(h / 2));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + Math.floor(h / 2), w, 1);
}

export function drawBuilding(type: BuildingType, size = 64): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(size / 64, size / 64);
  switch (type) {
    case 'farmhouse': {
      shadow(ctx, 8, 12, 48, 42);
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(8, 30, 48, 24);
      roof(ctx, 6, 10, 52, 22, '#a83a2c', '#c2493a');
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(28, 40, 8, 14);
      ctx.fillStyle = '#8fc3e6';
      ctx.fillRect(13, 37, 8, 7);
      ctx.fillRect(43, 37, 8, 7);
      ctx.fillStyle = '#7a2a20';
      ctx.fillRect(44, 12, 5, 8);
      break;
    }
    case 'silo': {
      for (const [cx, cy] of [
        [20, 30],
        [44, 30],
      ]) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(cx + 3, cy + 4, 15, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 15);
        g.addColorStop(0, '#f0f3f5');
        g.addColorStop(1, '#8e9aa3');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,70,80,0.5)';
        ctx.lineWidth = 1;
        for (const r of [5, 9, 13]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#5c6770';
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
      }
      ctx.fillStyle = '#7d6a4c';
      ctx.fillRect(18, 50, 30, 6);
      break;
    }
    case 'shed': {
      shadow(ctx, 4, 8, 56, 48);
      roof(ctx, 4, 8, 56, 48, '#3f7d4e', '#4f9460');
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = 6; x < 60; x += 5) ctx.fillRect(x, 8, 1, 48);
      ctx.fillStyle = '#2f3b33';
      ctx.fillRect(18, 50, 28, 6);
      break;
    }
    case 'workshop': {
      shadow(ctx, 8, 10, 48, 44);
      ctx.fillStyle = '#9aa1a6';
      ctx.fillRect(8, 30, 48, 24);
      roof(ctx, 6, 10, 52, 22, '#c8742c', '#e08a3a');
      ctx.fillStyle = '#444';
      ctx.fillRect(14, 38, 18, 16);
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(46, 44, 5, 0, Math.PI * 2);
      ctx.stroke();
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(46 + Math.cos(ang) * 5, 44 + Math.sin(ang) * 5);
        ctx.lineTo(46 + Math.cos(ang) * 8, 44 + Math.sin(ang) * 8);
        ctx.stroke();
      }
      break;
    }
    case 'office': {
      shadow(ctx, 8, 8, 48, 48);
      ctx.fillStyle = '#e8edf2';
      ctx.fillRect(8, 26, 48, 30);
      roof(ctx, 6, 8, 52, 20, '#2f5d8a', '#3c74aa');
      ctx.fillStyle = '#7fb6e0';
      for (let x = 12; x < 52; x += 10) {
        ctx.fillRect(x, 32, 6, 6);
        ctx.fillRect(x, 44, 6, 6);
      }
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(28, 14, 8, 6);
      break;
    }
    case 'irrigation': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(24, 26, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f78c4';
      ctx.beginPath();
      ctx.arc(22, 24, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5aa5ea';
      ctx.beginPath();
      ctx.arc(19, 21, 7, 0, Math.PI * 2);
      ctx.fill();
      shadow(ctx, 38, 34, 20, 20);
      roof(ctx, 38, 34, 20, 20, '#6c7a86', '#83929e');
      ctx.strokeStyle = '#c9d3db';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(30, 34);
      ctx.lineTo(40, 42);
      ctx.moveTo(48, 54);
      ctx.lineTo(48, 62);
      ctx.moveTo(58, 44);
      ctx.lineTo(64, 44);
      ctx.stroke();
      break;
    }
  }
  return c;
}

// --------------------------------------------------------------- machines --

export function drawMachine(type: MachineType, w = 40, h = 28): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(w / 40, h / 28);
  const wheel = (x: number, y: number, r: number) => {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (type) {
    case 'tractor':
      ctx.fillStyle = '#2f8f3a';
      ctx.fillRect(8, 10, 24, 9);
      ctx.fillRect(20, 3, 10, 9);
      ctx.fillStyle = '#9fd3f0';
      ctx.fillRect(22, 5, 6, 5);
      ctx.fillStyle = '#555';
      ctx.fillRect(10, 6, 2, 5);
      wheel(26, 20, 7);
      wheel(10, 22, 4.5);
      break;
    case 'planter':
      ctx.fillStyle = '#d9822b';
      ctx.fillRect(4, 8, 32, 8);
      ctx.fillStyle = '#f2b35a';
      for (let x = 6; x < 36; x += 6) ctx.fillRect(x, 4, 4, 5);
      ctx.fillStyle = '#333';
      for (let x = 7; x < 36; x += 6) ctx.fillRect(x, 17, 2, 5);
      wheel(8, 22, 3);
      wheel(32, 22, 3);
      break;
    case 'harvester':
      ctx.fillStyle = '#d9b42b';
      ctx.fillRect(10, 4, 24, 16);
      ctx.fillStyle = '#b5352b';
      ctx.fillRect(0, 14, 12, 6);
      ctx.fillStyle = '#9fd3f0';
      ctx.fillRect(13, 6, 7, 6);
      ctx.fillStyle = '#8a7a2a';
      ctx.fillRect(28, 1, 4, 8);
      wheel(16, 21, 6);
      wheel(30, 22, 4.5);
      break;
    case 'sprayer':
      ctx.fillStyle = '#e8eef2';
      ctx.beginPath();
      ctx.ellipse(18, 12, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a7bd5';
      ctx.fillRect(28, 8, 8, 10);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(40, 6);
      ctx.stroke();
      wheel(12, 21, 5);
      wheel(30, 21, 5);
      break;
  }
  return c;
}

const urlCache = new Map<string, string>();

/** Data URL of a machine/building drawing (for DOM <img>). */
export function artUrl(kind: 'machine' | 'building', id: string): string {
  const key = `${kind}:${id}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  try {
    const canvas =
      kind === 'machine' ? drawMachine(id as MachineType, 80, 56) : drawBuilding(id as BuildingType, 64);
    const url = canvas.toDataURL('image/png');
    urlCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}
