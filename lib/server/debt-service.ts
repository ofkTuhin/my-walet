import { Prisma, type DebtDirection } from '@prisma/client';

import { prisma } from './prisma';
import { decimalToNumber, round2 } from './serialize';
import type { AddDebtInput, AddRepaymentInput } from './validation';

/**
 * Money lent out and borrowed.
 *
 * Kept apart from the transaction ledger on purpose: lending is not spending,
 * it converts cash into a claim on someone. Folding it into EXPENSE would
 * quietly corrupt every income/expense total, chart and category breakdown.
 *
 * The balance still reflects real cash, through one identity applied in
 * getDebtTotals: what you are owed has left your pocket, what you owe is
 * sitting in it.
 */

export interface DebtDTO {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  principal: number;
  /** Principal minus everything repaid so far; never negative. */
  outstanding: number;
  repaid: number;
  note: string | null;
  date: string;
  settledAt: string | null;
  repayments: Array<{ id: string; amount: number; date: string; note: string | null }>;
}

export interface DebtTotals {
  /** Still owed to you across unsettled receivables. */
  receivable: number;
  /** Still owed by you across unsettled payables. */
  payable: number;
  receivableCount: number;
  payableCount: number;
  /**
   * What the debts do to your cash position: negative while you are a net
   * lender. Add this to income − expense to get the real balance.
   */
  netCashEffect: number;
}

type DebtWithRepayments = Prisma.DebtGetPayload<{ include: { repayments: true } }>;

/** Every read is scoped by userId in the same way the transaction service is. */
function debtWhere(userId: string, direction?: DebtDirection): Prisma.DebtWhereInput {
  return { userId, ...(direction ? { direction } : {}) };
}

export function toDebtDTO(debt: DebtWithRepayments): DebtDTO {
  const principal = round2(decimalToNumber(debt.principal));
  const repaid = round2(
    debt.repayments.reduce((sum, r) => sum + decimalToNumber(r.amount), 0),
  );

  return {
    id: debt.id,
    direction: debt.direction,
    counterparty: debt.counterparty,
    principal,
    repaid,
    // Clamped: an overpayment is a data-entry slip, not a negative debt.
    outstanding: round2(Math.max(0, principal - repaid)),
    note: debt.note,
    date: debt.date.toISOString(),
    settledAt: debt.settledAt?.toISOString() ?? null,
    repayments: debt.repayments
      .slice()
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((r) => ({
        id: r.id,
        amount: round2(decimalToNumber(r.amount)),
        date: r.date.toISOString(),
        note: r.note,
      })),
  };
}

export class DebtNotFoundError extends Error {
  constructor(id: string) {
    super(`No debt found with id ${id}`);
    this.name = 'DebtNotFoundError';
  }
}

export class RepaymentExceedsDebtError extends Error {
  constructor(outstanding: number) {
    super(`Repayment is larger than the ${outstanding.toFixed(2)} still outstanding`);
    this.name = 'RepaymentExceedsDebtError';
  }
}

export async function listDebts(
  userId: string,
  options: { direction?: DebtDirection; includeSettled?: boolean } = {},
): Promise<DebtDTO[]> {
  const debts = await prisma.debt.findMany({
    where: {
      ...debtWhere(userId, options.direction),
      ...(options.includeSettled ? {} : { settledAt: null }),
    },
    include: { repayments: true },
    orderBy: [{ settledAt: 'asc' }, { date: 'desc' }],
  });
  return debts.map(toDebtDTO);
}

export async function getDebt(userId: string, id: string): Promise<DebtDTO> {
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    include: { repayments: true },
  });
  // Not-found rather than forbidden for someone else's id: the response must
  // not confirm that the row exists.
  if (!debt) throw new DebtNotFoundError(id);
  return toDebtDTO(debt);
}

export async function createDebt(userId: string, input: AddDebtInput): Promise<DebtDTO> {
  const debt = await prisma.debt.create({
    data: {
      userId,
      direction: input.direction,
      counterparty: input.counterparty.trim(),
      principal: new Prisma.Decimal(input.amount.toFixed(2)),
      note: input.note?.trim() || null,
      date: input.date ?? new Date(),
    },
    include: { repayments: true },
  });
  return toDebtDTO(debt);
}

export async function addRepayment(
  userId: string,
  debtId: string,
  input: AddRepaymentInput,
): Promise<DebtDTO> {
  // One transaction: the outstanding check and the write must not race a
  // concurrent repayment, or a debt could be paid past zero.
  const repaidOn = input.date ?? new Date();

  return prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({
      where: { id: debtId, userId },
      include: { repayments: true },
    });
    if (!debt) throw new DebtNotFoundError(debtId);

    const current = toDebtDTO(debt);
    if (input.amount > current.outstanding) {
      throw new RepaymentExceedsDebtError(current.outstanding);
    }

    await tx.debtRepayment.create({
      data: {
        debtId,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        date: repaidOn,
        note: input.note?.trim() || null,
      },
    });

    // Settling is derived, not asked for: paying the last instalment closes it.
    const stillOwed = round2(current.outstanding - input.amount);
    const updated = await tx.debt.update({
      where: { id: debtId },
      data: { settledAt: stillOwed <= 0 ? repaidOn : null },
      include: { repayments: true },
    });
    return toDebtDTO(updated);
  });
}

export async function deleteDebt(userId: string, id: string): Promise<DebtDTO> {
  const existing = await prisma.debt.findFirst({
    where: { id, userId },
    include: { repayments: true },
  });
  if (!existing) throw new DebtNotFoundError(id);

  const { count } = await prisma.debt.deleteMany({ where: { id, userId } });
  if (count === 0) throw new DebtNotFoundError(id);
  return toDebtDTO(existing);
}

/**
 * Outstanding totals per direction, plus their effect on cash.
 *
 * Aggregating repayments in SQL rather than loading every debt: this runs on
 * the dashboard's summary request, which must stay cheap as the ledger grows.
 */
export async function getDebtTotals(userId: string): Promise<DebtTotals> {
  const rows = await prisma.$queryRaw<
    Array<{ direction: DebtDirection; outstanding: Prisma.Decimal | null; count: bigint }>
  >`
    SELECT d."direction",
           SUM(d."principal" - COALESCE(r."repaid", 0)) AS "outstanding",
           COUNT(*) AS "count"
      FROM public."debts" d
      LEFT JOIN (
        SELECT "debtId", SUM("amount") AS "repaid"
          FROM public."debt_repayments"
         GROUP BY "debtId"
      ) r ON r."debtId" = d."id"
     WHERE d."userId" = ${userId}::text
       AND d."settledAt" IS NULL
     GROUP BY d."direction"
  `;

  const find = (direction: DebtDirection) => rows.find((row) => row.direction === direction);
  const receivableRow = find('RECEIVABLE');
  const payableRow = find('PAYABLE');

  const receivable = round2(Math.max(0, decimalToNumber(receivableRow?.outstanding ?? null)));
  const payable = round2(Math.max(0, decimalToNumber(payableRow?.outstanding ?? null)));

  return {
    receivable,
    payable,
    receivableCount: Number(receivableRow?.count ?? 0),
    payableCount: Number(payableRow?.count ?? 0),
    // Money you are owed is out of your pocket; money you owe is in it.
    netCashEffect: round2(payable - receivable),
  };
}
