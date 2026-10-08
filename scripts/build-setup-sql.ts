// Concatenates supabase/migrations/*.sql (in order) into supabase/setup.sql, a
// single re-runnable script for the Supabase SQL Editor.
//   npx tsx scripts/build-setup-sql.ts           write supabase/setup.sql
//   npx tsx scripts/build-setup-sql.ts --check   exit 1 if setup.sql is stale
// Run from the project root.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const out = join(process.cwd(), "supabase", "setup.sql");

// 0018 re-locks EVERY function in public, so it must run after all the others
// (it keeps its old number: renaming a migration would break people who ran it).
const LAST = "0018_lockdown_functions.sql";
const all = readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const files = [...all.filter((f) => f !== LAST), ...all.filter((f) => f === LAST)];
if (files.length === 0) throw new Error(`no migrations in ${dir}`);

const body = files
  .map(
    (f) =>
      `-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8").trim()}\n`,
  )
  .join("\n");

const sql = `-- Boludos & Dragones: full database setup (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

${body}
commit;
`;

if (process.argv.includes("--check")) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== sql) {
    console.error(
      "supabase/setup.sql is out of date. Run: npx tsx scripts/build-setup-sql.ts",
    );
    process.exit(1);
  }
  console.log(`setup.sql is up to date (${files.length} migrations).`);
} else {
  writeFileSync(out, sql);
  console.log(`wrote supabase/setup.sql from ${files.join(", ")}`);
}
