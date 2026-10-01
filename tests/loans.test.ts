import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../src/data/balance';
import { totalDebt } from '../src/simulation/economy/valuation';
import { availableCredit, creditLimit, loanQuote } from '../src/simulation/finance/loans';
import { annuityPayment } from '../src/utils/math';
import { newTestGame } from './helpers';

describe('bank & loans', () => {
  it('annuity payment matches the Price table formula', () => {
    expect(annuityPayment(12000, 0, 12)).toBeCloseTo(1000, 6);
    expect(annuityPayment(10000, 0.01, 12)).toBeCloseTo(888.49, 2);
  });

  it('taking a loan credits cash and records debt', () => {
    const g = newTestGame();
    const money0 = g.state.money;
    const r = g.takeLoan(20000, 24);
    expect(r.ok).toBe(true);
    expect(g.state.money).toBe(money0 + 20000);
    expect(totalDebt(g.state)).toBe(20000);
    expect(g.state.loans[0].payment).toBeGreaterThan(20000 / 24);
  });

  it('cannot borrow beyond the credit limit (no infinite loans)', () => {
    const g = newTestGame();
    const limit = creditLimit(g.state);
    expect(limit).toBeGreaterThan(0);
    expect(g.takeLoan(limit + 1000, 12).ok).toBe(false);
    expect(g.takeLoan(Math.floor(availableCredit(g.state) / 1000) * 1000, 12).ok).toBe(true);
    expect(g.takeLoan(5000, 12).ok).toBe(false);
    expect(g.takeLoan(500, 12).ok).toBe(false);
    expect(g.takeLoan(5000, 7).ok).toBe(false);
  });

  it('pays monthly installments with interest until the balance reaches zero', () => {
    const g = newTestGame();
    g.state.money = 1e6;
    g.takeLoan(12000, 12);
    const interest0 = g.state.stats.totalExpenses;
    let lastBalance = 12000;
    for (let m = 0; m < 12; m++) {
      g.advanceDays(30);
      const l = g.state.loans[0];
      if (l) {
        expect(l.remainingBalance).toBeLessThan(lastBalance);
        expect(l.remainingBalance).toBeGreaterThanOrEqual(0);
        lastBalance = l.remainingBalance;
      }
    }
    expect(g.state.loans).toHaveLength(0);
    expect(g.state.stats.totalExpenses).toBeGreaterThan(interest0);
    const interestPaid = g.state.ledger
      .filter((e) => e.category === 'interest')
      .reduce((s, e) => s - e.amount, 0);
    const q = loanQuote(g.state, 12000, 12);
    expect(interestPaid).toBeGreaterThan(0);
    expect(interestPaid).toBeLessThan(q.payment * 12 - 12000 + 1);
  });

  it('early repayment reduces balance and installment; full payoff closes the loan', () => {
    const g = newTestGame();
    g.takeLoan(20000, 24);
    const loan = g.state.loans[0];
    const pay0 = loan.payment;
    expect(g.prepayLoan(loan.id, 5000).ok).toBe(true);
    expect(loan.remainingBalance).toBe(15000);
    expect(loan.payment).toBeLessThan(pay0);
    expect(g.prepayLoan(loan.id, 1e9).ok).toBe(true);
    expect(g.state.loans).toHaveLength(0);
    expect(g.state.achievements).toContain('debtFree');
  });

  it('negative cash follows alert → default → bankruptcy, not instant game over', () => {
    const g = newTestGame('BK');
    g.state.money = -5000;
    g.advanceDay();
    expect(g.state.finance.status).toBe('alert');
    expect(g.isGameOver).toBe(false);
    g.advanceDays(20);
    if (g.state.money < 0) expect(['default', 'alert']).toContain(g.state.finance.status);
    g.state.money = -50000;
    g.advanceDays(DIFFICULTY.normal.bankruptcyToleranceDays + 5);
    expect(g.state.finance.status).toBe('bankrupt');
    expect(g.isGameOver).toBe(true);
    const day = g.state.day;
    g.advanceDay();
    expect(g.state.day).toBe(day);
  });

  it('cash recovery after default goes through recovery then ok', () => {
    const g = newTestGame();
    g.state.money = -1000;
    g.advanceDays(20);
    expect(g.state.finance.status).toBe('default');
    g.state.money = 50000;
    g.advanceDay();
    expect(g.state.finance.status).toBe('recovery');
    g.advanceDays(30);
    expect(g.state.finance.status).toBe('ok');
  });
});
