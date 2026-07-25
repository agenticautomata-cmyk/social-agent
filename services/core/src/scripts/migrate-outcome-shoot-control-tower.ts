import postgres from 'postgres';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';

async function main() {
  const db = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(db, {
      id: '65',
      file: '65_outcome_shoot_control_tower.sql',
      label: 'outcome engine shoot sessions worker heartbeats',
    });
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Outcome/shoot/control tower migration failed:', err);
  process.exit(1);
});
