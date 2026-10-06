import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { E } from "./http";
import type { Deps } from "./rpc";

let admin: SupabaseClient | null = null;
// Service-role client: bypasses RLS. Server only, never returned to clients.
export function adminClient(): SupabaseClient {
  const e = env();
  return (admin ??= createClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}

// Cookie-session client (publishable key). Used only to sign in/out and to
// verify the session: httpOnly cookies, so page scripts never read the token.
export async function sessionClient(): Promise<SupabaseClient> {
  const e = env();
  const store = await cookies();
  return createServerClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        },
      },
    },
  );
}

// Verified identity (getClaims checks the JWT signature, unlike getSession).
export async function requireUser(): Promise<string> {
  // No session cookie at all: 401 without touching Supabase or the env.
  if (!(await cookies()).getAll().some((c) => c.name.startsWith("sb-")))
    throw E.unauthorized();
  const sb = await sessionClient();
  const { data, error } = await sb.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated")
    throw E.unauthorized();
  return sub;
}

export function realDeps(): Deps {
  const sb = adminClient();
  return {
    rpc: (name, args) => sb.rpc(name, args),
    randomSeed: () => randomBytes(4).readUInt32BE(0),
    async openRunId(playerId) {
      const { data } = await sb
        .from("runs")
        .select("id")
        .eq("player_id", playerId)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
    async getRun(playerId, runId) {
      const { data } = await sb
        .from("runs")
        .select("seed, hero, status")
        .eq("player_id", playerId)
        .eq("id", runId)
        .maybeSingle();
      return data
        ? { seed: Number(data.seed), hero: data.hero, status: data.status }
        : null;
    },
  };
}
