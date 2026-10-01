import { audio } from '../../audio/AudioManager';
import {
  BUILDING_EFFECTS,
  BUILDING_TYPES,
  BUILDINGS,
  IRRIGATION,
  MACHINE_TYPES,
  MACHINES,
  STORAGE,
} from '../../data/balance';
import { formatMoney, formatPercent, t } from '../../i18n';
import {
  buildingCost,
  countBuildings,
  machineSlots,
  storageCapacity,
  storageUsed,
  workerSlots,
} from '../../simulation/buildings/buildings';
import {
  canBuyMachine,
  machinePrice,
  refuelCost,
  refuelMachine,
  repairCost,
  resaleValue,
} from '../../simulation/machinery/machines';
import { monthlyPayroll } from '../../simulation/workers/workers';
import type { BuildingType, WorkerAssignment } from '../../simulation/types';
import { artUrl } from '../../game/rendering/art';
import { bar, h } from '../dom';
import type { PanelContext } from './types';

export function buildingDescription(type: BuildingType): string {
  switch (type) {
    case 'farmhouse':
      return t('building.farmhouse.desc', { storage: STORAGE.farmhouse });
    case 'silo':
      return t('building.silo.desc', { storage: STORAGE.silo });
    case 'shed':
      return t('building.shed.desc', { slots: BUILDING_EFFECTS.shedMachineSlots });
    case 'workshop':
      return t('building.workshop.desc', {
        pct: formatPercent(BUILDING_EFFECTS.workshopMaintenanceDiscount),
      });
    case 'office':
      return t('building.office.desc', {
        workers: BUILDING_EFFECTS.officeWorkerSlots,
        loan: formatPercent(BUILDING_EFFECTS.officeLoanLimitBonus),
      });
    case 'irrigation':
      return t('building.irrigation.desc', {
        radius: IRRIGATION.stationRadius,
        cost: IRRIGATION.stationCost,
      });
  }
}

