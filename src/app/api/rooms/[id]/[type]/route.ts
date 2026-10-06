import { z } from "zod";
import { E, MAX_BODY_DEFAULT, MAX_BODY_RUN, ok, readJson, route } from "@/lib/server/http";
import { roomAction } from "@/lib/server/rooms";
import { realRoomDeps } from "@/lib/server/roomsSupabase";
import { requireUser } from "@/lib/server/supabase";
import { clientMsg } from "@/lib/rooms/messages";

export const runtime = "nodejs";

export const POST = (
  req: Request,
  ctx: { params: Promise<{ id: string; type: string }> },
) =>
  route(async () => {
    const { id: rawId, type } = await ctx.params;
    const id = z.uuid().safeParse(rawId);
    if (!id.success) throw E.badInput();
    const player = await requireUser();
    const msg = await readJson(
      req,
      clientMsg,
      type === "submit" ? MAX_BODY_RUN : MAX_BODY_DEFAULT,
    );
    if (msg.type !== type) throw E.badInput();
    return ok(await roomAction(realRoomDeps(), player, id.data, msg));
  })(req);
