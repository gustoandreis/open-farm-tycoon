/**
 * Serializable game state. Everything in GameState must be plain JSON data so
 * it can be saved/loaded without loss. Simulation logic lives in the system
 * modules and never in this file.
 */

export type CropId = 'corn' | 'soy' | 'wheat' | 'potato' | 'sunflower';
export type MachineType = 'tractor' | 'planter' | 'harvester' | 'sprayer';
export type BuildingType = 'farmhouse' | 'silo' | 'shed' | 'workshop' | 'office' | 'irrigation';
export type Terrain = 'grass' | 'water' | 'road' | 'forest';
export type FieldState = 'natural' | 'prepared' | 'planted';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherType = 'sunny' | 'cloudy' | 'rain' | 'heavyRain' | 'heat' | 'drought' | 'cold' | 'storm';
export type RegionId = 'parana' | 'rs' | 'mt' | 'go';
export type WorkerAssignment = 'field' | 'irrigation' | 'maintenance' | 'idle';
export type FieldOperation = 'prepare' | 'plant' | 'harvest' | 'irrigate';
export type CropStage = 'seed' | 'sprout' | 'early' | 'mid' | 'mature' | 'ready';

export type LedgerCategory =
  | 'sales'
  | 'event'
  | 'seeds'
  | 'fieldwork'
  | 'fuel'
  | 'salaries'
  | 'maintenance'
  | 'machines'
  | 'buildings'
  | 'land'
  | 'irrigation'
  | 'interest'
  | 'loanIn'
  | 'loanOut'
  | 'technology'
  | 'other';

export interface CropInstance {
  cropId: CropId;
  plantedDay: number;
  /** Accumulated effective growth days. Mature when >= growthDays. */
  progress: number;
  /** 0..100 */
  health: number;
  /** Sum of daily growing-condition factors (for yield). */
  conditionSum: number;
  conditionDays: number;
  /** Day it became ready to harvest, null while growing. */
  readyDay: number | null;
}

export interface Tile {
  terrain: Terrain;
  field: FieldState;
  /** 0..100 */
  fertility: number;
  /** 0..100 */
  moisture: number;
  /** 0..100 soil health (monoculture / waterlogging). */
  soilHealth: number;
  crop: CropInstance | null;
  /** Building id occupying the tile, or null. */
  building: number | null;
  lastCrop: CropId | null;
}

export interface Parcel {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  owned: boolean;
  purchasePrice: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  builtDay: number;
}

export interface Machine {
  id: number;
  type: MachineType;
  /** 0..100 */
  condition: number;
  /** Litres in tank. */
  fuel: number;
  broken: boolean;
  purchasedDay: number;
  purchasePrice: number;
  /** Tiles worked (statistic). */
  workDone: number;
}

export interface Worker {
  id: number;
  name: string;
  /** Monthly salary. */
  salary: number;
  /** 1..5 */
  skill: number;
  /** 0.5..1.5 */
  efficiency: number;
  assignment: WorkerAssignment;
  hiredDay: number;
}

export interface Loan {
  id: number;
  principal: number;
  /** Annual interest rate, e.g. 0.12 */
  interestRate: number;
  termMonths: number;
  payment: number;
  remainingBalance: number;
  remainingMonths: number;
  nextPaymentDay: number;
  takenDay: number;
  missedPayments: number;
}

export interface LedgerEntry {
  day: number;
  category: LedgerCategory;
  description: string;
  amount: number;
}

export interface CommodityMarket {
  price: number;
  /** Most recent last. */
  history: number[];
  /** Supply pressure from player sales; 1 = neutral, < 1 depressed. */
  supplyFactor: number;
}

export interface WeatherDay {
  actual: WeatherType;
  shown: WeatherType;
}

export interface ActiveEvent {
  id: string;
  startDay: number;
  endDay: number;
}

export interface Notification {
  id: number;
  day: number;
  category: NotificationCategory;
  text: string;
}

export type NotificationCategory =
  'info' | 'success' | 'warning' | 'error' | 'weather' | 'market' | 'economy';

export interface Stats {
  daysPlayed: number;
  tilesPlanted: number;
  tilesHarvested: number;
  production: Record<CropId, number>;
  totalProduction: number;
  salesCount: number;
  salesRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  biggestSale: number;
  machinesBought: number;
  buildingsBuilt: number;
  landBought: number;
  maxDebt: number;
  loansTaken: number;
  loansRepaid: number;
}

export interface YearSummary {
  year: number;
  revenue: number;
  expenses: number;
  profit: number;
  production: number;
  area: number;
  bestCommodity: CropId | null;
  revenueByCrop: Record<CropId, number>;
}

export interface FinanceStatus {
  negativeDays: number;
  status: 'ok' | 'alert' | 'default' | 'recovery' | 'bankrupt';
}

export interface TutorialState {
  active: boolean;
  step: number;
  completed: boolean;
  skipped: boolean;
}

export interface GameState {
  saveVersion: number;
  farmName: string;
  difficulty: Difficulty;
  region: RegionId;
  seed: string;
  rngState: number;
  /** Absolute game day since the start (0-based). */
  day: number;
  tick: number;
  money: number;
  map: { width: number; height: number; tiles: Tile[] };
  parcels: Parcel[];
  buildings: Building[];
  machines: Machine[];
  workers: Worker[];
  candidates: Worker[];
  nextId: number;
  inventory: Record<CropId, number>;
  market: {
    commodities: Record<CropId, CommodityMarket>;
    fuelPrice: number;
    fuelHistory: number[];
  };
  weather: { today: WeatherType; forecast: WeatherDay[] };
  loans: Loan[];
  ledger: LedgerEntry[];
  /** Monthly totals per category; key = "Y-M". */
  monthly: Record<string, Partial<Record<LedgerCategory, number>>>;
  events: { active: ActiveEvent[]; lastEventDay: number; history: { id: string; day: number }[] };
  technologies: string[];
  progression: { xp: number; level: number };
  objectives: string[];
  achievements: string[];
  stats: Stats;
  finance: FinanceStatus;
  tutorial: TutorialState;
  /** Capacity already used today per operation. */
  workUsed: Record<FieldOperation, number>;
  year: {
    current: number;
    startRevenue: number;
    startExpenses: number;
    startProduction: number;
    revenueByCrop: Record<CropId, number>;
  };
  lastYearSummary: YearSummary | null;
  notifications: Notification[];
}