export function renderMachines(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const level = s.progression.level;
  const shop = MACHINE_TYPES.map((type) => {
    const def = MACHINES[type];
    const price = machinePrice(s, type);
    const locked = level < def.unlockLevel;
    const check = canBuyMachine(s, type);
    const owned = s.machines.filter((m) => m.type === type).length;
    return h(
      'div',
      { class: `card ${locked ? 'locked' : ''}` },
      h(
        'div',
        { class: 'row' },
        h('img', { src: artUrl('machine', type), width: '56', height: '39', alt: '' }),
        h(
          'div',
          { style: 'flex:1' },
          h(
            'div',
            { class: 'card-title' },
            t(`machine.${type}`),
            owned ? h('span', { class: 'muted small-text' }, t('common.owned', { count: owned })) : null,
          ),
          h('div', { class: 'small-text' }, t(`machine.${type}.desc`)),
          h(
            'div',
            { class: 'muted small-text' },
            t('machines.specs', { maint: def.maintenanceCost, fuel: def.fuelConsumption }),
          ),
        ),
        h(
          'div',
          { class: 'right' },
          h('div', { style: 'font-weight:bold' }, formatMoney(price)),
          locked
            ? h('div', { class: 'muted small-text' }, t('common.requiresLevel', { level: def.unlockLevel }))
            : h(
                'button',
                {
                  class: 'small primary',
                  disabled: !check.ok,
                  'data-testid': `buy-machine-${type}`,
                  onclick: async () => {
                    const ok = await ctx.confirm(
                      t('machines.shop'),
                      t('machines.buyConfirm', { machine: `@machine.${type}`, amount: price }),
                    );
                    if (!ok) return;
                    const r = ctx.game.buyMachine(type);
                    if (r.ok) audio.play('coin');
                    else ctx.toast('error', t(r.reason));
                    ctx.refresh();
                  },
                },
                t('common.buy'),
              ),
        ),
      ),
    );
  });

  const garage = s.machines.map((m) => {
    const cost = repairCost(s, m);
    const fuelPct = m.fuel / MACHINES[m.type].tankSize;
    return h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'row' },
        h('img', { src: artUrl('machine', m.type), width: '48', height: '34', alt: '' }),
        h(
          'div',
          { style: 'flex:1;min-width:10rem' },
          h(
            'div',
            { class: 'card-title' },
            t(`machine.${m.type}`),
            h(
              'span',
              { class: m.broken ? 'bad small-text' : 'good small-text' },
              m.broken ? t('machines.broken') : t('machines.ok'),
            ),
          ),
          h(
            'div',
            { class: 'row small-text' },
            h('span', { style: 'width:6rem' }, `${t('machines.condition')} ${Math.round(m.condition)}%`),
            h('div', { style: 'flex:1' }, bar(m.condition / 100)),
          ),
          h(
            'div',
            { class: 'row small-text' },
            h('span', { style: 'width:6rem' }, `${t('machines.fuel')} ${Math.round(fuelPct * 100)}%`),
            h('div', { style: 'flex:1' }, bar(fuelPct)),
          ),
          h('div', { class: 'muted small-text' }, t('machines.maintenance', { amount: cost })),
        ),
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:6px;justify-content:flex-end' },
        h(
          'button',
          {
            class: 'small',
            disabled: refuelCost(s, m) <= 0,
            onclick: () => {
              refuelMachine(ctx.game, m);
              ctx.game.emit('machinesChanged', undefined);
              ctx.refresh();
            },
          },
          `${t('common.refuel')} (${formatMoney(refuelCost(s, m))})`,
        ),
        h(
          'button',
          {
            class: `small ${m.broken ? 'primary' : ''}`,
            disabled: cost <= 0 && !m.broken,
            'data-testid': 'repair-machine',
            onclick: () => {
              const r = ctx.game.maintainMachine(m.id);
              if (!r.ok) ctx.toast('error', t(r.reason));
              else audio.play('build');
              ctx.refresh();
            },
          },
          `${t('common.repair')} (${formatMoney(cost)})`,
        ),
        h(
          'button',
          {
            class: 'small danger',
            onclick: async () => {
              const v = resaleValue(m);
              if (
                !(await ctx.confirm(
                  t('common.sell'),
                  t('machines.sellConfirm', { machine: `@machine.${m.type}`, amount: v }),
                  true,
                ))
              )
                return;
              ctx.game.sellMachine(m.id);
              ctx.refresh();
            },
          },
          t('machines.sellFor', { amount: resaleValue(m) }),
        ),
      ),
    );
  });

  return h(
    'div',
    null,
    h('h3', null, t('machines.garage')),
    h(
      'div',
      { class: 'muted small-text', style: 'margin-bottom:6px' },
      t('machines.roof', { used: Math.min(s.machines.length, machineSlots(s)), slots: machineSlots(s) }),
      ' · ',
      t('machines.fuelPrice', { price: formatMoney(s.market.fuelPrice, 2) }),
    ),
    garage.length ? garage : h('div', { class: 'card muted' }, t('machines.empty')),
    h('h3', null, t('machines.shop')),
    shop,
  );
}

