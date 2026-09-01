-- Anchors the opening balance to a specific month. NULL keeps the previous
-- behaviour: the figure applies from the earliest month on record.
ALTER TABLE "users" ADD COLUMN "openingBalanceMonth" TEXT;
