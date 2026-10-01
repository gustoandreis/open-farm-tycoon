import { audio } from '../../audio/AudioManager';
import { ACHIEVEMENTS, CROP_IDS, CROPS, OBJECTIVES, TECHNOLOGIES } from '../../data/balance';
import { formatMoney, formatNumber, localizeStored, t } from '../../i18n';
import {
  farmableOwnedTiles,
  forEachParcelTile,
  isParcelForSale,
  ownedTileCount,
} from '../../simulation/world/map';
import { landPrice } from '../../simulation/world/land';
import { canResearch } from '../../simulation/technology/technology';
import { netWorth } from '../../simulation/economy/valuation';
import { xpForNextLevel } from '../../simulation/progression/progression';
import { toDate } from '../../simulation/time/calendar';
import type { CropId, Season } from '../../simulation/types';
import { bar, h, icon } from '../dom';
import type { PanelContext } from './types';

export function renderLand(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const owned = s.parcels.filter((p) => p.owned);
  const forSale = s.parcels.filter((p) => isParcelForSale(s, p));
  const cards = forSale.map((p) => {
    let fert = 0;
    let n = 0;
    let water = 0;
    forEachParcelTile(s, p, (tile) => {
      if (tile.terrain === 'water') water++;
      else {
        fert += tile.fertility;
        n++;
      }
    });
    const price = landPrice(s, p);
    return h(
      'div',
      { class: 'card row' },
      h(
        'div',
        { style: 'flex:1' },
        h('div', { class: 'card-title' }, t('land.parcel', { id: p.id })),
        h(
          'div',
          { class: 'muted small-text' },
          t('land.parcelInfo', { tiles: p.w * p.h, fert: Math.round(fert / Math.max(1, n)), water }),
        ),
      ),
      h('b', null, formatMoney(price)),
      h(
        'button',
        { class: 'small', onclick: () => ctx.session.focusTile(p.x + p.w / 2, p.y + p.h / 2) },
        t('common.view'),
      ),
      h(
        'button',
        {
          class: 'small primary',
          disabled: s.money < price,
          'data-testid': `buy-parcel-${p.id}`,
          onclick: async () => {
            ctx.session.focusTile(p.x + p.w / 2, p.y + p.h / 2);
            await ctx.session.tryBuyParcel(p);
            ctx.refresh();
          },
        },
        t('common.buy'),
      ),
    );
  });
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'card' },
      t('land.summary', { parcels: owned.length, tiles: ownedTileCount(s), farmable: farmableOwnedTiles(s) }),
    ),
    h('p', { class: 'muted small-text' }, t('land.hint')),
    h('h3', null, t('land.forSale')),
    cards.length ? cards : h('div', { class: 'muted' }, t('land.none')),
  );
}

function waterLabel(req: number): string {
  return req < 1 ? t('water.low') : req < 1.5 ? t('water.medium') : t('water.high');
}

export function renderCrops(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const season = toDate(s.day).season;
  const planted: Record<CropId, { n: number; ready: number }> = {
    corn: { n: 0, ready: 0 },
    soy: { n: 0, ready: 0 },
    wheat: { n: 0, ready: 0 },
    potato: { n: 0, ready: 0 },
    sunflower: { n: 0, ready: 0 },
  };
  for (const tile of s.map.tiles) {
    if (!tile.crop) continue;
    planted[tile.crop.cropId].n++;
    if (tile.crop.readyDay !== null) planted[tile.crop.cropId].ready++;
  }
  return h(
    'div',
    null,
    CROP_IDS.map((id) => {
      const c = CROPS[id];
      const locked = s.progression.level < c.unlockLevel;
      const inSeason = c.plantingSeason.includes(season);
      return h(
        'div',
        { class: `card ${locked ? 'locked' : ''}` },
        h(
          'div',
          { class: 'card-title' },
          `${icon(id)} ${t(`crop.${id}`)}`,
          h(
            'span',
            { class: `small-text ${inSeason ? 'good' : 'warn'}` },
            inSeason ? t('crops.inSeason') : t('crops.outSeason'),
          ),
          h('span', { class: 'spacer' }),
          locked
            ? h('span', { class: 'muted small-text' }, t('crops.level', { level: c.unlockLevel }))
            : h(
                'button',
                {
                  class: 'small primary',
                  onclick: () => {
                    ctx.session.setTool('plant');
                    ctx.session.setCrop(id);
                    ctx.closePanel();
                  },
                },
                t('crops.plantIt'),
              ),
        ),
        h(
          'div',
          { class: 'kv small-text', style: 'margin-top:4px' },
          h('div', { class: 'k' }, t('crops.seed')),
          h('div', { class: 'v' }, formatMoney(c.seedCost)),
          h('div', { class: 'k' }, t('crops.growth')),
          h('div', { class: 'v' }, t('common.days', { count: c.growthDays })),
          h('div', { class: 'k' }, t('crops.water')),
          h('div', { class: 'v' }, waterLabel(c.waterRequirement)),
          h('div', { class: 'k' }, t('crops.yield')),
          h('div', { class: 'v' }, `${formatNumber(c.baseYield)} t/ha`),
          h('div', { class: 'k' }, t('crops.price')),
          h('div', { class: 'v' }, `${formatMoney(s.market.commodities[id].price)}/t`),
          h('div', { class: 'k' }, t('crops.season')),
          h('div', { class: 'v' }, c.plantingSeason.map((x: Season) => t(`season.${x}`)).join(', ')),
        ),
        planted[id].n > 0
          ? h(
              'div',
              { class: 'small-text', style: 'margin-top:4px' },
              t('crops.planted', { count: planted[id].n, ready: planted[id].ready }),
            )
          : null,
      );
    }),
  );
}

