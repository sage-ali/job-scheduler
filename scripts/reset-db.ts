/**
 * Local development utility — drops and recreates the public schema, then runs all migrations.
 *
 * WARNING: destroys all data. Never run against production directly.
 * On the server this is triggered via the workflow_dispatch reset_db input in CI/CD.
 *
 * Usage:  pnpm db:reset
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'job_scheduler',
  entities: [],
  migrations: [__dirname + '/../src/database/migrations/*.{ts,js}'],
  synchronize: false,
});

async function main() {
  await ds.initialize();
  console.log('Connected to DB');

  await ds.query('DROP SCHEMA public CASCADE');
  await ds.query('CREATE SCHEMA public');
  console.log('Schema reset — all tables dropped');

  await ds.runMigrations();
  console.log('Migrations applied');

  await ds.destroy();
  console.log('Done — DB is clean and ready for seeding.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
