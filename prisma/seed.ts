import 'dotenv/config';
import { PrismaClient, Prisma, type TransactionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Seeds a realistic three-month wallet history so the dashboard and the MCP
 * tools have something to show before the user records anything themselves.
 *
 * Safe to re-run: categories are upserted, and transactions are only inserted
 * when the table is empty.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
}

// Prisma 7 requires an explicit driver adapter.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CATEGORIES: Array<{ name: string; type: TransactionType | null; color: string; icon: string }> = [
  { name: 'Salary', type: 'INCOME', color: '#16a34a', icon: '💼' },
  { name: 'Freelance', type: 'INCOME', color: '#0ea5e9', icon: '🧑‍💻' },
  { name: 'Groceries', type: 'EXPENSE', color: '#f97316', icon: '🛒' },
  { name: 'Rent', type: 'EXPENSE', color: '#ef4444', icon: '🏠' },
  { name: 'Transport', type: 'EXPENSE', color: '#8b5cf6', icon: '🚌' },
  { name: 'Dining', type: 'EXPENSE', color: '#ec4899', icon: '🍜' },
  { name: 'Utilities', type: 'EXPENSE', color: '#64748b', icon: '💡' },
  { name: 'Entertainment', type: 'EXPENSE', color: '#eab308', icon: '🎬' },
];

/** Date `monthsAgo` months back, on `day`, at noon UTC. */
function dateAt(monthsAgo: number, day: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 12, 0, 0));
}

async function main() {
  const categoryIds = new Map<string, string>();

  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { name: category.name },
      update: { type: category.type, color: category.color, icon: category.icon },
      create: category,
    });
    categoryIds.set(saved.name, saved.id);
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);

  const existing = await prisma.transaction.count();
  if (existing > 0) {
    console.log(`Skipping transactions — table already has ${existing} row(s).`);
    return;
  }

  const rows: Array<[TransactionType, number, string, string, Date]> = [];

  for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
    rows.push(['INCOME', 4200, 'Salary', 'Monthly salary', dateAt(monthsAgo, 1)]);
    rows.push(['EXPENSE', 1450, 'Rent', 'Apartment rent', dateAt(monthsAgo, 2)]);
    rows.push(['EXPENSE', 138.42, 'Utilities', 'Electricity and water', dateAt(monthsAgo, 5)]);
    rows.push(['EXPENSE', 212.9, 'Groceries', 'Weekly shop', dateAt(monthsAgo, 7)]);
    rows.push(['EXPENSE', 64.15, 'Transport', 'Transit pass top-up', dateAt(monthsAgo, 9)]);
    rows.push(['EXPENSE', 48.7, 'Dining', 'Dinner out', dateAt(monthsAgo, 12)]);
    rows.push(['EXPENSE', 189.3, 'Groceries', 'Weekly shop', dateAt(monthsAgo, 14)]);
    rows.push(['EXPENSE', 15.99, 'Entertainment', 'Streaming subscription', dateAt(monthsAgo, 18)]);
    rows.push(['EXPENSE', 173.6, 'Groceries', 'Weekly shop', dateAt(monthsAgo, 21)]);
    rows.push(['EXPENSE', 32.4, 'Dining', 'Lunch with friends', dateAt(monthsAgo, 24)]);

    if (monthsAgo % 2 === 0) {
      rows.push(['INCOME', 850, 'Freelance', 'Side project invoice', dateAt(monthsAgo, 16)]);
    }
  }

  await prisma.transaction.createMany({
    data: rows.map(([type, amount, category, note, date]) => ({
      type,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      category,
      note,
      date,
      categoryId: categoryIds.get(category) ?? null,
    })),
  });

  console.log(`Seeded ${rows.length} transactions.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