export function renderTech(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  return h(
    'div',
    null,
    TECHNOLOGIES.map((tech) => {
      const done = s.technologies.includes(tech.id);
      const check = canResearch(s, tech.id);
      const locked = s.progression.level < tech.level;
      return h(
        'div',
        { class: `card ${locked ? 'locked' : ''}` },
        h(
          'div',
          { class: 'card-title' },
          `${icon('tech')} ${t(`tech.${tech.id}.name`)}`,
          h('span', { class: 'spacer' }),
          done
            ? h('span', { class: 'good' }, `✔ ${t('tech.done')}`)
            : h(
                'button',
                {
                  class: 'small primary',
                  disabled: !check.ok,
                  'data-testid': `research-${tech.id}`,
                  onclick: () => {
                    const r = ctx.game.research(tech.id);
                    if (!r.ok) ctx.toast('error', t(r.reason));
                    else audio.play('levelUp');
                    ctx.refresh();
                  },
                },
                t('common.research'),
              ),
        ),
        h('div', { class: 'small-text' }, t(`tech.${tech.id}.desc`)),
        h(
          'div',
          { class: 'muted small-text' },
          t('tech.cost', { amount: tech.cost }),
          ' · ',
          t('common.requiresLevel', { level: tech.level }),
          tech.requires.length
            ? ` · ${t('tech.requires', { list: tech.requires.map((r) => t(`tech.${r}.name`)).join(', ') })}`
            : '',
        ),
      );
    }),
  );
}

export function renderStats(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const st = s.stats;
  const plantedNow = s.map.tiles.filter((x) => x.crop).length;
  const rows: [string, string][] = [
    [t('stats.daysPlayed'), String(st.daysPlayed)],
    [t('stats.area'), `${ownedTileCount(s)} ha`],
    [t('stats.planted'), `${plantedNow} ha`],
    [t('stats.production'), `${formatNumber(st.totalProduction)} t`],
    [t('stats.sales'), String(st.salesCount)],
    [t('stats.revenue'), formatMoney(st.totalRevenue)],
    [t('stats.expenses'), formatMoney(st.totalExpenses)],
    [t('stats.profit'), formatMoney(st.totalRevenue - st.totalExpenses)],
    [t('stats.biggestSale'), formatMoney(st.biggestSale)],
    [t('stats.machines'), String(st.machinesBought)],
    [t('stats.buildings'), String(st.buildingsBuilt)],
    [t('stats.maxDebt'), formatMoney(st.maxDebt)],
    [t('finance.netWorth'), formatMoney(netWorth(s))],
  ];
  const next = xpForNextLevel(s.progression.level);
  const y = s.lastYearSummary;
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'card-title' },
        `${icon('level')} ${t('stats.level', { level: s.progression.level, xp: s.progression.xp })}`,
      ),
      next ? bar(s.progression.xp / next) : null,
    ),
    h('h3', null, t('stats.general')),
    h(
      'div',
      { class: 'card kv' },
      rows.flatMap(([k, v]) => [h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)]),
    ),
    h('h3', null, t('stats.byCrop')),
    h(
      'div',
      { class: 'card kv' },
      CROP_IDS.flatMap((id) => [
        h('div', { class: 'k' }, `${icon(id)} ${t(`crop.${id}`)}`),
        h('div', { class: 'v' }, `${formatNumber(st.production[id])} t`),
      ]),
    ),
    y
      ? h(
          'div',
          null,
          h('h3', null, t('stats.lastYear')),
          h(
            'div',
            { class: 'card kv' },
            h('div', { class: 'k' }, t('yr.revenue')),
            h('div', { class: 'v' }, formatMoney(y.revenue)),
            h('div', { class: 'k' }, t('yr.expenses')),
            h('div', { class: 'v' }, formatMoney(y.expenses)),
            h('div', { class: 'k' }, t('yr.profit')),
            h('div', { class: `v ${y.profit >= 0 ? 'good' : 'bad'}` }, formatMoney(y.profit)),
          ),
        )
      : null,
    h('h3', null, t('stats.objectives')),
    OBJECTIVES.map((o) =>
      h(
        'div',
        { class: s.objectives.includes(o.id) ? 'good' : 'muted' },
        `${s.objectives.includes(o.id) ? '✔' : '○'} ${t(`objective.${o.id}`)}`,
      ),
    ),
    h('h3', null, t('stats.achievements')),
    ACHIEVEMENTS.map((a) => {
      const got = s.achievements.includes(a);
      return h(
        'div',
        { class: `card ${got ? '' : 'locked'}`, style: 'padding:0.4rem 0.6rem' },
        h('div', { class: 'card-title' }, `${got ? '🏆' : '🔒'} ${t(`achievement.${a}.name`)}`),
        h('div', { class: 'muted small-text' }, t(`achievement.${a}.desc`)),
      );
    }),
  );
}

export function renderNotifications(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const list = [...s.notifications].reverse();
  return h(
    'div',
    null,
    list.length === 0 ? h('div', { class: 'muted' }, '—') : null,
    list.map((n) => {
      const d = toDate(n.day);
      return h(
        'div',
        { class: `toast ${n.category}`, style: 'animation:none;margin-bottom:6px' },
        h('div', { class: 'muted small-text' }, `${d.day}/${d.month}/${d.year}`),
        `${icon(n.category)} ${localizeStored(n.text)}`,
      );
    }),
  );
}
