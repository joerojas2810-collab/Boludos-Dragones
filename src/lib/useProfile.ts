"use client";

import { useEffect, useSyncExternalStore } from "react";
import { TUTORIAL_DONE, type Profile } from "./game/profile";
import { loadProfile, PROFILE_KEY, saveProfile } from "./profileStorage";
import { selectRepo, type ProfileRepo } from "./repo";

export interface Session {
  status: "loading" | "anon" | "user";
  name: string;
  isAdmin: boolean;
}
interface State {
  profile: Profile | null;
  session: Session;
  notice: string | null; // last server rejection, shown until dismissed
}

// Module-level store shared by every component (and by non-React callers such
// as the run page unmount cleanup). The server snapshot has no profile, so
// nothing profile-dependent renders until mounted: no hydration mismatch.
const SERVER_STATE: State = {
  profile: null,
  session: { status: "loading", name: "", isAdmin: false },
  notice: null,
};
let state: State | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const set = (s: State) => {
  state = s;
  notify();
};

// DEV only: `?dev_coins=5000` adds coins once per page load (local mode).
function devCoins(): number {
  if (process.env.NODE_ENV === "production") return 0;
  const n = Number(new URLSearchParams(location.search).get("dev_coins"));
  return Number.isFinite(n) && n > 0 ? Math.min(1_000_000, Math.floor(n)) : 0;
}

const isRemote = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL;

// Remote profiles come from the server on every call and carry no tutorial field, so the step
// lives in this browser, per account. First time: accounts with heroes start at "level 1"
// (autoAdvance skips what they already did); empty accounts start at "pull" (no free starter hero).
// ponytail: per browser, not synced across devices; move to a profile column if that matters.
const tutKey = (name: string) => `bd-tutorial:${name}`;
function withTutorial(p: Profile, name: string): Profile {
  if (!isRemote() || !name) return p;
  let step = TUTORIAL_DONE; // storage blocked: don't nag on every load
  try {
    const raw = localStorage.getItem(tutKey(name));
    step = raw === null ? (p.characters.length ? 1 : 4) : Number(raw);
    if (raw === null) localStorage.setItem(tutKey(name), String(step));
  } catch {}
  return { ...p, tutorial: Number.isFinite(step) ? step : TUTORIAL_DONE };
}
const replaceWith = (p: Profile) =>
  set({ ...ensure(), profile: withTutorial(p, ensure().session.name) });

export const repo: ProfileRepo = selectRepo(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  {
    get: () => ensure().profile as Profile,
    update: (fn) => updateProfile(fn),
    replace: replaceWith,
  },
);

export const replaceProfile = replaceWith;

function ensure(): State {
  if (!state) {
    if (isRemote()) state = SERVER_STATE;
    else {
      let p = loadProfile();
      const extra = devCoins();
      if (extra) {
        p = { ...p, coins: p.coins + extra };
        saveProfile(p);
      }
      state = {
        profile: p,
        session: { status: "user", name: "Local", isAdmin: false },
        notice: null,
      };
    }
  }
  return state;
}

export function updateProfile(fn: (p: Profile) => Profile) {
  const s = ensure();
  if (!s.profile) return;
  const next = fn(s.profile);
  if (next === s.profile) return;
  if (!isRemote()) saveProfile(next); // remote: in-memory cache only
  else if (next.tutorial !== s.profile.tutorial && s.session.name)
    try {
      localStorage.setItem(tutKey(s.session.name), String(next.tutorial ?? TUTORIAL_DONE));
    } catch {}
  set({ ...s, profile: next });
}

export const pushNotice = (notice: string | null) =>
  set({ ...ensure(), notice });

let bootstrapped = false;
async function bootstrap() {
  if (bootstrapped || !isRemote()) return;
  bootstrapped = true;
  try {
    const me = await repo.load();
    set(
      me
        ? {
            profile: withTutorial(me.profile, me.name),
            session: { status: "user", name: me.name, isAdmin: me.isAdmin },
            notice: ensure().notice,
          }
        : {
            profile: null,
            session: { status: "anon", name: "", isAdmin: false },
            notice: null,
          },
    );
  } catch {
    bootstrapped = false; // network blip: retry on next mount
  }
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.href = "/login"; // full reload resets the module store
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (isRemote() || e.key !== PROFILE_KEY) return;
    set({ ...ensure(), profile: loadProfile() }); // another tab saved
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useProfile() {
  const s = useSyncExternalStore(subscribe, ensure, () => SERVER_STATE);
  useEffect(() => {
    void bootstrap();
  }, []);
  useEffect(() => {
    // full reload on purpose: resets the module-level store
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    // AppShell calls this hook on /login too: redirecting from there is a reload loop.
    if (s.session.status === "anon" && location.pathname !== "/login")
      location.href = "/login";
  }, [s.session.status]);
  return {
    profile: s.profile,
    session: s.session,
    notice: s.notice,
    update: updateProfile,
    ready: s.profile !== null,
  };
}
