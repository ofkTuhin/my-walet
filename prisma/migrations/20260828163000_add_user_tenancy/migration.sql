-- Introduces per-user tenancy.
--
-- Existing rows predate the concept of an owner, so this migration cannot add a
-- NOT NULL userId directly. It runs in three steps — add nullable, backfill,
-- then constrain — so the existing ledger survives.
--
-- The backfill assigns every current row to a single bootstrap account. After
-- the first real sign-in, repoint it with:
--   UPDATE users SET "clerkId" = '<real clerk id>' WHERE "clerkId" = 'bootstrap';

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- Step 1: add the owner column as nullable so existing rows remain valid.
ALTER TABLE "transactions" ADD COLUMN "userId" TEXT;
ALTER TABLE "categories" ADD COLUMN "userId" TEXT;

-- Step 2: create the bootstrap account and hand it everything that exists.
INSERT INTO "users" ("id", "clerkId", "email", "name", "createdAt", "updatedAt")
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'bootstrap',
    NULL,
    'Bootstrap account',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

UPDATE "transactions" SET "userId" = '00000000-0000-4000-8000-000000000001' WHERE "userId" IS NULL;
UPDATE "categories"   SET "userId" = '00000000-0000-4000-8000-000000000001' WHERE "userId" IS NULL;

-- Step 3: now that every row has an owner, require one.
ALTER TABLE "transactions" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "categories"   ALTER COLUMN "userId" SET NOT NULL;

-- Category names are unique per account, not globally: two people may both
-- keep a "Groceries" category.
DROP INDEX "categories_name_key";
CREATE UNIQUE INDEX "categories_userId_name_key" ON "categories"("userId", "name");

-- Every query carries a tenant filter, so each index must lead with userId —
-- an index that does not cannot serve those queries.
DROP INDEX "transactions_date_idx";
DROP INDEX "transactions_type_idx";
DROP INDEX "transactions_category_idx";
DROP INDEX "transactions_type_date_idx";
DROP INDEX "categories_type_idx";

CREATE INDEX "transactions_userId_date_idx" ON "transactions"("userId", "date");
CREATE INDEX "transactions_userId_type_idx" ON "transactions"("userId", "type");
CREATE INDEX "transactions_userId_category_idx" ON "transactions"("userId", "category");
CREATE INDEX "transactions_userId_type_date_idx" ON "transactions"("userId", "type", "date");
CREATE INDEX "categories_userId_type_idx" ON "categories"("userId", "type");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