export function renderBuildings(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const level = s.progression.level;
  const cards = (['farmhouse', ...BUILDING_TYPES] as BuildingType[]).map((type) => {
    const def = BUILDINGS[type];
    const locked = level < def.unlockLevel;
    const cost = buildingCost(s, type);
    return h(
      'div',
      { class: `card ${locked ? 'locked' : ''}` },
      h(
        'div',
        { class: 'row' },
        h('img', { src: artUrl('building', type), width: '48', height: '48', alt: '' }),
        h(
          'div',
          { style: 'flex:1' },
          h(
            'div',
            { class: 'card-title' },
            t(`building.${type}`),
            h(
              'span',
              { class: 'muted small-text' },
              t('buildings.owned', { count: countBuildings(s, type) }),
            ),
          ),
          h('div', { class: 'small-text' }, buildingDescription(type)),
          h('div', { class: 'muted small-text' }, t('buildings.upkeep', { amount: def.upkeep })),
        ),
        def.buildable
          ? h(
              'div',
              { class: 'right' },
              h('div', { style: 'font-weight:bold' }, formatMoney(cost)),
              locked
                ? h(
                    'div',
                    { class: 'muted small-text' },
                    t('common.requiresLevel', { level: def.unlockLevel }),
                  )
                : h(
                    'button',
                    {
                      class: 'small primary',
                      disabled: s.money < cost,
                      'data-testid': `place-${type}`,
                      onclick: () => {
                        ctx.session.setBuilding(type);
                        ctx.session.setTool('build');
                        ctx.closePanel();
                      },
                    },
                    t('buildings.place'),
                  ),
            )
          : null,
      ),
    );
  });
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'card' },
      t('buildings.storage', { used: storageUsed(s), cap: storageCapacity(s) }),
      bar(1 - storageUsed(s) / Math.max(1, storageCapacity(s))),
    ),
    cards,
  );
}

export function renderWorkers(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const slots = workerSlots(s);
  const assignments: WorkerAssignment[] = ['field', 'irrigation', 'maintenance', 'idle'];
  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const team = s.workers.map((w) =>
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, `👷 ${w.name}`, h('span', { class: 'warn' }, stars(w.skill))),
      h(
        'div',
        { class: 'muted small-text' },
        t('workers.efficiency', { eff: w.efficiency }),
        ' · ',
        t('workers.salary', { amount: w.salary }),
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:6px' },
        h('span', { class: 'small-text muted' }, t('workers.assignment')),
        h(
          'select',
          {
            onchange: (e: Event) => {
              ctx.game.assignWorker(w.id, (e.target as HTMLSelectElement).value as WorkerAssignment);
              ctx.refresh();
            },
          },
          assignments.map((a) => h('option', { value: a, selected: w.assignment === a }, t(`assign.${a}`))),
        ),
        h('span', { class: 'spacer' }),
        h(
          'button',
          {
            class: 'small danger',
            onclick: async () => {
              if (
                !(await ctx.confirm(
                  t('common.fire'),
                  t('workers.fireConfirm', { name: w.name, amount: w.salary }),
                  true,
                ))
              )
                return;
              ctx.game.fireWorker(w.id);
              ctx.refresh();
            },
          },
          t('common.fire'),
        ),
      ),
    ),
  );
  const candidates = s.candidates.map((w) =>
    h(
      'div',
      { class: 'card row' },
      h(
        'div',
        { style: 'flex:1' },
        h('div', { class: 'card-title' }, w.name, h('span', { class: 'warn' }, stars(w.skill))),
        h(
          'div',
          { class: 'muted small-text' },
          t('workers.efficiency', { eff: w.efficiency }),
          ' · ',
          t('workers.salary', { amount: w.salary }),
        ),
      ),
      h(
        'button',
        {
          class: 'small primary',
          disabled: s.workers.length >= slots,
          'data-testid': 'hire-worker',
          onclick: () => {
            const r = ctx.game.hireWorker(w.id);
            if (!r.ok) ctx.toast('error', t(r.reason));
            else audio.play('click');
            ctx.refresh();
          },
        },
        t('common.hire'),
      ),
    ),
  );
  return h(
    'div',
    null,
    h('h3', null, t('workers.hired', { count: s.workers.length, slots })),
    h(
      'div',
      { class: 'muted small-text', style: 'margin-bottom:6px' },
      t('workers.payroll', { amount: monthlyPayroll(s) }),
    ),
    team.length ? team : h('div', { class: 'card muted' }, t('workers.none')),
    h('h3', null, t('workers.candidates')),
    candidates,
    s.workers.length >= slots ? h('div', { class: 'warn small-text' }, t('err.noWorkerSlots')) : null,
  );
}
