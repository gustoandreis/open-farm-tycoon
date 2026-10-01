import { GAME_CONFIG } from '../config/game';
import { CROP_IDS, CROPS, DIFFICULTY, EVENTS, WORKERS } from '../data/balance';
import { Emitter } from '../utils/emitter';
import { clamp, round } from '../utils/math';
import { Rng, randomSeedString } from '../utils/rng';
import { build, buildingsUpkeep, placeBuilding } from './buildings/buildings';
import type { SimContext, SimEvents } from './context';
import { executeOperation, previewOperation, type Rect } from './crops/fieldOps';
import { addTransaction } from './economy/ledger';
import { totalDebt } from './economy/valuation';
import { triggerEvent, updateEvents } from './events/events';
import { processLoanPayments, prepayLoan, takeLoan, updateFinanceStatus } from './finance/loans';
import {
  buyMachine,
  machinesMonthlyUpkeep,
  maintainMachine,
  sellMachine,
  updateMachinesDaily,
} from './machinery/machines';
import { initMarket, updateMarket } from './market/market';
import { sellCommodity } from './market/sales';
import { checkProgress } from './progression/progression';
import { updateSoilAndCrops } from './soil/soil';
import { research } from './technology/technology';
import { isFirstDayOfMonth, isFirstDayOfYear, toDate } from './time/calendar';
import type {
  BuildingType,
  CropId,
  Difficulty,
  FieldOperation,
  GameState,
  MachineType,
  RegionId,
  Stats,
  WorkerAssignment,
  YearSummary,
} from './types';
import { initWeather, advanceWeather } from './weather/weather';
import { assignWorker, fireWorker, hireWorker, paySalaries, refreshCandidates, workforce } from './workers/workers';
import { buyParcel } from './world/land';
import { forEachParcelTile, generateWorld, parcelPrice, ownedTileCount } from './world/map';

export interface NewGameOptions {
  farmName: string;
  difficulty: Difficulty;
  seed?: string;
  region?: RegionId;
}

function emptyCropRecord(): Record<CropId, number> {
  return { corn: 0, soy: 0, wheat: 0, potato: 0, sunflower: 0 };
}

function emptyStats(): Stats {
  return {
    daysPlayed: 0,
    tilesPlanted: 0,
    tilesHarvested: 0,
    production: emptyCropRecord(),
    totalProduction: 0,
    salesCount: 0,
    salesRevenue: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    biggestSale: 0,
    machinesBought: 0,
    buildingsBuilt: 0,
    landBought: 0,
    maxDebt: 0,
    loansTaken: 0,
    loansRepaid: 0,
  };
}

/** Builds a brand-new, fully initialized game state. */
export function createNewState(opts: NewGameOptions): GameState {
  const seed = (opts.seed ?? '').trim() || randomSeedString();
  const region = opts.region ?? 'parana';
  const rng = Rng.fromString(seed);
  const world = generateWorld(rng, region);
  const state: GameState = {
    saveVersion: GAME_CONFIG.saveVersion,
    farmName: opts.farmName.trim().slice(0, 40) || 'Fazenda',
    difficulty: opts.difficulty,
    region,
    seed,
    rngState: 0,
    day: 0,
    tick: 0,
    money: DIFFICULTY[opts.difficulty].startMoney,
    map: { width: world.width, height: world.height, tiles: world.tiles },
    parcels: world.parcels,
    buildings: [],
    machines: [],
    workers: [],
    candidates: [],
    nextId: 1,
    inventory: emptyCropRecord(),
    market: { commodities: {} as GameState['market']['commodities'], fuelPrice: 0, fuelHistory: [] },
    weather: { today: 'sunny', forecast: [] },
    loans: [],
    ledger: [],
    monthly: {},
    events: { active: [], lastEventDay: 0, history: [] },
    technologies: [],
    progression: { xp: 0, level: 1 },
    objectives: [],
    achievements: [],
    stats: emptyStats(),
    finance: { negativeDays: 0, status: 'ok' },
    tutorial: { active: true, step: 0, completed: false, skipped: false },
    workUsed: { prepare: 0, plant: 0, harvest: 0, irrigate: 0 },
    year: { current: toDate(0).year, startRevenue: 0, startExpenses: 0, startProduction: 0, revenueByCrop: emptyCropRecord() },
    lastYearSummary: null,
    notifications: [],
  };

  // Starting parcel: guarantee decent soil so the first season is not luck-dependent.
  const start = state.parcels.find((p) => p.owned);
  if (start) {
    forEachParcelTile(state, start, (t) => {
      if (t.terrain === 'grass' || t.terrain === 'forest') {
        t.terrain = 'grass';
        t.fertility = clamp(t.fertility, 62, 92);
        t.moisture = clamp(t.moisture, 50, 70);
      }
    });
    placeBuilding(state, 'farmhouse', start.x + start.w - 2, start.y + start.h - 2);
    start.purchasePrice = parcelPrice(state, start, 1);
  }
  initWeather(state, rng);
  initMarket(state, rng);
  refreshCandidates(state, rng);
  state.rngState = rng.state;
  return state;
}

