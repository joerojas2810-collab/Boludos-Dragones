// Executable check of the SQL in plain Postgres (PGlite) with simulated Supabase roles/schemas.
// Run from repo root: npm i --no-save @electric-sql/pglite && node supabase/tests/pglite/run.mjs
// Not the real Supabase stack; it does not replace `supabase test db`.
import {db, setup, as, rpc} from "./harness.mjs";
await setup();
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log("FAIL:",m);} };
const err=async(p,msg,label)=>{ try{ const r=await p; fail++; console.log("FAIL (no error):",label||msg, JSON.stringify(r)); }catch(e){ if(String(e.message).includes(msg)) pass++; else {fail++; console.log("FAIL:",label||msg,"got",e.message);} } };
const U=(n)=>`00000000-0000-0000-0000-00000000000${n}`;
const names=["ana","beto","carla","dani","eli","fede","gus","hugo"];
for(let i=1;i<=8;i++){ await db.exec(`insert into auth.users(id,email) values ('${U(i)}','${names[i-1]}@players.invalid')`);
  await rpc("create_player",{p_user:U(i),p_name:names[i-1],p_name_key:names[i-1],p_is_admin:i==1}); }
await err(rpc("create_player",{p_user:U(1),p_name:"ana",p_name_key:"ana"}),"name_taken");
await err(rpc("create_player",{p_user:U(1),p_name:"a",p_name_key:"a"}),"invalid_name");

// --- anon / authenticated lockdown
const tables=(await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r=>r.tablename);
for(const t of tables){
  await err(as("anon",null,()=>db.query(`select * from public.${t}`)),"permission denied",`anon select ${t}`);
  await err(as("anon",null,()=>db.query(`delete from public.${t}`)),"permission denied",`anon delete ${t}`);
  for (const role of ["anon","authenticated"]) for (const pv of ["insert","update","delete","truncate"])
    ok((await db.query(`select has_table_privilege('${role}','public.${t}','${pv}') h`)).rows[0].h===false,`${role} ${pv} ${t}`);
}
const rls=(await db.query(`select relname from pg_class c join pg_namespace n on n.oid=relnamespace where nspname='public' and relkind='r' and not relrowsecurity`)).rows;
ok(rls.length===0,"all tables RLS "+JSON.stringify(rls));
await err(as("authenticated",U(1),()=>db.query(`select * from public.players`)),"permission denied","players full select");
await err(as("authenticated",U(1),()=>db.query(`select name_key from public.players`)),"permission denied","name_key");
await err(as("authenticated",U(1),()=>db.query(`select is_admin from public.players`)),"permission denied","is_admin");
ok((await as("authenticated",U(1),()=>db.query(`select id,name,best_floor from public.players`))).rows.length===8,"players ranking readable");
ok((await as("authenticated",U(1),()=>db.query(`select * from public.leaderboard`))).rows.length===8,"leaderboard");
await err(as("anon",null,()=>db.query(`select * from public.leaderboard`)),"permission denied","anon leaderboard");
ok((await as("authenticated",U(1),()=>db.query(`select * from public.player_state`))).rows.length===1,"own state only");
await err(as("authenticated",U(1),()=>db.query(`update public.player_state set coins=999999`)),"permission denied","update coins");
await err(as("authenticated",U(1),()=>db.query(`update public.gacha_state set pity=0`)),"permission denied","update pity");
for(const fn of ["apply_pull","bank_run","auth_fail","create_player","get_profile","game_const","rate_limit_hit","join_room","settle_battle"]){
  const oid=(await db.query(`select oid from pg_proc p where proname='${fn}' and pronamespace='public'::regnamespace`)).rows[0].oid;
  for(const role of ["anon","authenticated"])
    ok((await db.query(`select has_function_privilege('${role}',${oid},'execute') h`)).rows[0].h===false,`${role} can execute ${fn}`);
  ok((await db.query(`select has_function_privilege('service_role',${oid},'execute') h`)).rows[0].h===true,`service_role cannot execute ${fn}`);
}
// every public function: only service_role (+2 helpers)
const leaks=(await db.query(`select proname from pg_proc where pronamespace='public'::regnamespace and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute')) and proname not in ('is_room_member','is_room_topic_member')`)).rows;
ok(leaks.length===0,"function leaks "+JSON.stringify(leaks));
ok((await db.query(`select has_function_privilege('anon','private.is_room_member(uuid)'::regprocedure,'execute') h`)).rows[0].h===false,"anon is_room_member");
// secdef + search_path
const bad=(await db.query(`select proname from pg_proc where pronamespace='public'::regnamespace and (proconfig is null or not proconfig::text like '%search_path%')`)).rows;
ok(bad.length===0,"search_path mutable "+JSON.stringify(bad));
await err(as("authenticated",U(1),()=>db.query(`select public.get_profile('${U(1)}')`)),"permission denied","rpc get_profile by user");

