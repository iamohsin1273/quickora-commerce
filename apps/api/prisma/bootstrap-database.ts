import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const databaseUrl = required("DATABASE_URL");
const databaseName = required("DATABASE_NAME");
const adminPassword = required("DATABASE_ADMIN_PASSWORD");
const migratorPassword = required("MIGRATOR_DATABASE_PASSWORD");
const appPassword = required("APP_DATABASE_PASSWORD");
const ca = await readFile(required("DATABASE_CA_CERT"), "utf8");

const client = new Client({
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: required("DATABASE_NAME"),
  user: required("DATABASE_ADMIN_USERNAME"),
  password: adminPassword,
  ssl: { rejectUnauthorized: true, ca }
});

let connected = false;
try {
  await client.connect();
  connected = true;
  for (const [role, password] of [
    ["quickora_migrator", migratorPassword],
    ["quickora_app", appPassword]
  ]) {
    const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE ROLE ${sqlIdentifier(role)} LOGIN PASSWORD ${sqlLiteral(password)}`);
    }
  }
  await client.query(`ALTER ROLE "quickora_migrator" WITH LOGIN PASSWORD ${sqlLiteral(migratorPassword)}`);
  await client.query(`ALTER ROLE "quickora_app" WITH LOGIN PASSWORD ${sqlLiteral(appPassword)}`);
  await client.query(`REVOKE ALL ON DATABASE ${sqlIdentifier(databaseName)} FROM PUBLIC`);
  await client.query(`GRANT CONNECT ON DATABASE ${sqlIdentifier(databaseName)} TO "quickora_migrator"`);
  await client.query(`GRANT CONNECT ON DATABASE ${sqlIdentifier(databaseName)} TO "quickora_app"`);
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query('GRANT ALL ON SCHEMA public TO "quickora_migrator"');
  await client.query('GRANT USAGE ON SCHEMA public TO "quickora_app"');
  console.info("Database roles and privileges are ready.");
} finally {
  if (connected) await client.end();
}

const migrator = new Client({
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: databaseName,
  user: "quickora_migrator",
  password: migratorPassword,
  ssl: { rejectUnauthorized: true, ca }
});

let migratorConnected = false;
try {
  await migrator.connect();
  migratorConnected = true;
  await migrator.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "quickora_app"'
  );
  await migrator.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "quickora_app"'
  );
} finally {
  if (migratorConnected) await migrator.end();
}

const migration = spawnSync("npm", ["run", "db:migrate", "-w", "@quickora/api"], {
  cwd: "/app",
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: "inherit"
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);