/**
 * Game = state + RNG + event bus. All player actions and the daily tick go
 * through this class; it has no rendering dependency.
 */
export class Game implements SimContext {
  readonly events = new Emitter<SimEvents>();
  readonly rng: Rng;

  constructor(public state: GameState) {
    this.rng = new Rng(state.rngState);
  }

  static newGame(opts: NewGameOptions): Game {
    return new Game(createNewState(opts));
  }

  emit<K extends keyof SimEvents>(type: K, payload: SimEvents[K]): void {
    this.events.emit(type, payload);
  }

  /** Returns a deep copy of the state suitable for saving. */
  snapshot(): GameState {
    this.state.rngState = this.rng.state;
    return JSON.parse(JSON.stringify(this.state)) as GameState;
  }

  get isGameOver(): boolean {
    return this.state.finance.status === 'bankrupt';
  }

  // ---------------------------------------------------------------- tick ---

  /** Advances the simulation by one game day. */
  advanceDay(): void {
    const s = this.state;
    if (this.isGameOver) return;
    s.day++;
    s.tick++;
    s.stats.daysPlayed++;
    s.workUsed = { prepare: 0, plant: 0, harvest: 0, irrigate: 0 };

    advanceWeather(this);
    updateEvents(this);
    const soil = updateSoilAndCrops(this);
    updateMachinesDaily(this, WORKERS.maintenancePerDay * workforce(s, 'maintenance'));
    updateMarket(this);
    processLoanPayments(this);

    if (isFirstDayOfMonth(s.day)) this.monthlyCosts();
    updateFinanceStatus(this);
    s.stats.maxDebt = Math.max(s.stats.maxDebt, totalDebt(s));
    if (isFirstDayOfYear(s.day)) this.closeYear();
    checkProgress(this);

    s.rngState = this.rng.state;
    if (soil.changed.length > 0) this.emit('tilesChanged', soil.changed);
    this.emit('day', s.day);
  }

  advanceDays(n: number): void {
    for (let i = 0; i < n && !this.isGameOver; i++) this.advanceDay();
  }

  private monthlyCosts(): void {
    const s = this.state;
    paySalaries(this);
    const upkeep = buildingsUpkeep(s);
    if (upkeep > 0) addTransaction(this, 'maintenance', { key: 'ledger.buildingUpkeep' }, -upkeep);
    const mUpkeep = machinesMonthlyUpkeep(s);
    if (mUpkeep > 0) addTransaction(this, 'maintenance', { key: 'ledger.machineUpkeep' }, -mUpkeep);
    refreshCandidates(s, this.rng);
  }

