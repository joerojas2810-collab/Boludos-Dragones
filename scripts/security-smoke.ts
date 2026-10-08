// Black-box smoke attacks (docs/SEGURIDAD.md section 7) against a RUNNING server
// that you own. Usage: npx tsx scripts/security-smoke.ts http://localhost:3001
// Needs no credentials. Without Supabase env (modo local) the checks that need
// the backend print SKIP instead of PASS/FAIL.
const base = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");
const ownOrigin = new URL(base).origin;
let fails = 0;

type R = { status: number; body: unknown; headers: Headers };
async function hit(
  path: string,
  init: {
    method?: string;
    body?: string;
    origin?: string | null;
    extra?: Record<string, string>;
  } = {},
): Promise<R> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init.extra,
  };
  const o = init.origin === undefined ? ownOrigin : init.origin;
  if (o) headers.Origin = o;
  const res = await fetch(base + path, {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : (init.body ?? "{}"),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers };
}
function report(name: string, pass: boolean | "skip", detail = "") {
  if (!pass) fails++;
  console.log(
    `${pass === "skip" ? "SKIP" : pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`,
  );
}

async function main() {
  // 1. every authenticated route rejects anonymous calls with 401
  const authed: [string, string][] = [
    ["GET", "/api/me"],
    ["POST", "/api/gacha/pull"],
    ["POST", "/api/gacha/daily"],
    ["POST", "/api/collection/equip"],
    ["POST", "/api/run/start"],
    ["POST", "/api/run/submit"],
    ["POST", "/api/auth/admin-reset-pin"],
  ];
  for (const [method, path] of authed) {
    const r = await hit(path, { method });
    report(
      `anon ${method} ${path} -> 401`,
      r.status === 401,
      `got ${r.status}`,
    );
  }

  // 2. CSRF / origin
  for (const [label, o] of [
    ["foreign Origin", "https://evil.example"],
    ["missing Origin", null],
  ] as const) {
    const r = await hit("/api/gacha/pull", { origin: o });
    report(`${label} -> 403`, r.status === 403, `got ${r.status}`);
  }

  // 3. malformed / oversized bodies (public route, validated before any backend call)
  const bad = async (name: string, body: string, want: number) => {
    const r = await hit("/api/auth/login", { body });
    report(name, r.status === want, `got ${r.status}`);
  };
  await bad("malformed JSON -> 400", "{nope", 400);
  await bad(
    "unknown key -> 400",
    JSON.stringify({ name: "Ana", pin: "1234", admin: true }),
    400,
  );
  await bad(
    "short PIN -> 400",
    JSON.stringify({ name: "Ana", pin: "12" }),
    400,
  );
  await bad(
    "HTML in name -> 400",
    JSON.stringify({ name: "<img src=x>", pin: "1234" }),
    400,
  );
  await bad(
    "oversized body (100 KB) -> 413",
    JSON.stringify({ name: "Ana", pin: "1234", pad: "x".repeat(100_000) }),
    413,
  );

  // 4. headers
  const home = await fetch(base + "/");
  const h = home.headers;
  report(
    "CSP present with frame-ancestors none",
    (h.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
  );
  report(
    "X-Content-Type-Options nosniff",
    h.get("x-content-type-options") === "nosniff",
  );
  report("HSTS present", !!h.get("strict-transport-security"));
  report("Referrer-Policy present", !!h.get("referrer-policy"));
  report("Permissions-Policy present", !!h.get("permissions-policy"));
  report("no X-Powered-By", !h.get("x-powered-by"));
  const html = await home.text();
  report(
    "no secrets in HTML",
    !/sb_secret|PIN_PEPPER|service_role/i.test(html),
  );

  // 5. backend-dependent: register without house code, brute-force lockout
  const reg = await hit("/api/auth/register", {
    body: JSON.stringify({
      name: "Smoke Test",
      pin: "1234",
      houseCode: "wrong-code",
    }),
  });
  if (reg.status === 503)
    report(
      "register with wrong house code -> 403",
      "skip",
      "server not configured (modo local)",
    );
  else
    report(
      "register with wrong house code -> 403",
      reg.status === 403,
      `got ${reg.status}`,
    );

  const name = "smoke" + Math.floor(Math.random() * 1e6);
  const statuses: number[] = [];
  const messages = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const pin = String(1000 + i);
    const r = await hit("/api/auth/login", {
      body: JSON.stringify({ name, pin }),
    });
    statuses.push(r.status);
    if (r.status === 401) messages.add(JSON.stringify(r.body));
  }
  if (statuses[0] === 503)
    report(
      "25 bad logins -> lockout",
      "skip",
      "server not configured (modo local)",
    );
  else {
    report(
      "bad logins return one identical 401 message",
      messages.size === 1 && statuses[0] === 401,
      `${messages.size} variants`,
    );
    report(
      "lockout / wait kicks in (429) within 25 attempts",
      statuses.includes(429),
      statuses.join(","),
    );
    report(
      "after lockout every attempt stays 429",
      statuses.slice(statuses.indexOf(429)).every((s) => s === 429),
    );
  }
  console.log(
    fails ? `\n${fails} check(s) FAILED` : "\nall checks passed or skipped",
  );
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error("smoke error:", e instanceof Error ? e.message : e);
  process.exit(2);
});

export {};
