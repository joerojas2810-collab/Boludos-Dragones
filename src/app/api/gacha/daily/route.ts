import { ok, readJson, route } from "@/lib/server/http";
import { call } from "@/lib/server/rpc";
import { doPull } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { dailyBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const { banner } = await readJson(req, dailyBody);
  const d = realDeps();
  // Day comes from the SQL clock (America/Argentina/Buenos_Aires), never the client.
  const { day } = await call<{ day: string }>(d.rpc, "game_clock", {});
  return ok(
    await doPull(
      d,
      id,
      { banner, count: 1, idempotencyKey: crypto.randomUUID() },
      true,
    ),
    { headers: { "X-Daily": day } },
  );
});