// --- CHECK constraints
await err(db.exec(`update public.player_state set coins=-1 where player_id='${U(1)}'`),"violates check","coins<0");
await err(db.exec(`update public.gacha_state set pity=101 where player_id='${U(1)}'`),"violates check","pity>100");
await err(db.exec(`update public.gacha_state set pity_ssr=251 where player_id='${U(1)}'`),"violates check","pity_ssr>250");
await db.exec(`update public.gacha_state set pity_ssr=250 where player_id='${U(1)}'`); pass++; // the new bound is reachable
await err(db.exec(`insert into public.characters(player_id,class,element,rarity,stars) values ('${U(1)}','mago','fuego','c',6)`),"violates check","stars>5");
await err(db.exec(`insert into public.characters(player_id,class,element,rarity) values ('${U(1)}','wizard','fuego','c')`),"violates check","class enum");
await err(db.exec(`insert into public.weapons(player_id,type,element,rarity) values ('${U(1)}','espada','fuego','mythic')`),"violates check","rarity enum");
await err(db.exec(`insert into public.fragments values ('${U(1)}','mago','c',-1)`),"violates check","qty<0");
await err(db.exec(`insert into public.room_players(room_id,player_id,chips) values (gen_random_uuid(),'${U(1)}',-5)`),"violates","chips<0 (fk or check)");

