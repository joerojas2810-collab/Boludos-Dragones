import { ok, readJson, route } from "@/lib/server/http";
import { doChooseSkill } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { skillBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, skillBody);
  return ok(await doChooseSkill(realDeps(), id, b.characterId, b.skillId));
});
