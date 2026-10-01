import { BUILDING_EFFECTS, DIFFICULTY, FINANCE, LOANS } from '../../data/balance';
import { annuityPayment, clamp, round } from '../../utils/math';
import { countBuildings } from '../buildings/buildings';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { buildingsValue, landValue, machinesValue, totalDebt } from '../economy/valuation';
import { notify } from '../notifications';
import { checkProgress } from '../progression/progression';
import { DAYS_PER_MONTH } from '../time/calendar';
import type { GameState, Loan } from '../types';

export function interestRate(state: GameState): number {
  const office = countBuildings(state, 'office') > 0 ? BUILDING_EFFECTS.officeInterestDiscount : 0;
  return round(Math.max(0.02, DIFFICULTY[state.difficulty].interestRate - office), 4);
}

/** Maximum total debt allowed (collateral-based). */
export function creditLimit(state: GameState): number {
  const assets = landValue(state) + buildingsValue(state) + machinesValue(state);
  const office = countBuildings(state, 'office') > 0 ? 1 + BUILDING_EFFECTS.officeLoanLimitBonus : 1;
  const raw =
    (LOANS.baseLimit + assets * LOANS.assetFactor + LOANS.perLevel * (state.progression.level - 1)) *
    DIFFICULTY[state.difficulty].loanLimitMult *
    office;
  // Defaulted or bankrupt farms get no new credit.
  if (state.finance.status === 'default' || state.finance.status === 'bankrupt') return 0;
  return Math.round(raw / 1000) * 1000;
}

export function availableCredit(state: GameState): number {
  return Math.max(0, creditLimit(state) - totalDebt(state));
}

export function loanQuote(state: GameState, amount: number, termMonths: number): Loan {
  const rate = interestRate(state);
  const payment = round(annuityPayment(amount, rate / 12, termMonths), 2);
  return {
    id: -1,
    principal: amount,
    interestRate: rate,
    termMonths,
    payment,
    remainingBalance: amount,
    remainingMonths: termMonths,
    nextPaymentDay: state.day + DAYS_PER_MONTH,
    takenDay: state.day,
    missedPayments: 0,
  };
}

export type LoanCheck = { ok: true; loan: Loan } | { ok: false; reason: string };

export function takeLoan(ctx: SimContext, amount: number, termMonths: number): LoanCheck {
  const s = ctx.state;
  const a = Math.round(amount);
  if (!Number.isFinite(a) || a < LOANS.minAmount) return { ok: false, reason: 'err.loanTooSmall' };
  if (!(LOANS.terms as readonly number[]).includes(termMonths))
    return { ok: false, reason: 'err.invalidTerm' };
  if (a > availableCredit(s)) return { ok: false, reason: 'err.creditLimit' };
  const loan = loanQuote(s, a, termMonths);
  loan.id = s.nextId++;
  s.loans.push(loan);
  addTransaction(ctx, 'loanIn', { key: 'ledger.loanIn' }, a);
  s.stats.loansTaken++;
  s.stats.maxDebt = Math.max(s.stats.maxDebt, totalDebt(s));
  notify(ctx, 'economy', 'notif.loanTaken', { amount: a });
  ctx.emit('analytics', { name: 'loan_taken', props: { amount: a, term: termMonths } });
  ctx.emit('requestSave', 'loan');
  return { ok: true, loan };
}

function settle(ctx: SimContext, loan: Loan): void {
  const s = ctx.state;
  s.loans = s.loans.filter((l) => l.id !== loan.id);
  s.stats.loansRepaid++;
  notify(ctx, 'success', 'notif.loanPaid');
  ctx.emit('analytics', { name: 'loan_paid', props: { principal: loan.principal } });
  checkProgress(ctx);
}

