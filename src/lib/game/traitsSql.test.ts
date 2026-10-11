import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRAIT_IDS } from "./traits";

const root = process.cwd();
const migration = join(root, "supabase/migrations/0054_hero_factors.sql");
const generated = [
  join(root, "supabase/setup.sql"),
  ...readdirSync(join(root, "supabase"))
    .filter((file) => /^upgrade_from_\d+\.sql$/.test(file))
    .map((file) => join(root, "supabase", file))
    .filter((path) => readFileSync(path, "utf8").includes("0054_hero_factors.sql")),
];

function sqlTraitIds(path: string): string[] {
  const sql = readFileSync(path, "utf8");
  const body = sql.match(
    /create or replace function public\.hero_trait_valid\b[\s\S]*?select p_trait = any\(array\[([^\]]*)\]\)/i,
  )?.[1];
  expect(body, `hero_trait_valid allowlist missing from ${path}`).toBeDefined();
  return [...body!.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("SQL hero trait allowlist", () => {
  it("matches TRAIT_IDS in the migration and generated SQL", () => {
    const expected = [...TRAIT_IDS].sort();
    for (const path of [migration, ...generated]) {
      expect(sqlTraitIds(path).sort(), path).toEqual(expected);
    }
  });

  it("leaves the explicit progress reset outside migration 0054", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).not.toMatch(/^\s*delete\s+from\s+public\.characters\s*;/im);
    expect(sql).toContain("Run reset_progress.sql before this migration");
    for (const path of generated) {
      expect(readFileSync(path, "utf8")).toContain(
        "Run reset_progress.sql before this migration",
      );
    }
  });
});
