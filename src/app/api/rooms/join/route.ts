import { ok, readJson, route } from "@/lib/server/http";
import { joinRoomService } from "@/lib/server/rooms";
import { realRoomDeps } from "@/lib/server/roomsSupabase";
import { requireUser } from "@/lib/server/supabase";
import { joinRoomMsg } from "@/lib/rooms/messages";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const msg = await readJson(req, joinRoomMsg);
  return ok(await joinRoomService(realRoomDeps(), id, msg));
});