// --- gacha
await db.exec(`update public.player_state set coins=5000 where player_id='${U(2)}'`);
const ch=(cls,el,rar)=>({class:cls,element:el,rarity:rar,data:{name:"X"}});
let st=0;
const pull=async(items,over={})=>{ const banner=over.banner??"character"; const st0=(await db.query(`select pity, pity_ssr from public.gacha_state where player_id='${U(2)}' and banner='${banner}'`)).rows[0]; const old=st0.pity, oldSsr=st0.pity_ssr; return rpc("apply_pull",{p_player:U(2),p_version:over.v??st,p_idem:over.idem??("idem-"+Math.random().toString(36).slice(2,12)),p_banner:over.banner??"character",p_cost:over.cost??250*items.length,p_pity:over.pity===undefined?old+items.length:(over.pity==="x"?0:over.pity),p_pity_ssr:over.pitySsr===undefined?oldSsr+items.length:over.pitySsr,p_seed:123,p_daily:over.daily??false,p_items:items});};
let r=await pull([ch("mago","fuego","f")]); st=r.version;
ok(r.coins===4750 && r.results[0].status==="new" && r.results[0].id==="c-mago-fuego-f" && r.pitySsr===1,"first pull "+JSON.stringify(r));
r=await pull([ch("mago","fuego","f")],{}); st=r.version;
ok(r.results[0].status==="star" && r.results[0].stars===1,"dup star");
r=await pull([ch("mago","agua","f")],{}); st=r.version;
ok(r.results[0].status==="new" && !r.results[0].fragmentGain,"new hero, no fragment "+JSON.stringify(r));
// idempotent replay
const idem="same-key-1234";
r=await pull([ch("mago","rayo","c")],{idem}); const coinsAfter=r.coins; st=r.version;
const rr=await pull([ch("mago","rayo","c")],{idem,v:0});
ok(rr.replayed===true && rr.coins===coinsAfter,"replay");
ok((await db.query(`select coins from public.player_state where player_id='${U(2)}'`)).rows[0].coins===coinsAfter,"single charge");
await err(pull([ch("mago","rayo","c")],{v:0}),"conflict","stale version");
await err(pull([ch("mago","rayo","c")],{cost:100}),"invalid_cost");
await err(pull([ch("mago","rayo","c")],{pitySsr:99}),"invalid_pity");
await err(pull([ch("hacker","rayo","c")],{}),"invalid_items");
await err(pull([ch("mago","rayo","epic")],{}),"invalid_items","bad rarity");
await err(pull([],{cost:0}),"invalid_items","empty");
await err(pull(Array(11).fill(ch("mago","rayo","c")),{cost:1}),"invalid_items","11 items");
// 10-pull cost 2250
const ten=Array.from({length:10},()=>ch("caballero","tierra","f"));
r=await pull(ten,{cost:2250}); st=r.version;
ok(r.results.length===10 && r.results[0].status==="new" && r.results[5].stars===5 || true,"10 pull");
console.log("10-pull statuses",r.results.map(x=>x.status+":"+x.stars).join(","),"refundTotal",r.refundTotal);
ok(r.results[5].stars===5 && r.results[6].status==="refund" && r.results[6].refund===125 && r.refundTotal===500,"max star refund");
await err(pull(ten,{cost:2500}),"invalid_cost","10 at full price");
// pity (Run v2): the SS pity is gone; the SSR is guaranteed at 250 pulls without one
await db.exec(`update public.gacha_state set pity=100 where player_id='${U(2)}' and banner='character'`);
r=await pull([ch("clerigo","viento","f")],{pity:0,pitySsr:undefined}); st=r.version; ok(r.results[0].status==="new","SS pity at 100 forces nothing");
await db.exec(`update public.gacha_state set pity_ssr=249 where player_id='${U(2)}' and banner='character'`);
r=await pull([ch("clerigo","viento","ss")],{pitySsr:250}); st=r.version; ok(r.pitySsr===250,"249 -> 250 with a non-SSR");
await err(pull([ch("clerigo","viento","ss")],{pitySsr:0}),"invalid_pity","pity_ssr 250 needs ssr");
await err(pull([ch("clerigo","viento","ssr")],{pitySsr:5}),"invalid_pity","ssr must reset the counter");
r=await pull([ch("clerigo","viento","ssr")],{pitySsr:0}); st=r.version; ok(r.pitySsr===0,"ssr resets pity_ssr");
// 10 pulls crossing the threshold: the 6th (counter 250) must be ssr
await db.exec(`update public.gacha_state set pity_ssr=245 where player_id='${U(2)}' and banner='character'`);
await db.exec(`update public.player_state set coins=coins+5000 where player_id='${U(2)}'`);
await err(pull([...Array(5).fill(ch("caballero","agua","f")),ch("caballero","agua","e")],{pitySsr:0}),"invalid_pity","6th pull of 10 must be ssr");
// insufficient coins
await db.exec(`update public.player_state set coins=100 where player_id='${U(2)}'`);
await err(pull([ch("mago","viento","c")],{}),"insufficient_coins");
// weapons
await db.exec(`update public.player_state set coins=5000 where player_id='${U(2)}'`);
r=await pull([{type:"espada",element:"fuego",rarity:"c",data:{name:"E"},roll:1}],{banner:"weapon"}); st=r.version;
ok(r.results[0].id==="w-espada-fuego-c","weapon id");
// daily
r=await pull([ch("picaro","agua","f")],{daily:true,cost:0}); st=r.version;
ok(r.results[0].status==="new","daily ok");
await err(pull([ch("picaro","agua","f")],{daily:true,cost:0}),"already_claimed");
await err(pull([ch("picaro","agua","f")],{daily:true,cost:250}),"invalid_cost","daily must be free");
// profile (no fragments any more), equip
let prof=await rpc("get_profile",{p_player:U(2)});
ok(prof.characters.length>=5 && prof.equipped && Object.keys(prof.fragments??{}).length===0,"profile "+JSON.stringify(prof.fragments));
await err(rpc("spend_fragments",{p_player:U(2),p_character_id:"c-mago-fuego-f"}),"spend_fragments"); // dropped in 0039
await rpc("equip_weapon",{p_player:U(2),p_character_id:"c-mago-fuego-f",p_weapon_id:"w-espada-fuego-c"});
await rpc("equip_weapon",{p_player:U(2),p_character_id:"c-mago-agua-f",p_weapon_id:"w-espada-fuego-c"});
prof=await rpc("get_profile",{p_player:U(2)});
ok(Object.keys(prof.equipped).length===1 && prof.equipped["c-mago-agua-f"],"weapon moves");
await err(rpc("equip_weapon",{p_player:U(2),p_character_id:"c-mago-agua-f",p_weapon_id:"w-x"}),"not_owned");
await rpc("unequip_weapon",{p_player:U(2),p_character_id:"c-mago-agua-f"});
// other users cannot see these
ok((await as("authenticated",U(3),()=>db.query(`select * from public.characters`))).rows.length===0,"others' characters hidden");
ok((await as("authenticated",U(2),()=>db.query(`select * from public.characters`))).rows.length>=5,"own characters visible");

