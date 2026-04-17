import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create tenants
  const tenant3SC = await prisma.tenant.upsert({
    where: { slug: '3sc' },
    update: {},
    create: {
      name: '3SC Solutions',
      slug: '3sc',
      domain: '3sc.com',
    },
  });

  const tenantClient = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      domain: 'acme.com',
    },
  });

  console.log('✅ Created tenants');

  // Hash password
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Create users
  const admin3SC = await prisma.user.upsert({
    where: { email: 'admin@3sc.com' },
    update: {},
    create: {
      email: 'admin@3sc.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMIN_3SC',
      tenantId: tenant3SC.id,
    },
  });

  const deliveryUser = await prisma.user.upsert({
    where: { email: 'support@3sc.com' },
    update: {},
    create: {
      email: 'support@3sc.com',
      passwordHash,
      firstName: 'Support',
      lastName: 'Agent',
      role: 'DELIVERY_USER',
      tenantId: tenant3SC.id,
    },
  });

  const clientAdmin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      passwordHash,
      firstName: 'Client',
      lastName: 'Admin',
      role: 'CLIENT_ADMIN',
      tenantId: tenantClient.id,
    },
  });

  console.log('✅ Created users');

  // Create SLA configuration for tenant
  await prisma.slaConfig.upsert({
    where: { tenantId: tenantClient.id },
    update: {},
    create: {
      tenantId: tenantClient.id,
      lowResponse: 480,
      lowResolution: 2880,
      mediumResponse: 240,
      mediumResolution: 1440,
      highResponse: 60,
      highResolution: 480,
      criticalResponse: 15,
      criticalResolution: 240,
    },
  });

  console.log('✅ Created SLA config');

  // Create sample tickets
  await prisma.ticket.createMany({
    skipDuplicates: true,
    data: [
      {
        title: 'Dashboard not loading data',
        description: 'The supply chain dashboard is showing blank charts for the last 3 days.',
        status: 'OPEN',
        priority: 'HIGH',
        category: 'BUG',
        tenantId: tenantClient.id,
        requesterId: clientAdmin.id,
        aiTriage: { category: 'DATA_ISSUE', confidence: 0.92 },
      },
      {
        title: 'Need help with API integration',
        description: 'Documentation is unclear on how to authenticate with the REST API.',
        status: 'OPEN',
        priority: 'MEDIUM',
        category: 'QUESTION',
        tenantId: tenantClient.id,
        requesterId: clientAdmin.id,
        aiTriage: { category: 'QUESTION', confidence: 0.88 },
      },
      {
        title: 'Feature request: Export to Excel',
        description: 'Would like to be able to export reports directly to Excel format.',
        status: 'OPEN',
        priority: 'LOW',
        category: 'FEATURE_REQUEST',
        tenantId: tenantClient.id,
        requesterId: clientAdmin.id,
        aiTriage: { category: 'FEATURE_REQUEST', confidence: 0.95 },
      },
    ],
  });

  console.log('✅ Created sample tickets');

  console.log('\n🎉 Seed completed!');
  console.log('\nLogin credentials:');
  console.log('  3SC Admin: admin@3sc.com / Password123!');
  console.log('  Support:   support@3sc.com / Password123!');
  console.log('  Client:    admin@acme.com / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
