/**
 * Central balance data. All costs, prices, yields, growth times, salaries,
 * interest, machines, buildings and events are tuned here.
 *
 * Units: money in $, area in tiles (1 tile = 1 ha), mass in tonnes (t),
 * fuel in litres (L), time in game days (1 month = 30 days, 1 year = 360 days).
 */
import type {
  BuildingType,
  CropId,
  Difficulty,
  FieldOperation,
  MachineType,
  RegionId,
  Season,
  WeatherType,
} from '../simulation/types';

export interface CropDef {
  id: CropId;
  /** Seed cost per tile. */
  seedCost: number;
  growthDays: number;
  /** Extra moisture consumed per day (soil points). */
  waterRequirement: number;
  /** Fertility consumed at harvest (points); also the fertility it prefers. */
  fertilityRequirement: number;
  /** Tonnes per tile under good conditions. */
  baseYield: number;
  /** $/t */
  baseMarketPrice: number;
  /** Daily price volatility (std dev as fraction). */
  volatility: number;
  plantingSeason: Season[];
  harvestSeason: Season[];
  /** Growth speed multiplier per season. */
  seasonGrowth: Record<Season, number>;
  /** Month (1-12) with the highest seasonal price. */
  pricePeakMonth: number;
  /** Market depth in tonnes: big sales relative to this push prices down. */
  marketDepth: number;
  /** Harvest labour multiplier (potatoes are heavier work). */
  harvestEffort: number;
  /** Minimum level to unlock. */
  unlockLevel: number;
  /** Damage per day from cold/frost (health points). */
  frostSensitivity: number;
  color: number;
}

export const CROPS: Record<CropId, CropDef> = {
  corn: {
    id: 'corn',
    seedCost: 190,
    growthDays: 32,
    waterRequirement: 1.6,
    fertilityRequirement: 6,
    baseYield: 7.5,
    baseMarketPrice: 80,
    volatility: 0.012,
    plantingSeason: ['spring', 'summer'],
    harvestSeason: ['summer', 'autumn'],
    seasonGrowth: { spring: 1.05, summer: 1.1, autumn: 0.8, winter: 0.45 },
    pricePeakMonth: 10,
    marketDepth: 6000,
    harvestEffort: 1,
    unlockLevel: 1,
    frostSensitivity: 3,
    color: 0xe8c33a,
  },
  soy: {
    id: 'soy',
    seedCost: 165,
    growthDays: 28,
    waterRequirement: 1.2,
    fertilityRequirement: 3,
    baseYield: 3.0,
    baseMarketPrice: 185,
    volatility: 0.015,
    plantingSeason: ['spring', 'summer'],
    harvestSeason: ['summer', 'autumn'],
    seasonGrowth: { spring: 1.05, summer: 1.05, autumn: 0.8, winter: 0.4 },
    pricePeakMonth: 11,
    marketDepth: 4500,
    harvestEffort: 1,
    unlockLevel: 1,
    frostSensitivity: 3,
    color: 0x7fae3c,
  },
  wheat: {
    id: 'wheat',
    seedCost: 115,
    growthDays: 26,
    waterRequirement: 0.7,
    fertilityRequirement: 4,
    baseYield: 3.2,
    baseMarketPrice: 132,
    volatility: 0.012,
    plantingSeason: ['autumn', 'winter'],
    harvestSeason: ['winter', 'spring'],
    seasonGrowth: { spring: 0.9, summer: 0.6, autumn: 1.05, winter: 1.0 },
    pricePeakMonth: 5,
    marketDepth: 5000,
    harvestEffort: 1,
    unlockLevel: 1,
    frostSensitivity: 0,
    color: 0xd9b26a,
  },
  potato: {
    id: 'potato',
    seedCost: 520,
    growthDays: 24,
    waterRequirement: 2.0,
    fertilityRequirement: 8,
    baseYield: 25,
    baseMarketPrice: 38,
    volatility: 0.025,
    plantingSeason: ['spring', 'autumn', 'winter'],
    harvestSeason: ['summer', 'winter', 'spring'],
    seasonGrowth: { spring: 1.05, summer: 0.75, autumn: 1.0, winter: 0.9 },
    pricePeakMonth: 2,
    marketDepth: 9000,
    harvestEffort: 1.6,
    unlockLevel: 2,
    frostSensitivity: 1,
    color: 0xb07a4a,
  },
  sunflower: {
    id: 'sunflower',
    seedCost: 150,
    growthDays: 22,
    waterRequirement: 0.6,
    fertilityRequirement: 4,
    baseYield: 2.2,
    baseMarketPrice: 255,
    volatility: 0.018,
    plantingSeason: ['spring', 'summer'],
    harvestSeason: ['summer', 'autumn'],
    seasonGrowth: { spring: 1.05, summer: 1.1, autumn: 0.75, winter: 0.4 },
    pricePeakMonth: 7,
    marketDepth: 3500,
    harvestEffort: 1,
    unlockLevel: 3,
    frostSensitivity: 2,
    color: 0xf2c522,
  },
};

