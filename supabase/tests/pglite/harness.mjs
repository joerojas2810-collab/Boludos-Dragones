import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { fileURLToPath } from "url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create schema realtime; create table realtime.messages(id bigserial primary key, topic text, extension text, payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true),'') $$;
create publication supabase_realtime;
grant usage on schema public, auth, realtime to anon, authenticated, service_role;
grant select on realtime.messages to authenticated; grant insert on realtime.messages to authenticated;
grant select on auth.users to service_role; grant usage on all sequences in schema realtime to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
export async function setup(file="setup.sql"){ await db.exec(fs.readFileSync(root+file,"utf8")); }
export async function as(role, uid, fn){
  await db.exec(`set role ${role}`);
  if (uid) await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`); else await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
  try { return await fn(); } finally { await db.exec(`reset role`); }
}
export async function rpc(name, args){ // service_role call
  const keys = Object.keys(args);
  const sql = `select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(",")}) as r`;
  const params = keys.map(k=>{const v=args[k]; return v!==null&&typeof v==='object'?JSON.stringify(v):v;});
  return as("service_role", null, async()=> (await db.query(sql, params)).rows[0].r);
}