  private closeYear(): void {
    const s = this.state;
    const revenue = round(s.stats.totalRevenue - s.year.startRevenue, 2);
    const expenses = round(s.stats.totalExpenses - s.year.startExpenses, 2);
    let best: CropId | null = null;
    for (const id of CROP_IDS) if ((s.year.revenueByCrop[id] ?? 0) > 0 && (!best || s.year.revenueByCrop[id] > s.year.revenueByCrop[best])) best = id;
    const summary: YearSummary = {
      year: s.year.current,
      revenue,
      expenses,
      profit: round(revenue - expenses, 2),
      production: round(s.stats.totalProduction - s.year.startProduction, 2),
      area: ownedTileCount(s),
      bestCommodity: best,
      revenueByCrop: { ...s.year.revenueByCrop },
    };
    s.lastYearSummary = summary;
    s.year = {
      current: toDate(s.day).year,
      startRevenue: s.stats.totalRevenue,
      startExpenses: s.stats.totalExpenses,
      startProduction: s.stats.totalProduction,
      revenueByCrop: emptyCropRecord(),
    };
    this.emit('yearEnd', summary);
  }

  // ------------------------------------------------------------- actions ---

  previewOperation(op: FieldOperation, rect: Rect, crop: CropId | null = null) {
    return previewOperation(this.state, op, rect, crop);
  }

  executeOperation(op: FieldOperation, rect: Rect, crop: CropId | null = null) {
    return executeOperation(this, op, rect, crop);
  }

  buyParcel(parcelId: number) {
    return buyParcel(this, parcelId);
  }

  build(type: BuildingType, x: number, y: number) {
    return build(this, type, x, y);
  }

  sell(crop: CropId, tonnes: number) {
    return sellCommodity(this, crop, tonnes);
  }

  buyMachine(type: MachineType) {
    return buyMachine(this, type);
  }

  sellMachine(id: number) {
    return sellMachine(this, id);
  }

  maintainMachine(id: number) {
    return maintainMachine(this, id);
  }

  hireWorker(candidateId: number) {
    return hireWorker(this, candidateId);
  }

  fireWorker(id: number) {
    return fireWorker(this, id);
  }

  assignWorker(id: number, a: WorkerAssignment) {
    return assignWorker(this.state, id, a);
  }

  takeLoan(amount: number, termMonths: number) {
    return takeLoan(this, amount, termMonths);
  }

  prepayLoan(id: number, amount: number) {
    return prepayLoan(this, id, amount);
  }

  research(id: string) {
    return research(this, id);
  }

  // ---------------------------------------------------------- dev cheats ---

  cheat(kind: 'money' | 'day' | 'month' | 'rain' | 'drought' | 'ripen' | 'priceUp' | 'priceDown' | 'event'): void {
    const s = this.state;
    switch (kind) {
      case 'money':
        addTransaction(this, 'other', { key: 'ledger.cheat' }, 50_000);
        break;
      case 'day':
        this.advanceDay();
        break;
      case 'month':
        this.advanceDays(30);
        break;
      case 'rain':
        s.weather.today = 'heavyRain';
        for (const t of s.map.tiles) if (t.terrain === 'grass') t.moisture = clamp(t.moisture + 30, 0, 100);
        this.emit('day', s.day);
        break;
      case 'drought':
        s.weather.today = 'drought';
        for (const t of s.map.tiles) if (t.terrain === 'grass') t.moisture = clamp(t.moisture - 30, 0, 100);
        this.emit('day', s.day);
        break;
      case 'ripen': {
        const changed: number[] = [];
        s.map.tiles.forEach((t, i) => {
          if (t.crop && t.crop.readyDay === null) {
            t.crop.progress = CROPS[t.crop.cropId].growthDays;
            if (t.crop.conditionDays === 0) {
              t.crop.conditionSum = 1;
              t.crop.conditionDays = 1;
            }
            t.crop.readyDay = s.day;
            changed.push(i);
          }
        });
        this.emit('tilesChanged', changed);
        break;
      }
      case 'priceUp':
      case 'priceDown':
        for (const id of CROP_IDS) {
          const m = s.market.commodities[id];
          m.price = round(m.price * (kind === 'priceUp' ? 1.2 : 0.8), 2);
        }
        this.emit('day', s.day);
        break;
      case 'event':
        triggerEvent(this, this.rng.pick(EVENTS));
        break;
    }
  }
}