export const CROP_IDS: CropId[] = ['corn', 'soy', 'wheat', 'potato', 'sunflower'];

export interface DifficultyDef {
  startMoney: number;
  costMult: number;
  interestRate: number;
  volatilityMult: number;
  /** Days with negative cash tolerated before bankruptcy. */
  bankruptcyToleranceDays: number;
  yieldMult: number;
  loanLimitMult: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    startMoney: 70_000,
    costMult: 0.85,
    interestRate: 0.08,
    volatilityMult: 0.7,
    bankruptcyToleranceDays: 120,
    yieldMult: 1.1,
    loanLimitMult: 1.3,
  },
  normal: {
    startMoney: 45_000,
    costMult: 1,
    interestRate: 0.12,
    volatilityMult: 1,
    bankruptcyToleranceDays: 75,
    yieldMult: 1,
    loanLimitMult: 1,
  },
  hard: {
    startMoney: 28_000,
    costMult: 1.2,
    interestRate: 0.18,
    volatilityMult: 1.4,
    bankruptcyToleranceDays: 45,
    yieldMult: 0.92,
    loanLimitMult: 0.75,
  },
};

/** Field operations: manual vs machine-assisted. Costs per tile. */
export interface OperationDef {
  op: FieldOperation;
  manualCost: number;
  machine: MachineType | null;
  machineCost: number;
  fuelPerTile: number;
  /** Tiles per day without machines. */
  baseCapacity: number;
  /** Extra tiles per day with a working machine (scaled by condition). */
  machineCapacity: number;
  /** Extra tiles per day per field worker (scaled by efficiency). */
  workerCapacity: number;
  /** Condition lost per tile worked. */
  wearPerTile: number;
}

export const OPERATIONS: Record<FieldOperation, OperationDef> = {
  prepare: {
    op: 'prepare',
    manualCost: 22,
    machine: 'tractor',
    machineCost: 6,
    fuelPerTile: 3.5,
    baseCapacity: 16,
    machineCapacity: 48,
    workerCapacity: 10,
    wearPerTile: 0.07,
  },
  plant: {
    op: 'plant',
    manualCost: 12,
    machine: 'planter',
    machineCost: 3,
    fuelPerTile: 1.5,
    baseCapacity: 16,
    machineCapacity: 48,
    workerCapacity: 10,
    wearPerTile: 0.06,
  },
  harvest: {
    op: 'harvest',
    manualCost: 45,
    machine: 'harvester',
    machineCost: 10,
    fuelPerTile: 5,
    baseCapacity: 14,
    machineCapacity: 50,
    workerCapacity: 10,
    wearPerTile: 0.08,
  },
  irrigate: {
    op: 'irrigate',
    manualCost: 15,
    machine: null,
    machineCost: 0,
    fuelPerTile: 0,
    baseCapacity: 24,
    machineCapacity: 0,
    workerCapacity: 12,
    wearPerTile: 0,
  },
};

/** Clearing forest is a "prepare" on a forest tile at this multiplier. */
export const FOREST_CLEAR_MULT = 4;

