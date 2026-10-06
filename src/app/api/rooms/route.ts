import { ok, readJson, route } from "@/lib/server/http";
import { createRoomService } from "@/lib/server/rooms";
import { realRoomDeps } from "@/lib/server/roomsSupabase";
import { requireUser } from "@/lib/server/supabase";
import { createRoomMsg } from "@/lib/rooms/messages";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const msg = await readJson(req, createRoomMsg);
  return ok(await createRoomService(realRoomDeps(), id, msg));
});