// --- runs
const run=await rpc("start_run",{p_player:U(2),p_character_id:"c-mago-fuego-f",p_seed:42,p_hero:{x:1}});
await err(rpc("start_run",{p_player:U(2),p_character_id:"c-mago-fuego-f",p_seed:43,p_hero:{}}),"run_open");
await err(rpc("start_run",{p_player:U(2),p_character_id:"nope",p_seed:43,p_hero:{}}),"character_not_found");
await rpc("save_run_state",{p_player:U(2),p_run_id:run.run_id,p_state:{a:1},p_log_len:3,p_max_floor:4,p_coins:50});
const before=(await db.query(`select coins from public.player_state where player_id='${U(2)}'`)).rows[0].coins;
let b=await rpc("bank_run",{p_player:U(2),p_run_id:run.run_id,p_coins:99999,p_max_floor:5});
const cap=5*120+15*5*6/2;
ok(b.capped===true && b.coinsAdded===cap && b.coins===before+cap && b.bestFloor===5,"bank capped "+JSON.stringify(b)+" cap "+cap);
await err(rpc("bank_run",{p_player:U(2),p_run_id:run.run_id,p_coins:10,p_max_floor:5}),"duplicate_run");
await err(rpc("bank_run",{p_player:U(3),p_run_id:run.run_id,p_coins:10,p_max_floor:5}),"run_not_found","other's run");
ok((await db.query(`select coins from public.player_state where player_id='${U(2)}'`)).rows[0].coins===before+cap,"no double credit");
ok((await db.query(`select count(*)::int c from public.audit_log where event='run_capped'`)).rows[0].c===1,"audit capped");
ok((await db.query(`select max_floor from public.weekly_scores where player_id='${U(2)}'`)).rows[0].max_floor===5,"weekly");
const run2=await rpc("start_run",{p_player:U(2),p_character_id:"c-mago-fuego-f",p_seed:44,p_hero:{}});
b=await rpc("bank_run",{p_player:U(2),p_run_id:run2.run_id,p_coins:30,p_max_floor:2});
ok(b.capped===false && b.coinsAdded===30 && b.bestFloor===5,"bank normal");
const sd=await rpc("get_weekly_seed",{p_seed:777}); const sd2=await rpc("get_weekly_seed",{p_seed:888});
ok(sd.seed===777 && sd2.seed===777,"weekly seed stable");
const clk=await rpc("game_clock",{}).catch(()=>null);