export const IRRIGATION = {
  /** Moisture added by one irrigation. */
  moistureGain: 35,
  /** Cost per tile inside an irrigation station radius. */
  stationCost: 4,
  stationRadius: 7,
  /** Station auto-irrigates tiles below this moisture. */
  stationThreshold: 32,
};

export interface MachineDef {
  type: MachineType;
  purchasePrice: number;
  /** Cost to restore 100 condition points. */
  maintenanceCost: number;
  /** Litres per tile (operation fuel) — informative; real use defined per operation. */
  fuelConsumption: number;
  /** Relative work speed (capacity multiplier). */
  workSpeed: number;
  tankSize: number;
  unlockLevel: number;
}

export const MACHINES: Record<MachineType, MachineDef> = {
  tractor: {
    type: 'tractor',
    purchasePrice: 16_000,
    maintenanceCost: 2_400,
    fuelConsumption: 3.5,
    workSpeed: 1,
    tankSize: 300,
    unlockLevel: 1,
  },
  planter: {
    type: 'planter',
    purchasePrice: 12_000,
    maintenanceCost: 1_800,
    fuelConsumption: 1.5,
    workSpeed: 1,
    tankSize: 150,
    unlockLevel: 1,
  },
  harvester: {
    type: 'harvester',
    purchasePrice: 38_000,
    maintenanceCost: 5_000,
    fuelConsumption: 5,
    workSpeed: 1,
    tankSize: 500,
    unlockLevel: 2,
  },
  sprayer: {
    type: 'sprayer',
    purchasePrice: 14_000,
    maintenanceCost: 1_600,
    fuelConsumption: 0.05,
    workSpeed: 1,
    tankSize: 200,
    unlockLevel: 3,
  },
};

export const MACHINE_TYPES: MachineType[] = ['tractor', 'planter', 'harvester', 'sprayer'];

export const MACHINE_RULES = {
  /** Condition lost per day when not under a roof. */
  outdoorWearPerDay: 0.08,
  /** Below this condition, each working day may cause a breakdown. */
  breakdownThreshold: 40,
  /** Breakdown chance per working day at condition 0. */
  breakdownChanceAtZero: 0.25,
  brokenRepairSurcharge: 0.25,
  /** Machines that fit under the farmhouse roof. */
  farmhouseSlots: 1,
  /** Fraction of purchase price received when selling at 100% condition. */
  resaleFactor: 0.6,
  /** Monthly fixed upkeep (insurance/licensing) as fraction of maintenanceCost. */
  monthlyUpkeepFactor: 0.03,
};

export interface BuildingDef {
  type: BuildingType;
  price: number;
  /** Monthly upkeep. */
  upkeep: number;
  size: number;
  unlockLevel: number;
  buildable: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  farmhouse: { type: 'farmhouse', price: 0, upkeep: 150, size: 2, unlockLevel: 1, buildable: false },
  silo: { type: 'silo', price: 11_000, upkeep: 120, size: 2, unlockLevel: 1, buildable: true },
  shed: { type: 'shed', price: 8_000, upkeep: 80, size: 2, unlockLevel: 1, buildable: true },
  workshop: { type: 'workshop', price: 14_000, upkeep: 150, size: 2, unlockLevel: 2, buildable: true },
  office: { type: 'office', price: 18_000, upkeep: 250, size: 2, unlockLevel: 3, buildable: true },
  irrigation: { type: 'irrigation', price: 9_500, upkeep: 160, size: 2, unlockLevel: 2, buildable: true },
};

export const BUILDING_TYPES: BuildingType[] = ['silo', 'shed', 'workshop', 'office', 'irrigation'];

export const STORAGE = {
  farmhouse: 60,
  silo: 450,
  /** Sale price multiplier for harvest that does not fit in storage. */
  overflowSaleFactor: 0.8,
};

