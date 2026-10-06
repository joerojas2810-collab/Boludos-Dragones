// Room API smoke test against a RUNNING dev server with real Supabase.
// Usage: SMOKE_A=name:1234 SMOKE_B=name2:5678 npx tsx scripts/rooms-smoke.ts http://localhost:3001
// Needs two EXISTING test accounts. Creates one room and closes it at the end.
const base = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");
const origin = new URL(base).origin;
let fails = 0;
const check = (name: string, pass: boolean, detail = "") => {
  if (!pass) fails++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};

type Res = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, o = origin): Promise<Res> {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: o,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (set.length) this.cookie = set.join("; ");
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Res["body"] };
  }
  async login(cred: string) {
    const [name, pin] = cred.split(":");
    return this.req("POST", "/api/auth/login", { name, pin });
  }
}

async function main() {
  const [a, b] = [process.env.SMOKE_A, process.env.SMOKE_B];
  if (!a || !b) throw new Error("Set SMOKE_A and SMOKE_B as name:pin");
  const anon = new Client();
  const A = new Client();
  const B = new Client();
  const fake = "00000000-0000-4000-8000-000000000000";

  check("anon GET snapshot -> 401", (await anon.req("GET", `/api/rooms/${fake}`)).status === 401);
  check("anon POST create -> 401", (await anon.req("POST", "/api/rooms", { v: 1, type: "create" })).status === 401);
  check("login A", (await A.login(a)).status === 200);
  check("login B", (await B.login(b)).status === 200);
  check(
    "foreign Origin -> 403",
    (await A.req("POST", "/api/rooms", { v: 1, type: "create" }, "https://evil.example")).status === 403,
  );
  check("bad body -> 400", (await A.req("POST", "/api/rooms", { v: 1, type: "create", x: 1 })).status === 400);
  check("bad id -> 400", (await A.req("GET", "/api/rooms/nope")).status === 400);

  const made = await A.req("POST", "/api/rooms", { v: 1, type: "create" });
  check("create room", made.status === 200 && made.body.code?.length === 4, JSON.stringify(made.body.error ?? ""));
  const room = made.body.roomId as string;
  const m = (type: string, extra: object = {}) => ({ v: 1, room, type, ...extra });

  check("B non-member snapshot -> 403", (await B.req("GET", `/api/rooms/${room}`)).status === 403);
  const joined = await B.req("POST", "/api/rooms/join", { v: 1, type: "join", code: made.body.code });
  check("B join", joined.status === 200 && joined.body.roomId === room);
  check("B join again (reentry)", (await B.req("POST", "/api/rooms/join", { v: 1, type: "join", code: made.body.code })).status === 200);
  check("bad code -> 404", (await B.req("POST", "/api/rooms/join", { v: 1, type: "join", code: "ZZZQ" })).status === 404);

  const snap = await A.req("GET", `/api/rooms/${room}`);
  check("snapshot 2 players", snap.status === 200 && snap.body.players?.length === 2 && snap.body.state.phase === "lobby");
  check("path/body type mismatch -> 400", (await A.req("POST", `/api/rooms/${room}/ready`, m("hero", { heroId: "seed_default" }))).status === 400);
  check("B start_round -> 403", (await B.req("POST", `/api/rooms/${room}/start_round`, m("start_round"))).status === 403);
  check("B heartbeat", (await B.req("POST", `/api/rooms/${room}/heartbeat`, m("heartbeat", { present: true }))).status === 200);
  check("A hero", (await A.req("POST", `/api/rooms/${room}/hero`, m("hero", { heroId: "seed_default" }))).status === 200);
  check("B hero", (await B.req("POST", `/api/rooms/${room}/hero`, m("hero", { heroId: "seed_default" }))).status === 200);
  const start = await A.req("POST", `/api/rooms/${room}/start_round`, m("start_round"));
  check("A start_round", start.status === 200 && start.body.state?.phase === "round_setup", JSON.stringify(start.body.error ?? ""));
  const seq = start.body.state?.phaseSeq as number;
  check("advance stale", (await B.req("POST", `/api/rooms/${room}/advance`, m("advance", { phaseSeq: seq - 1 }))).body.reason === "stale");
  const adv = await B.req("POST", `/api/rooms/${room}/advance`, m("advance", { phaseSeq: seq }));
  check("advance (heroes chosen)", adv.status === 200 && adv.body.advanced === true, JSON.stringify(adv.body));
  const run = await A.req("GET", `/api/rooms/${room}/run`);
  check("GET run", run.status === 200 && run.body.floor === 1 && Array.isArray(run.body.doors));
  check("summary before end -> 409", (await A.req("GET", `/api/rooms/${room}/summary`)).status === 409);
  check("A close", (await A.req("POST", `/api/rooms/${room}/close`, m("close"))).status === 200);
  check("closed room: advance -> 409", (await B.req("POST", `/api/rooms/${room}/advance`, m("advance", { phaseSeq: 0 }))).status === 409);

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
export {};
