/**
 * Build step: make sure tables added after the original database setup exist.
 *
 * The production database was not created purely from `prisma migrate`, so
 * `prisma migrate deploy` cannot be relied on. Instead, these idempotent SQL
 * files (CREATE ... IF NOT EXISTS) are executed directly on every build. They
 * only ever ADD tables, indexes and foreign keys; they never change or drop
 * existing data. A failure here never breaks the build: it is logged so the
 * SQL can be applied manually.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const FILES = [
  'prisma/migrations/20261126110000_add_admin_security_tables/migration.sql',
  'prisma/migrations/20261126120000_add_consultation_room/migration.sql',
];

if (!process.env.DATABASE_URL) {
  console.log('[ensure-db-tables] DATABASE_URL not set, skipping.');
  process.exit(0);
}

const prismaBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

for (const file of FILES) {
  const result = spawnSync(prismaBin, ['db', 'execute', '--file', file], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 60_000,
  });
  if (result.status === 0) {
    console.log(`[ensure-db-tables] applied ${file}`);
  } else {
    console.warn(`[ensure-db-tables] WARNING: could not apply ${file}. Run it manually with:`);
    console.warn(`  npx prisma db execute --file ${file}`);
  }
}
process.exit(0);