/** Early repayment (amortização antecipada). Keeps remaining months, recomputes installment. */
export function prepayLoan(ctx: SimContext, loanId: number, amount: number): LoanCheck {
  const s = ctx.state;
  const loan = s.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, reason: 'err.unknown' };
  const pay = round(clamp(amount, 0, loan.remainingBalance), 2);
  if (pay <= 0) return { ok: false, reason: 'err.invalidAmount' };
  if (s.money < pay) return { ok: false, reason: 'err.noMoney' };
  addTransaction(ctx, 'loanOut', { key: 'ledger.prepay' }, -pay);
  loan.remainingBalance = round(Math.max(0, loan.remainingBalance - pay), 2);
  if (loan.remainingBalance <= 0.01) {
    loan.remainingBalance = 0;
    settle(ctx, loan);
  } else {
    loan.payment = round(
      annuityPayment(loan.remainingBalance, loan.interestRate / 12, loan.remainingMonths),
      2,
    );
  }
  ctx.emit('requestSave', 'prepay');
  return { ok: true, loan };
}

/** Scheduled installments. Called daily; pays loans whose payment day arrived. */
export function processLoanPayments(ctx: SimContext): void {
  const s = ctx.state;
  for (const loan of [...s.loans]) {
    if (s.day < loan.nextPaymentDay) continue;
    const interest = round((loan.remainingBalance * loan.interestRate) / 12, 2);
    const principalPart = round(Math.min(loan.remainingBalance, Math.max(0, loan.payment - interest)), 2);
    // Installment is always debited (cash may go negative -> default flow).
    if (s.money < interest + principalPart) {
      loan.missedPayments++;
      notify(ctx, 'error', 'notif.paymentMissed');
    }
    addTransaction(ctx, 'interest', { key: 'ledger.interest' }, -interest);
    addTransaction(ctx, 'loanOut', { key: 'ledger.installment' }, -principalPart);
    loan.remainingBalance = round(Math.max(0, loan.remainingBalance - principalPart), 2);
    loan.remainingMonths = Math.max(0, loan.remainingMonths - 1);
    loan.nextPaymentDay += DAYS_PER_MONTH;
    if (loan.remainingBalance <= 0.01 || loan.remainingMonths === 0) {
      // Final installment absorbs any rounding remainder.
      if (loan.remainingBalance > 0)
        addTransaction(ctx, 'loanOut', { key: 'ledger.installment' }, -loan.remainingBalance);
      loan.remainingBalance = 0;
      settle(ctx, loan);
    }
  }
}

/**
 * Financial health: alert (cash < 0) → default (negative too long or missed
 * payments) → recovery (cash back positive after default) → bankrupt.
 */
export function updateFinanceStatus(ctx: SimContext): void {
  const s = ctx.state;
  const f = s.finance;
  if (f.status === 'bankrupt') return;
  const tolerance = DIFFICULTY[s.difficulty].bankruptcyToleranceDays;
  if (s.money < 0) {
    f.negativeDays++;
    const missed = s.loans.reduce((n, l) => n + l.missedPayments, 0);
    if (f.negativeDays >= tolerance) {
      f.status = 'bankrupt';
      notify(ctx, 'error', 'notif.bankrupt');
      ctx.emit('analytics', { name: 'bankruptcy' });
      ctx.emit('gameOver', undefined);
      return;
    }
    const prev = f.status;
    f.status = f.negativeDays > FINANCE.defaultAfterDays || missed >= 2 ? 'default' : 'alert';
    if (prev !== f.status) {
      notify(ctx, 'error', f.status === 'default' ? 'notif.default' : 'notif.cashNegative', {
        days: tolerance - f.negativeDays,
      });
    } else if (f.negativeDays % 10 === 0) {
      notify(ctx, 'warning', 'notif.bankruptcyCountdown', { days: tolerance - f.negativeDays });
    }
  } else {
    if (f.status === 'default') {
      f.status = 'recovery';
      notify(ctx, 'economy', 'notif.recovery');
    } else if (f.status === 'recovery') {
      // Recovery lasts while negative days are being paid back.
      f.negativeDays = Math.max(0, f.negativeDays - 2);
      if (f.negativeDays === 0) {
        f.status = 'ok';
        for (const l of s.loans) l.missedPayments = 0;
      }
    } else {
      f.status = 'ok';
      f.negativeDays = 0;
    }
  }
}
