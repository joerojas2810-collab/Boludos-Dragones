import { ok, readJson, route } from "@/lib/server/http";
import { doFuseHeroes } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { fuseHeroesBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, fuseHeroesBody);
  return ok(await doFuseHeroes(realDeps(), id, b.baseId, b.materials, b.keep));
});
