-- Money lent out and borrowed, tracked apart from the income/expense ledger.
--
-- Purely additive: no existing table is touched, so this is safe to apply to a
-- database already carrying transactions.

CREATE TYPE "DebtDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

CREATE TABLE "debts" (
    "id" TEXT NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "debt_repayments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debtId" TEXT NOT NULL,

    CONSTRAINT "debt_repayments_pkey" PRIMARY KEY ("id")
);

-- Leads with userId for the same reason every other index here does: the
-- tenant filter is on every query, and an index that does not lead with it
-- cannot serve them.
CREATE INDEX "debts_userId_direction_settledAt_idx" ON "debts"("userId", "direction", "settledAt");
CREATE INDEX "debts_userId_date_idx" ON "debts"("userId", "date");
CREATE INDEX "debt_repayments_debtId_date_idx" ON "debt_repayments"("debtId", "date");

ALTER TABLE "debts" ADD CONSTRAINT "debts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "debt_repayments" ADD CONSTRAINT "debt_repayments_debtId_fkey"
    FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