export const BUILDING_EFFECTS = {
  shedMachineSlots: 4,
  workshopMaintenanceDiscount: 0.35,
  workshopRepairPerDay: 0.4,
  officeWorkerSlots: 4,
  officeLoanLimitBonus: 0.25,
  officeInterestDiscount: 0.02,
  baseWorkerSlots: 2,
};

export const LAND = {
  /** Base price per farmable tile. */
  pricePerTile: 420,
  waterTileFactor: 0.15,
  forestTileFactor: 0.6,
  /** Each owned parcel increases the price of the next one. */
  expansionPremium: 0.05,
};

export const SOIL = {
  /** Fertility recovered per day when a tile is fallow (not planted). */
  fallowRecovery: 0.04,
  maxFertility: 100,
  /** Soil health lost when the same crop is planted twice in a row. */
  monocropPenalty: 6,
  soilHealthRecovery: 0.03,
  /** Moisture thresholds. */
  dryThreshold: 30,
  criticalThreshold: 12,
  waterlogThreshold: 95,
};

export const WEATHER: Record<
  WeatherType,
  { moisture: number; growth: number; damage: number; weights: Record<Season, number> }
> = {
  sunny: {
    moisture: -3.5,
    growth: 1.05,
    damage: 0,
    weights: { spring: 30, summer: 30, autumn: 30, winter: 30 },
  },
  cloudy: {
    moisture: -1.5,
    growth: 1.0,
    damage: 0,
    weights: { spring: 25, summer: 18, autumn: 28, winter: 28 },
  },
  rain: {
    moisture: 18,
    growth: 1.02,
    damage: 0,
    weights: { spring: 22, summer: 24, autumn: 18, winter: 12 },
  },
  heavyRain: {
    moisture: 32,
    growth: 0.95,
    damage: 0.5,
    weights: { spring: 6, summer: 9, autumn: 5, winter: 3 },
  },
  heat: { moisture: -7, growth: 0.92, damage: 0.3, weights: { spring: 6, summer: 14, autumn: 4, winter: 0 } },
  drought: {
    moisture: -9,
    growth: 0.85,
    damage: 0.6,
    weights: { spring: 3, summer: 4, autumn: 4, winter: 2 },
  },
  cold: { moisture: -1, growth: 0.8, damage: 0, weights: { spring: 4, summer: 0, autumn: 8, winter: 25 } },
  storm: { moisture: 26, growth: 0.9, damage: 2.5, weights: { spring: 4, summer: 5, autumn: 3, winter: 1 } },
};

export const WEATHER_TYPES: WeatherType[] = [
  'sunny',
  'cloudy',
  'rain',
  'heavyRain',
  'heat',
  'drought',
  'cold',
  'storm',
];

export const FORECAST_DAYS = 7;
/** Probability that a forecast for k days ahead is wrong = k * this. */
export const FORECAST_ERROR_PER_DAY = 0.06;

export const MARKET = {
  /** Mean reversion speed toward the target price. */
  reversion: 0.08,
  minFactor: 0.45,
  maxFactor: 2.2,
  seasonalAmplitude: 0.08,
  /** Daily recovery of supply pressure toward 1. */
  supplyRecovery: 0.04,
  /** Max instant discount for very large sales. */
  maxSaleImpact: 0.12,
  fuelBase: 1.4,
  fuelVolatility: 0.01,
};

export const WORKERS = {
  minSalary: 1_600,
  salaryPerSkill: 450,
  candidates: 4,
  /** Labor cost reduction per field worker (capped). */
  fieldLaborDiscount: 0.1,
  maxFieldLaborDiscount: 0.4,
  irrigationTilesPerDay: 10,
  irrigationWaterCost: 5,
  maintenancePerDay: 0.5,
  severanceMonths: 1,
};

export const WORKER_NAMES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elaine',
  'Fábio',
  'Gisele',
  'Hugo',
  'Iara',
  'João',
  'Karina',
  'Luís',
  'Marta',
  'Nilo',
  'Olívia',
  'Paulo',
  'Rita',
  'Sérgio',
  'Tânia',
  'Vítor',
];