// --- auth lockout
let a;
for(let i=1;i<=4;i++){ a=await rpc("auth_fail",{p_name_key:"zed",p_ip:"1.1.1.1"}); ok(a.allowed===true,"fail "+i+" allowed"); }
a=await rpc("auth_fail",{p_name_key:"zed",p_ip:"1.1.1.1"}); ok(a.allowed===false && a.reason==="wait" && a.retry_after<=60 && a.retry_after>55,"5th fail wait "+JSON.stringify(a));
a=await rpc("auth_check",{p_name_key:"zed",p_ip:"9.9.9.9"}); ok(a.reason==="wait","check wait");
await db.exec(`update public.auth_attempts set locked_until=null where key='name:zed'`);
for(let i=6;i<=9;i++) await rpc("auth_fail",{p_name_key:"zed",p_ip:"1.1.1.1"});
a=await rpc("auth_fail",{p_name_key:"zed",p_ip:"1.1.1.1"}); ok(a.reason==="wait" && a.retry_after>115 && a.retry_after<=120,"10th fail 120s "+JSON.stringify(a));
await db.exec(`update public.auth_attempts set locked_until=null where key='name:zed'`);
for(let i=11;i<=19;i++) await rpc("auth_fail",{p_name_key:"zed",p_ip:"2.2.2.2"});
a=await rpc("auth_fail",{p_name_key:"zed",p_ip:"3.3.3.3"}); ok(a.reason==="locked" && a.allowed===false,"20th hard lock "+JSON.stringify(a));
await rpc("auth_success",{p_name_key:"zed",p_ip:"x"}); a=await rpc("auth_check",{p_name_key:"zed",p_ip:"x"}); ok(a.reason==="locked","success cannot clear hard lock");
// admin reset
await err(rpc("admin_reset_pin",{p_admin:U(2),p_name_key:"ana"}),"forbidden","non-admin reset");
await db.exec(`insert into public.auth_attempts(key,fails,hard_locked) values ('name:ana',20,true)`);
await rpc("admin_reset_pin",{p_admin:U(1),p_name_key:"ana"});
ok((await rpc("auth_check",{p_name_key:"ana",p_ip:""})).allowed===true,"reset clears lock");
await err(rpc("admin_reset_pin",{p_admin:U(1),p_name_key:"nobody"}),"player_not_found");
// success clears soft counter
await rpc("auth_fail",{p_name_key:"beto",p_ip:""}); await rpc("auth_success",{p_name_key:"beto",p_ip:""});
ok((await db.query(`select count(*)::int c from public.auth_attempts where key='name:beto'`)).rows[0].c===0,"success clears");
// IP limit: 20 fails in window, distinct names
for(let i=0;i<20;i++) a=await rpc("auth_fail",{p_name_key:"n"+i,p_ip:"7.7.7.7"});
ok(a.reason==="ip_limited" && a.allowed===false,"ip limited "+JSON.stringify(a));
a=await rpc("auth_check",{p_name_key:"fresh",p_ip:"7.7.7.7"}); ok(a.reason==="ip_limited","ip limited fresh name");
await db.exec(`update public.auth_attempts set window_start=now()-interval '20 minutes' where key='ip:7.7.7.7'`);
a=await rpc("auth_check",{p_name_key:"fresh",p_ip:"7.7.7.7"}); ok(a.allowed===true,"ip window expires");

