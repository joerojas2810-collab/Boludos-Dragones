// Replaces ONLY NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, after checking the key
// against your Supabase project. Run in YOUR terminal:  node scripts/fix-anon-key.mjs
// (Does not touch PIN_PEPPER, so existing accounts keep working.)
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";

let muted = false;
const out = new Writable({
  write(chunk, _e, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
const ask = (q) =>
  new Promise((res) => {
    process.stdout.write(q);
    muted = true;
    rl.question("", (a) => {
      muted = false;
      process.stdout.write("\n");
      res(a);
    });
  });

const file = ".env.local";
const text = readFileSync(file, "utf8");
const url = (text.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1] ?? "").trim();
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL falta o es inválida en .env.local.");
  process.exit(1);
}

console.log("Copia la clave PUBLICABLE (sb_publishable_...) desde Project Settings > API Keys.");
console.log("Pégala completa, sin espacios ni saltos de línea (no se mostrará).");
for (let i = 0; i < 3; i++) {
  // Remove ALL whitespace/quotes that a copy-paste may add.
  const key = (await ask("Clave publicable: ")).replace(/[\s"'`]/g, "");
  if (!/^(sb_publishable_|eyJ)/.test(key)) {
    console.log("  No parece una clave publicable (debe empezar por sb_publishable_ o eyJ). Reintenta.");
    continue;
  }
  let ok = false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    ok = r.status === 200;
    if (!ok) console.log(`  Supabase rechazó la clave (HTTP ${r.status}). Revisa que la copiaste ENTERA y que es la publicable.`);
  } catch (e) {
    console.log("  No se pudo contactar a Supabase:", e.message);
    break;
  }
  if (!ok) continue;
  const next = /^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m.test(text)
    ? text.replace(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m, () => `NEXT_PUBLIC_SUPABASE_ANON_KEY=${key}`)
    : text + `\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${key}\n`;
  writeFileSync(file, next, { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log("Clave válida y guardada. El servidor de desarrollo recarga .env.local solo.");
  rl.close();
  process.exit(0);
}
console.log("No se guardó nada.");
rl.close();
process.exit(1);
