// Asks for the Supabase values in YOUR terminal and writes .env.local (mode 600).
// Nothing is printed back or sent anywhere. Run:  node scripts/setup-env.mjs
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";

let muted = false;
const out = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });

const ask = (q, secret = false) =>
  new Promise((resolve) => {
    process.stdout.write(q);
    muted = secret;
    rl.question("", (a) => {
      muted = false;
      if (secret) process.stdout.write("\n");
      resolve(a.trim().replace(/^["']|["']$/g, ""));
    });
  });

const FIELDS = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    q: "1/6 URL del proyecto (https://xxxx.supabase.co): ",
    ok: (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v),
    hint: "Debe verse como https://abcdefgh.supabase.co (Settings > Data API).",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    q: "2/6 Clave PUBLICABLE (sb_publishable_... o anon eyJ...): ",
    secret: true,
    ok: (v) => /^(sb_publishable_|eyJ)/.test(v),
    hint: "Es la clave publicable (Settings > API Keys), NO la secreta.",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    q: "3/6 Clave SECRETA (sb_secret_... o service_role eyJ...): ",
    secret: true,
    ok: (v) => /^(sb_secret_|eyJ)/.test(v),
    hint: "Es la clave secreta (Settings > API Keys).",
  },
];

const existing = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
if (/^[A-Z_]+=.+$/m.test(existing)) {
  const a = await ask(".env.local ya tiene valores. ¿Reemplazarlo? (si/no): ");
  if (a.toLowerCase() !== "si") {
    console.log("Sin cambios.");
    rl.close();
    process.exit(0);
  }
  copyFileSync(".env.local", ".env.local.bak");
  chmodSync(".env.local.bak", 0o600);
  console.log("Copia anterior guardada en .env.local.bak");
}

const env = {};
for (const f of FIELDS) {
  for (;;) {
    const v = await ask(f.q, f.secret);
    if (f.ok(v)) {
      env[f.key] = v;
      break;
    }
    console.log("  Formato no válido. " + f.hint);
  }
}
if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("La clave publicable y la secreta son iguales. Revisa y vuelve a correr el asistente.");
  rl.close();
  process.exit(1);
}

const gen = await ask("4/6 PIN_PEPPER: Enter para generar uno nuevo (recomendado), o pega el tuyo: ", true);
if (gen === "") {
  env.PIN_PEPPER = randomBytes(32).toString("hex");
  console.log("  Generado (no se muestra). Guárdalo en tu gestor de contraseñas: si se pierde, hay que reiniciar todos los PIN.");
} else if (/^[0-9a-f]{64}$/.test(gen)) {
  env.PIN_PEPPER = gen;
} else {
  console.error("El pepper debe ser hexadecimal de 64 caracteres. Corre el asistente de nuevo.");
  rl.close();
  process.exit(1);
}

for (;;) {
  const v = await ask("5/6 HOUSE_CODE (frase de 8+ caracteres que les dices a tus amigos): ", true);
  if (v.length >= 8) {
    env.HOUSE_CODE = v;
    break;
  }
  console.log("  Mínimo 8 caracteres.");
}
for (;;) {
  const v = await ask("6/6 ADMIN_NAME (tu nombre de jugador, 3 a 16 letras/números): ");
  if (/^[\p{L}\p{N} _]{3,16}$/u.test(v)) {
    env.ADMIN_NAME = v;
    break;
  }
  console.log("  Entre 3 y 16 caracteres (letras, números, espacio o _).");
}

const lines = [
  "# Generado por scripts/setup-env.mjs. NO subir a ningún repositorio ni compartir.",
  `NEXT_PUBLIC_SUPABASE_URL=${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`,
  `PIN_PEPPER=${env.PIN_PEPPER}`,
  `HOUSE_CODE=${env.HOUSE_CODE}`,
  `ADMIN_NAME=${env.ADMIN_NAME}`,
  "",
];
writeFileSync(".env.local", lines.join("\n"), { mode: 0o600 });
chmodSync(".env.local", 0o600);
console.log("\n.env.local escrito (permisos 600). Reinicia `npm run dev` para que lo lea.");
console.log("Borra .env.local.txt si guardaste ahí tus claves: rm .env.local.txt");
rl.close();
