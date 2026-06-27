// Seeds a single dev user with a known password so manual end-to-end testing
// against the live DB has predictable credentials. The password hash is
// computed at seed-time so the seed script remains portable.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? 'dev-password-1234';

const SEED_USER = {
  email: 'dev@citizen-shield.local',
  name: 'Dev User',
  role: 'USER' as const,
};

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: SEED_USER.email },
    update: { name: SEED_USER.name, role: SEED_USER.role, passwordHash },
    create: { ...SEED_USER, passwordHash },
  });

  console.log(`✓ Seeded user ${user.email} (${user.id})`);
  console.log(`  Login with password: ${DEV_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
