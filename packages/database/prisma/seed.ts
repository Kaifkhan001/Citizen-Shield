import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_USER = {
  email: 'dev@citizen-shield.local',
  name: 'Dev User',
  role: 'USER' as const,
};

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: SEED_USER.email },
    update: { name: SEED_USER.name, role: SEED_USER.role },
    create: SEED_USER,
  });
  console.log(`✓ Seeded user ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
