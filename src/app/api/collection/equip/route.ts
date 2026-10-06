import { ApiError, ok, readJson, route } from "@/lib/server/http";
import { call, limit, mapRpcError } from "@/lib/server/rpc";
import { loadMe } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { canUseWeapon, isWeaponType } from "@/lib/game/weapons";
import { CLASS_IDS, type ClassId } from "@/lib/game/characters";
import { equipBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, equipBody);
  const { rpc } = realDeps();
  if (b.weaponId) {
    // ids are c-<class>-... / w-<type>-...
    const cls = b.characterId.split("-")[1] as ClassId;
    const type = b.weaponId.split("-")[1];
    if (
      !CLASS_IDS.includes(cls) ||
      !isWeaponType(type) ||
      !canUseWeapon(cls, type)
    )
      throw new ApiError(
        400,
        "weapon_not_allowed",
        "Esa clase no puede usar esa arma.",
      );
  }
  await limit(rpc, `equip:${id}`, 60, 60);
  try {
    if (b.weaponId)
      await call(rpc, "equip_weapon", {
        p_player: id,
        p_character_id: b.characterId,
        p_weapon_id: b.weaponId,
      });
    else
      await call(rpc, "unequip_weapon", {
        p_player: id,
        p_character_id: b.characterId,
        p_slot: b.slot ?? "arma",
      });
  } catch (e) {
    return mapRpcError(e);
  }
  return ok({ profile: (await loadMe(rpc, id)).profile });
});
