import { audio } from '../../audio/AudioManager';
import { DIFFICULTY, LOANS } from '../../data/balance';
import { formatMoney, formatPercent, localizeStored, t } from '../../i18n';
import { incomeStatement, summarizeMonth, type IncomeStatement } from '../../simulation/economy/ledger';
import { netWorth, totalDebt } from '../../simulation/economy/valuation';
import { availableCredit, creditLimit, interestRate, loanQuote } from '../../simulation/finance/loans';
import { monthKey, toDate } from '../../simulation/time/calendar';
import type { GameState } from '../../simulation/types';
import { h } from '../dom';
import type { PanelContext } from './types';

function kv(k: string, v: string, cls = ''): HTMLElement[] {
  return [h('div', { class: 'k' }, k), h('div', { class: `v ${cls}` }, v)];
}

function money(v: number): string {
  return formatMoney(v);
}

function statusLine(s: GameState): HTMLElement {
  const f = s.finance;
  const cls = f.status === 'ok' ? 'good' : f.status === 'recovery' ? 'warn' : 'bad';
  const tol = DIFFICULTY[s.difficulty].bankruptcyToleranceDays;
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'muted' }, t('finance.status')),
      h('span', { class: `spacer` }),
      h('b', { class: cls }, t(`fin.status.${f.status}`)),
    ),
    s.money < 0
      ? h('div', { class: 'bad small-text' }, t('fin.countdown', { days: Math.max(0, tol - f.negativeDays) }))
      : null,
  );
}

function monthKeysOfYear(state: GameState): string[] {
  const d = toDate(state.day);
  const keys: string[] = [];
  for (let m = 1; m <= d.month; m++) keys.push(`${d.year}-${m}`);
  return keys;
}

function prevMonthKey(state: GameState): string {
  const d = toDate(state.day);
  return d.month === 1 ? `${d.year - 1}-12` : `${d.year}-${d.month - 1}`;
}

export function renderFinance(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const cur = summarizeMonth(s, monthKey(s.day));
  const cols: [string, IncomeStatement][] = [
    [t('finance.thisMonth'), incomeStatement(s, [monthKey(s.day)])],
    [t('finance.lastMonth'), incomeStatement(s, [prevMonthKey(s)])],
    [t('finance.thisYear'), incomeStatement(s, monthKeysOfYear(s))],
  ];
  const lines: [string, keyof IncomeStatement][] = [
    ['finance.revenue', 'revenue'],
    ['finance.farmCosts', 'farmCosts'],
    ['finance.salaries', 'salaries'],
    ['finance.fuel', 'fuel'],
    ['finance.maintenance', 'maintenance'],
    ['finance.interest', 'interest'],
    ['finance.investments', 'investments'],
    ['finance.other', 'other'],
    ['finance.result', 'result'],
  ];
  const ledger = s.ledger.slice(-40).reverse();
  return h(
    'div',
    null,
    statusLine(s),
    h(
      'div',
      { class: 'card kv', 'data-testid': 'finance-summary' },
      ...kv(t('finance.cash'), money(s.money), s.money < 0 ? 'bad' : ''),
      ...kv(t('finance.monthRevenue'), money(cur.revenue), 'good'),
      ...kv(t('finance.monthExpenses'), money(cur.expenses), 'bad'),
      ...kv(t('finance.monthResult'), money(cur.result), cur.result >= 0 ? 'good' : 'bad'),
      ...kv(t('finance.debt'), money(totalDebt(s))),
      ...kv(t('finance.netWorth'), money(netWorth(s))),
    ),
    h('h3', null, t('finance.dre')),
    h(
      'table',
      { class: 'data' },
      h(
        'thead',
        null,
        h('tr', null, h('th', null, ''), ...cols.map(([label]) => h('th', { class: 'num' }, label))),
      ),
      h(
        'tbody',
        null,
        lines.map(([label, key]) =>
          h(
            'tr',
            null,
            h('td', { style: key === 'result' ? 'font-weight:bold' : '' }, t(label)),
            ...cols.map(([, st]) =>
              h(
                'td',
                { class: `num ${key === 'result' ? (st.result >= 0 ? 'good' : 'bad') : ''}` },
                money(st[key]),
              ),
            ),
          ),
        ),
      ),
    ),
    h('h3', null, t('finance.ledger')),
    h(
      'table',
      { class: 'data' },
      h(
        'tbody',
        null,
        ledger.map((e) => {
          const d = toDate(e.day);
          return h(
            'tr',
            null,
            h(
              'td',
              { class: 'muted small-text', style: 'white-space:nowrap' },
              `${d.day}/${d.month}/${d.year}`,
            ),
            h('td', { class: 'muted small-text' }, t(`ledgerCat.${e.category}`)),
            h('td', null, localizeStored(e.description)),
            h('td', { class: `num ${e.amount >= 0 ? 'good' : 'bad'}` }, money(e.amount)),
          );
        }),
      ),
    ),
  );
}