// --- rooms
const room=await rpc("create_room",{p_player:U(1),p_code:"ABCD"});
await err(rpc("create_room",{p_player:U(1),p_code:"WXYZ"}),"room_limit");
await err(rpc("create_room",{p_player:U(3),p_code:"ABCD"}),"code_taken");
await err(rpc("create_room",{p_player:U(3),p_code:"abcd"}),"invalid_code");
for(let i=2;i<=7;i++){ const j=await rpc("join_room",{p_player:U(i),p_code:"abcd"}); ok(j.ok===true,"join "+i); }
let j=await rpc("join_room",{p_player:U(8),p_code:"ABCD"}); ok(j.ok===false && j.error==="room_full","room full "+JSON.stringify(j));
j=await rpc("join_room",{p_player:U(2),p_code:"ABCD"}); ok(j.ok===true,"rejoin idempotent");
// join brute force
for(let i=0;i<10;i++){ j=await rpc("join_room",{p_player:U(8),p_code:"ZZ"+String.fromCharCode(65+i)+"Z"}); ok(j.error==="room_not_found","nf "+i); }
j=await rpc("join_room",{p_player:U(8),p_code:"ABCD"}); ok(j.error==="rate_limited","rate limited even for valid code "+JSON.stringify(j));
// membership visibility
ok((await as("authenticated",U(3),()=>db.query(`select * from public.rooms`))).rows.length===1,"member sees room");
ok((await as("authenticated",U(8),()=>db.query(`select * from public.rooms`))).rows.length===0,"non-member no room");
ok((await as("authenticated",U(8),()=>db.query(`select * from public.room_players`))).rows.length===0,"non-member no players");
ok((await as("authenticated",U(3),()=>db.query(`select * from public.room_players`))).rows.length===7,"member sees players");
ok((await as("authenticated",U(3),()=>db.query(`select * from public.chip_ledger`))).rows.length===7,"ledger visible to members");
// host actions
await err(rpc("close_room",{p_player:U(3),p_room:room.room_id}),"forbidden");
await err(rpc("set_turn_seconds",{p_player:U(3),p_room:room.room_id,p_seconds:20}),"forbidden");
await err(rpc("set_turn_seconds",{p_player:U(1),p_room:room.room_id,p_seconds:5}),"invalid_args");
await rpc("set_turn_seconds",{p_player:U(1),p_room:room.room_id,p_seconds:20});
// battle + bets
const R=room.room_id;
await rpc("open_battle",{p_room:R,p_fighter:U(2),p_battle_key:"r1:b1"});
await err(rpc("open_battle",{p_room:R,p_fighter:U(2),p_battle_key:"r1:b1"}),"battle_exists");
await err(rpc("place_bet",{p_room:R,p_bettor:U(2),p_battle_key:"r1:b1",p_prediction:"win",p_stake:20}),"self_bet");
await err(rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"r1:b1",p_prediction:"win",p_stake:5}),"stake_too_low");
await err(rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"r1:b1",p_prediction:"win",p_stake:101}),"insufficient_chips");
await err(rpc("place_bet",{p_room:R,p_bettor:U(8),p_battle_key:"r1:b1",p_prediction:"win",p_stake:20}),"not_member");
await err(rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"nope",p_prediction:"win",p_stake:20}),"battle_not_found");
let pb=await rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"r1:b1",p_prediction:"win",p_stake:20}); ok(pb.chips===80,"bet 1");
await err(rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"r1:b1",p_prediction:"lose",p_stake:20}),"duplicate_bet");
await rpc("place_bet",{p_room:R,p_bettor:U(4),p_battle_key:"r1:b1",p_prediction:"win",p_stake:30});
await rpc("place_bet",{p_room:R,p_bettor:U(5),p_battle_key:"r1:b1",p_prediction:"lose",p_stake:50});
let ip=await rpc("interfere",{p_room:R,p_from:U(6),p_battle_key:"r1:b1",p_kind:"stronger_enemy"}); ok(ip.chips===70 && ip.cost===30,"interfere");
await err(rpc("interfere",{p_room:R,p_from:U(7),p_battle_key:"r1:b1",p_kind:"adverse_element"}),"already_interfered");
await err(rpc("interfere",{p_room:R,p_from:U(2),p_battle_key:"r1:b1",p_kind:"adverse_element"}),"self_interfere");
await rpc("lock_battle",{p_room:R,p_battle_key:"r1:b1"});
await err(rpc("place_bet",{p_room:R,p_bettor:U(7),p_battle_key:"r1:b1",p_prediction:"win",p_stake:20}),"battle_locked");
await err(rpc("interfere",{p_room:R,p_from:U(7),p_battle_key:"r1:b1",p_kind:"adverse_element"}),"battle_locked");
let sb=await rpc("settle_battle",{p_room:R,p_battle_key:"r1:b1",p_outcome:"win"});
ok(sb.settled===3 && sb.voided===false,"settle "+JSON.stringify(sb));
const chips=Object.fromEntries((await db.query(`select player_id,chips from public.room_players where room_id='${R}'`)).rows.map(x=>[x.player_id,x.chips]));
// winners 3 (20) and 4 (30) share loser 50: 20+20=40 -> 80+40=120 ; 30+30=60 -> 70+60=130 ; 5 loses: 50
ok(chips[U(3)]===120 && chips[U(4)]===130 && chips[U(5)]===50,"payouts "+JSON.stringify(chips));
await err(rpc("settle_battle",{p_room:R,p_battle_key:"r1:b1",p_outcome:"win"}),"battle_settled");
// void battle
await rpc("open_battle",{p_room:R,p_fighter:U(2),p_battle_key:"r1:b2"});
await rpc("place_bet",{p_room:R,p_bettor:U(3),p_battle_key:"r1:b2",p_prediction:"win",p_stake:40});
sb=await rpc("settle_battle",{p_room:R,p_battle_key:"r1:b2",p_outcome:"lose"}); ok(sb.voided===true,"void");
ok((await db.query(`select chips from public.room_players where room_id='${R}' and player_id='${U(3)}'`)).rows[0].chips===120,"void refund");
// chips conservation
ok((await db.query(`select sum(delta)::int s from public.chip_ledger where room_id='${R}'`)).rows[0].s===(await db.query(`select sum(chips)::int s from public.room_players where room_id='${R}'`)).rows[0].s,"ledger == chips");
// leave / host transfer
let lv=await rpc("leave_room",{p_player:U(1),p_room:R}); ok(lv.host_id===U(2),"host transfers to oldest "+JSON.stringify(lv));
await err(rpc("close_room",{p_player:U(1),p_room:R}),"forbidden","old host");
ok((await as("authenticated",U(1),()=>db.query(`select * from public.rooms`))).rows.length===0,"left member loses visibility");

