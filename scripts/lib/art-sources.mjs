// Shared by the phase-2 art importers: finds a delivered file in any of the split
// "Proyecto de Juego*" Drive folders (a lot can be spread over several).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function lotRoots(base, lot) {
  const out = [];
  for (const d of readdirSync(base)) {
    const p = join(base, d);
    if (!statSync(p).isDirectory()) continue;
    if (d.startsWith("Proyecto de Juego")) out.push(join(p, "art", `phase_2_${lot}`));
    if (d === `phase_2_${lot}`) out.push(p);
  }
  return out.filter(existsSync);
}

// Returns find(rel) -> absolute path or null (first root that has it).
export function finder(base, lot) {
  const roots = lotRoots(base, lot);
  return (rel) => roots.map((r) => join(r, rel)).find(existsSync) ?? null;
}

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
