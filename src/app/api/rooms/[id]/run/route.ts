import { z } from "zod";
import { E, ok, route } from "@/lib/server/http";
import { runViewService } from "@/lib/server/rooms";
import { realRoomDeps } from "@/lib/server/roomsSupabase";
import { requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  route(async () => {
    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) throw E.badInput();
    const player = await requireUser();
    return ok(await runViewService(realRoomDeps(), player, id.data));
  })(req);
