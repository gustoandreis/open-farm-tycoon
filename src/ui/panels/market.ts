import { audio } from '../../audio/AudioManager';
import { CROP_IDS } from '../../data/balance';
import { formatMoney, formatNumber, formatPercent, t } from '../../i18n';
import { storageCapacity, storageUsed } from '../../simulation/buildings/buildings';
import { getEventDef } from '../../simulation/events/events';
import { averagePrice, priceChange } from '../../simulation/market/market';
import { quoteSale } from '../../simulation/market/sales';
import type { CropId } from '../../simulation/types';
import { drawLineChart } from '../chart';
import { bar, h, icon } from '../dom';
import type { PanelContext } from './types';

function doSell(ctx: PanelContext, crop: CropId, tonnes: number): void {
  const r = ctx.game.sell(crop, tonnes);
  if (r.ok) {
    audio.play('coin');
    ctx.toast(
      'market',
      t('market.sold', { tonnes: r.quote.tonnes, crop: `@crop.${crop}`, amount: r.quote.total }),
    );
  } else {
    audio.play('error');
    ctx.toast('error', t(r.reason));
  }
  ctx.refresh();
}

export function renderMarket(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const selected = (ctx.local.selected as CropId | undefined) ?? 'soy';
  const qtys = (ctx.local.qtys as Partial<Record<CropId, string>> | undefined) ?? {};
  ctx.local.qtys = qtys;
  const cap = storageCapacity(s);
  const used = storageUsed(s);

  const rows = CROP_IDS.map((id) => {
    const m = s.market.commodities[id];
    const ch = priceChange(s, id);
    const stock = s.inventory[id];
    const qtyInput = h('input', {
      type: 'number',
      min: '0',
      step: '1',
      style: 'width:3.4rem;padding:0.2rem 0.3rem',
      value: qtys[id] ?? '',
      placeholder: 't',
      'data-testid': `sell-qty-${id}`,
      oninput: (e: Event) => {
        qtys[id] = (e.target as HTMLInputElement).value;
      },
      onclick: (e: Event) => e.stopPropagation(),
    });
    const pctBtn = (pct: number) =>
      h(
        'button',
        {
          class: 'small',
          disabled: stock <= 0,
          'data-testid': `sell-${id}-${pct}`,
          title: stock > 0 ? formatMoney(quoteSale(s, id, (stock * pct) / 100).total) : '',
          onclick: (e: Event) => {
            e.stopPropagation();
            doSell(ctx, id, (stock * pct) / 100);
          },
        },
        `${pct}%`,
      );
    return h(
      'tr',
      {
        class: id === selected ? 'selected' : '',
        style: 'cursor:pointer',
        onclick: () => {
          ctx.local.selected = id;
          ctx.refresh();
        },
      },
      h('td', null, `${icon(id)} ${t(`crop.${id}`)}`),
      h('td', { class: 'num' }, formatMoney(m.price, 2)),
      h('td', { class: `num ${ch > 0 ? 'good' : ch < 0 ? 'bad' : 'muted'}` }, formatPercent(ch, 1, true)),
      h('td', { class: 'num muted' }, formatMoney(averagePrice(s, id), 0)),
      h('td', { class: 'num' }, `${formatNumber(stock)} t`),
      h('td', { class: 'num' }, formatMoney(stock * m.price)),
      h(
        'td',
        null,
        h('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' }, pctBtn(25), pctBtn(50), pctBtn(100)),
        h(
          'div',
          { class: 'row', style: 'gap:2px;margin-top:3px;flex-wrap:nowrap' },
          qtyInput,
          h(
            'button',
            {
              class: 'small primary',
              disabled: stock <= 0,
              onclick: (e: Event) => {
                e.stopPropagation();
                const v = Number(qtys[id]);
                if (!Number.isFinite(v) || v <= 0) {
                  ctx.toast('error', t('err.invalidAmount'));
                  return;
                }
                qtys[id] = '';
                doSell(ctx, id, Math.min(v, stock));
              },
            },
            t('market.sellBtn'),
          ),
        ),
      ),
    );
  });

  const chart = h('canvas', { class: 'chart' });
  requestAnimationFrame(() =>
    drawLineChart(chart, s.market.commodities[selected].history, '#e3b341', averagePrice(s, selected)),
  );

  const events = s.events.active
    .map((a) => getEventDef(a.id))
    .filter((d) => d && d.category === 'market')
    .map((d) =>
      h('div', { class: 'card small-text' }, `📢 ${t(`event.${d?.id}.title`)}: ${t(`event.${d?.id}.desc`)}`),
    );

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'row' },
        `${icon('storage')} ${t('market.storage', { used, cap, pct: formatPercent(used / Math.max(1, cap)) })}`,
      ),
      bar(1 - used / Math.max(1, cap)),
      used <= 0
        ? h('div', { class: 'muted small-text', style: 'margin-top:4px' }, t('market.noStock'))
        : null,
    ),
    events.length ? h('div', null, h('h3', null, t('market.events')), events) : null,
    h(
      'table',
      { class: 'data', 'data-testid': 'market-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, t('market.product')),
          h('th', { class: 'num' }, t('market.price')),
          h('th', { class: 'num' }, t('market.change')),
          h('th', { class: 'num' }, t('market.avg')),
          h('th', { class: 'num' }, t('market.stock')),
          h('th', { class: 'num' }, t('market.value')),
          h('th', null, t('market.action')),
        ),
      ),
      h('tbody', null, rows),
    ),
    h('p', { class: 'muted small-text' }, t('market.saleImpact')),
    h('h3', null, t('market.history', { crop: `@crop.${selected}` })),
    chart,
    h(
      'p',
      { class: 'muted small-text' },
      t('machines.fuelPrice', { price: formatMoney(s.market.fuelPrice, 2) }),
    ),
  );
}