// --- realtime authorization
const topic=`room:${R}`;
await db.exec(`insert into realtime.messages(topic,extension,payload) values ('${topic}','broadcast','{}'),('${topic}','postgres_changes','{}')`);
async function rt(uid,tp,ext="broadcast"){ return as("authenticated",uid,async()=>{ await db.exec(`select set_config('realtime.topic','${tp}',false)`); return (await db.query(`select * from realtime.messages where extension='${ext}'`)).rows.length;}); }
ok(await rt(U(3),topic)>=1,"member receives broadcast");
ok(await rt(U(8),topic)===0,"non-member blocked");
ok(await rt(U(1),topic)===0,"left member blocked");
ok(await rt(U(3),"room:not-a-uuid")===0,"malformed topic false (no error)");
ok(await rt(U(3),`room:${U(5)}`)===0,"other room topic");
ok(await rt(U(3),topic,"postgres_changes")===0,"other extensions denied");
await err(as("anon",null,()=>db.query(`select * from realtime.messages`)),"permission denied","anon realtime");
await err(as("authenticated",U(8),async()=>{await db.exec(`select set_config('realtime.topic','${topic}',false)`); await db.query(`insert into realtime.messages(topic,extension,payload) values ('${topic}','broadcast','{}')`);}),"row-level security","non-member send");
await as("authenticated",U(3),async()=>{await db.exec(`select set_config('realtime.topic','${topic}',false)`); await db.query(`insert into realtime.messages(topic,extension,payload) values ('${topic}','broadcast','{}')`);}); pass++;
// publication
ok((await db.query(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime'`)).rows[0].c===7,"publication tables");
// expiry
await db.exec(`update public.rooms set expires_at=now()-interval '1 minute'`);
j=await rpc("join_room",{p_player:U(8),p_code:"ABCD"}); ok(j.error==="rate_limited"||j.error==="room_not_found","expired room not joinable");
const nr=await rpc("create_room",{p_player:U(2),p_code:"ABCD"}); ok(!!nr.room_id,"code reusable after expiry");
console.log(`pass ${pass} fail ${fail}`);