export const LOANS = {
  /** Base credit line for every farm. */
  baseLimit: 30_000,
  /** Fraction of net assets (land + buildings + machines) usable as collateral. */
  assetFactor: 0.5,
  /** Extra limit per player level. */
  perLevel: 5_000,
  terms: [12, 24, 36] as const,
  minAmount: 1_000,
  /** Grace period days before an unpaid installment counts as missed. */
  graceDays: 0,
};

export const FINANCE = {
  /** Negative-cash days before status becomes "default". */
  defaultAfterDays: 15,
};

export const PROGRESSION = {
  levels: [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000],
  xpHarvestPerTile: 2,
  xpPer1000Sold: 3,
  xpLandParcel: 60,
  xpBuilding: 30,
  xpMachine: 25,
};

export interface EventEffects {
  priceMult?: Partial<Record<CropId, number>>;
  allPricesMult?: number;
  fuelMult?: number;
  seedMult?: number;
  weatherBias?: WeatherType;
  /** Crop health damage per day (sprayer reduces it). */
  cropDamagePerDay?: number;
  /** One-time cash per owned tile. */
  cashPerOwnedTile?: number;
  breakMachine?: boolean;
}

export interface EventDef {
  id: string;
  /** Probability per day (when no cooldown). */
  probability: number;
  duration: number;
  positive: boolean;
  category: 'market' | 'weather' | 'economy';
  seasons?: Season[];
  effects: EventEffects;
}

export const EVENTS: EventDef[] = [
  {
    id: 'soyRally',
    probability: 0.006,
    duration: 20,
    positive: true,
    category: 'market',
    effects: { priceMult: { soy: 1.25 } },
  },
  {
    id: 'cornDrop',
    probability: 0.006,
    duration: 18,
    positive: false,
    category: 'market',
    effects: { priceMult: { corn: 0.8 } },
  },
  {
    id: 'drought',
    probability: 0.005,
    duration: 10,
    positive: false,
    category: 'weather',
    seasons: ['spring', 'summer', 'autumn'],
    effects: { weatherBias: 'drought' },
  },
  {
    id: 'heavyRains',
    probability: 0.005,
    duration: 6,
    positive: false,
    category: 'weather',
    seasons: ['spring', 'summer', 'autumn'],
    effects: { weatherBias: 'heavyRain' },
  },
  {
    id: 'fuelSpike',
    probability: 0.005,
    duration: 15,
    positive: false,
    category: 'economy',
    effects: { fuelMult: 1.45 },
  },
  {
    id: 'seedSpike',
    probability: 0.004,
    duration: 15,
    positive: false,
    category: 'economy',
    effects: { seedMult: 1.3 },
  },
  {
    id: 'pest',
    probability: 0.005,
    duration: 8,
    positive: false,
    category: 'weather',
    seasons: ['spring', 'summer', 'autumn'],
    effects: { cropDamagePerDay: 1.8 },
  },
  {
    id: 'subsidy',
    probability: 0.003,
    duration: 1,
    positive: true,
    category: 'economy',
    effects: { cashPerOwnedTile: 35 },
  },
  {
    id: 'machineBreak',
    probability: 0.003,
    duration: 1,
    positive: false,
    category: 'economy',
    effects: { breakMachine: true },
  },
  {
    id: 'demandBoom',
    probability: 0.004,
    duration: 15,
    positive: true,
    category: 'market',
    effects: { allPricesMult: 1.12 },
  },
  {
    id: 'wheatExport',
    probability: 0.004,
    duration: 15,
    positive: true,
    category: 'market',
    effects: { priceMult: { wheat: 1.2 } },
  },
  {
    id: 'potatoGlut',
    probability: 0.004,
    duration: 15,
    positive: false,
    category: 'market',
    effects: { priceMult: { potato: 0.8 } },
  },
];

export const EVENT_RULES = {
  cooldownDays: 8,
  maxActive: 2,
  /** No events in the first days so new players can learn. */
  graceDays: 20,
  sprayerDamageFactor: 0.2,
};

