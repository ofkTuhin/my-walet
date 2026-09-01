-- Money the account already held before it started recording transactions.
-- Defaulted, so existing rows keep the behaviour they had (a zero start).
ALTER TABLE "users" ADD COLUMN "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;