export function renderBank(ctx: PanelContext): HTMLElement {
  const s = ctx.game.state;
  const limit = creditLimit(s);
  const avail = availableCredit(s);
  const rate = interestRate(s);
  const step = 1000;
  const maxAmount = Math.floor(avail / step) * step;
  let amount = Math.min(Number(ctx.local.amount ?? 20_000), maxAmount);
  if (amount < LOANS.minAmount) amount = Math.min(LOANS.minAmount, maxAmount);
  const term = Number(ctx.local.term ?? 24);
  const quote = loanQuote(s, amount, term);
  const amountLabel = h('b', null, formatMoney(amount));
  const paymentLabel = h('div', null, t('bank.payment', { amount: quote.payment }));
  const interestLabel = h(
    'div',
    { class: 'muted small-text' },
    t('bank.totalInterest', { amount: quote.payment * term - amount }),
  );
  const slider = h('input', {
    type: 'range',
    min: String(Math.min(LOANS.minAmount, maxAmount)),
    max: String(Math.max(maxAmount, LOANS.minAmount)),
    step: String(step),
    value: String(amount),
    style: 'width:100%',
    'data-testid': 'loan-amount',
    disabled: maxAmount < LOANS.minAmount,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      ctx.local.amount = v;
      const q = loanQuote(s, v, term);
      amountLabel.textContent = formatMoney(v);
      paymentLabel.textContent = t('bank.payment', { amount: q.payment });
      interestLabel.textContent = t('bank.totalInterest', { amount: q.payment * term - v });
    },
  });

  const takeBtn = h(
    'button',
    {
      class: 'primary',
      'data-testid': 'take-loan',
      disabled: maxAmount < LOANS.minAmount,
      onclick: async () => {
        const a = Number(ctx.local.amount ?? amount);
        const amt = Math.min(Math.max(a, LOANS.minAmount), maxAmount);
        const q = loanQuote(s, amt, term);
        const ok = await ctx.confirm(
          t('bank.newLoan'),
          t('bank.takeConfirm', { amount: amt, months: term, payment: q.payment }),
        );
        if (!ok) return;
        const r = ctx.game.takeLoan(amt, term);
        if (r.ok) audio.play('coin');
        else ctx.toast('error', t(r.reason));
        ctx.refresh();
      },
    },
    t('bank.take'),
  );

  const loans = s.loans.map((l) => {
    const d = toDate(l.nextPaymentDay);
    const pre = h('input', { type: 'number', min: '0', step: '500', style: 'width:6rem', placeholder: '$' });
    return h(
      'div',
      { class: 'card', 'data-testid': 'loan-card' },
      h(
        'div',
        { class: 'card-title' },
        `🏦 ${t('bank.loan', { amount: l.principal })} · ${formatPercent(l.interestRate, 1)}`,
      ),
      h('div', null, t('bank.balance', { amount: l.remainingBalance })),
      h(
        'div',
        { class: 'muted small-text' },
        t('bank.loanPayment', { amount: l.payment, months: l.remainingMonths }),
      ),
      h(
        'div',
        { class: 'muted small-text' },
        t('bank.nextPayment', {
          date: t('date.format', { day: d.day, month: `@month.${d.month}`, year: d.year }),
        }),
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:6px' },
        pre,
        h(
          'button',
          {
            class: 'small',
            onclick: () => {
              const v = Number(pre.value);
              const r = ctx.game.prepayLoan(l.id, v);
              if (!r.ok) ctx.toast('error', t(r.reason));
              else audio.play('coin');
              ctx.refresh();
            },
          },
          t('bank.prepay'),
        ),
        h(
          'button',
          {
            class: 'small primary',
            'data-testid': 'payoff-loan',
            disabled: s.money < l.remainingBalance,
            onclick: () => {
              const r = ctx.game.prepayLoan(l.id, l.remainingBalance);
              if (!r.ok) ctx.toast('error', t(r.reason));
              else audio.play('coin');
              ctx.refresh();
            },
          },
          `${t('bank.payOff')} (${formatMoney(l.remainingBalance)})`,
        ),
      ),
    );
  });

  return h(
    'div',
    null,
    statusLine(s),
    h(
      'div',
      { class: 'card kv' },
      ...kv(t('bank.limit'), formatMoney(limit)),
      ...kv(t('finance.debt'), formatMoney(totalDebt(s))),
      ...kv(t('bank.available'), formatMoney(avail), 'good'),
    ),
    h(
      'div',
      { class: 'muted small-text' },
      t('bank.rate', { rate: formatPercent(rate, 1) }),
      ' · ',
      t('bank.limitHint'),
    ),
    h('h3', null, t('bank.newLoan')),
    maxAmount < LOANS.minAmount
      ? h('div', { class: 'card muted' }, t('bank.noCredit'))
      : h(
          'div',
          { class: 'card' },
          h('div', { class: 'row' }, t('bank.amount'), h('span', { class: 'spacer' }), amountLabel),
          slider,
          h(
            'div',
            { class: 'row', style: 'margin:6px 0' },
            t('bank.term'),
            h('span', { class: 'spacer' }),
            ...LOANS.terms.map((m) =>
              h(
                'button',
                {
                  class: `small ${m === term ? 'active' : ''}`,
                  onclick: () => {
                    ctx.local.term = m;
                    ctx.refresh();
                  },
                },
                t('bank.months', { count: m }),
              ),
            ),
          ),
          paymentLabel,
          interestLabel,
          h('div', { class: 'actions row', style: 'margin-top:8px;justify-content:flex-end' }, takeBtn),
        ),
    h('h3', null, t('bank.loans')),
    loans.length ? loans : h('div', { class: 'muted' }, t('bank.noLoans')),
  );
}