export interface TechDef {
  id: string;
  cost: number;
  level: number;
  requires: string[];
  effects: {
    yieldMult?: number;
    irrigationCostMult?: number;
    waterUseMult?: number;
    maintenanceMult?: number;
    wearMult?: number;
    salePriceMult?: number;
    storageMult?: number;
    capacityMult?: number;
  };
}

export const TECHNOLOGIES: TechDef[] = [
  { id: 'improvedSeeds', cost: 9_000, level: 2, requires: [], effects: { yieldMult: 1.08 } },
  {
    id: 'precisionAg',
    cost: 22_000,
    level: 4,
    requires: ['improvedSeeds'],
    effects: { yieldMult: 1.05, capacityMult: 1.15 },
  },
  {
    id: 'efficientIrrigation',
    cost: 10_000,
    level: 2,
    requires: [],
    effects: { irrigationCostMult: 0.75, waterUseMult: 0.85 },
  },
  {
    id: 'preventiveMaintenance',
    cost: 8_000,
    level: 2,
    requires: [],
    effects: { maintenanceMult: 0.8, wearMult: 0.75 },
  },
  { id: 'logistics', cost: 15_000, level: 3, requires: [], effects: { salePriceMult: 1.05 } },
  { id: 'advancedStorage', cost: 12_000, level: 3, requires: ['logistics'], effects: { storageMult: 1.25 } },
];

export interface ObjectiveDef {
  id: string;
  xp: number;
  reward: number;
}

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'plantFirst', xp: 50, reward: 0 },
  { id: 'harvestFirst', xp: 80, reward: 0 },
  { id: 'sell10k', xp: 100, reward: 1_000 },
  { id: 'buildSilo', xp: 100, reward: 0 },
  { id: 'buyMachine', xp: 100, reward: 0 },
  { id: 'buyLand', xp: 150, reward: 0 },
  { id: 'hireWorker', xp: 80, reward: 0 },
  { id: 'research', xp: 120, reward: 0 },
  { id: 'netWorth250k', xp: 300, reward: 5_000 },
];

export const ACHIEVEMENTS = [
  'firstHarvest',
  'first10k',
  'tons100',
  'tons1000',
  'debtFree',
  'bigFarm',
  'mechanized',
  'researcher',
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

export interface RegionDef {
  id: RegionId;
  landPriceMult: number;
  yieldMult: Partial<Record<CropId, number>>;
  costMult: number;
  /** Extra weather weights added to the seasonal table. */
  weatherBias: Partial<Record<WeatherType, number>>;
  startMonthOffset: number;
}

/** Brazil mode: regions only modify climate/prices for now (architecture for future maps). */
export const REGIONS: Record<RegionId, RegionDef> = {
  parana: {
    id: 'parana',
    landPriceMult: 1,
    yieldMult: {},
    costMult: 1,
    weatherBias: {},
    startMonthOffset: 0,
  },
  rs: {
    id: 'rs',
    landPriceMult: 0.9,
    yieldMult: { wheat: 1.12, soy: 0.97 },
    costMult: 1,
    weatherBias: { cold: 6, rain: 3 },
    startMonthOffset: 0,
  },
  mt: {
    id: 'mt',
    landPriceMult: 0.75,
    yieldMult: { soy: 1.1, corn: 1.05, wheat: 0.8 },
    costMult: 1.08,
    weatherBias: { heat: 6, drought: 2, cold: -10 },
    startMonthOffset: 0,
  },
  go: {
    id: 'go',
    landPriceMult: 0.85,
    yieldMult: { corn: 1.08, sunflower: 1.05 },
    costMult: 1.03,
    weatherBias: { heat: 4, sunny: 5 },
    startMonthOffset: 0,
  },
};

export const REGION_IDS: RegionId[] = ['parana', 'rs', 'mt', 'go'];

export const START = {
  /** Calendar starts on 1 October (spring, southern hemisphere). */
  dayOffset: 270,
  /** Starting parcel coordinates (in parcels). */
  parcel: { px: 3, py: 3 },
  initialFertility: { min: 45, max: 90 },
  initialMoisture: 55,
};
