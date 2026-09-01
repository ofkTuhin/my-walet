import { Prisma } from '@prisma/client';

import { prisma } from './prisma';
import { decimalToNumber, round2 } from './serialize';
import type { UpdateAccountInput } from './validation';

/**
 * Account-level settings, as opposed to ledger data.
 *
 * Only the opening balance lives here for now: the money already held before
 * anything was recorded. Without it the balance starts at zero for anyone who
 * did not begin tracking on the day they first had money.
 */

export interface AccountSettings {
  openingBalance: number;
  /** `YYYY-MM` the balance is true at the start of; null = earliest month. */
  openingBalanceMonth: string | null;
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { openingBalance: true, openingBalanceMonth: true },
  });
  return {
    openingBalance: round2(decimalToNumber(account?.openingBalance ?? null)),
    openingBalanceMonth: account?.openingBalanceMonth ?? null,
  };
}

export async function updateAccountSettings(
  userId: string,
  input: UpdateAccountInput,
): Promise<AccountSettings> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      // From a string, so no binary float error already in the number is
      // carried into the Decimal column.
      openingBalance: new Prisma.Decimal(input.openingBalance.toFixed(2)),
      // Absent leaves the anchor alone; an explicit null clears it.
      ...(input.openingBalanceMonth !== undefined
        ? { openingBalanceMonth: input.openingBalanceMonth }
        : {}),
    },
    select: { openingBalance: true, openingBalanceMonth: true },
  });
  return {
    openingBalance: round2(decimalToNumber(updated.openingBalance)),
    openingBalanceMonth: updated.openingBalanceMonth,
  };
}
