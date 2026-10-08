// Client-only persistence of the Profile in localStorage.
// PLACEHOLDER for Supabase: once accounts exist the profile lives in the
// database and pulls / run banking MUST be resolved server-side (a client can
// edit localStorage freely, so nothing here is trustworthy).
import { newAccountProfile } from "./game/tutorial";
import { createProfile, migrate, type Profile } from "./game/profile";

export const PROFILE_KEY = "bd-profile-v2";

export type KV = Pick<Storage, "getItem" | "setItem">;

// Used when localStorage is blocked or unavailable (lives until page unload).
const mem = new Map<string, string>();
export const memoryStore: KV = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
};

export function defaultStore(): KV {
  try {
    const s = window.localStorage;
    s.getItem(PROFILE_KEY); // may throw when blocked
    return s;
  } catch {
    return memoryStore;
  }
}

export function loadProfile(store: KV = defaultStore()): Profile {
  try {
    const raw = store.getItem(PROFILE_KEY);
    return raw ? migrate(JSON.parse(raw)) : newAccountProfile();
  } catch {
    return createProfile();
  }
}

export function saveProfile(p: Profile, store: KV = defaultStore()): boolean {
  try {
    store.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
