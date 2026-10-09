"use client";

import { useMemo, useState } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { CLASSES } from "@/lib/game/characters";
import { FUSION_STARS, HERO_FUSION, fuseHeroes } from "@/lib/game/heroFusion";
import { heroPower, type OwnedCharacter, type Profile } from "@/lib/game/profile";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import { characterView } from "@/lib/viewModels";

// Ascender héroes: a self-contained, guided panel (rank -> base hero -> materials -> result).
export function HeroFusionPanel({
  profile,
  busy,
  onFuse,
}: {
  profile: Profile;
  busy: boolean;
  onFuse: (baseId: string, materialIds: string[]) => void;
}) {
  const byRank = (r: RarityId) => profile.characters.filter((c) => c.rarity === r);
  // Only ranks that can ascend now: enough heroes and a base with the needed stars.
  const ranks = RARITY_IDS.filter(
    (r) => HERO_FUSION[r] && byRank(r).length >= HERO_FUSION[r]!.ratio && byRank(r).some((c) => c.stars >= FUSION_STARS),
  );
  const [picker, setRank] = useState<RarityId | null>(null);
  const rank = picker && ranks.includes(picker) ? picker : (ranks[0] ?? "f");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [mats, setMats] = useState<string[]>([]);

  const rule = HERO_FUSION[rank]!;
  const need = rule.ratio - 1; // materials, the base is one more
  const pool = useMemo(
    () => byRank(rank).sort((a, b) => heroPower(profile, a.id) - heroPower(profile, b.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, rank],
  );
  const base = pool.find((c) => c.id === baseId) ?? null;
  const picked = mats.filter((id) => id !== baseId && pool.some((c) => c.id === id));
  const next = RARITY_IDS[RARITY_IDS.indexOf(rank) + 1];

  const dry = base && picked.length === need ? fuseHeroes(profile, { baseId: base.id, materialIds: picked }) : null;
  const result =
    dry?.ok === true ? (dry.profile.characters.find((c) => c.id === (dry.fusion.hero?.id ?? dry.fusion.starTo)) ?? null) : null;
  const invested = picked
    .map((id) => pool.find((c) => c.id === id))
    .filter((c): c is OwnedCharacter => !!c && (c.stars > 0 || c.level > 1));

  const pickRank = (r: RarityId) => {
    setRank(r);
    setBaseId(null);
    setMats([]);
  };
  const toggle = (id: string) =>
    setMats(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < need ? [...picked, id] : picked);
  // The weakest heroes of the rank (never the base, never ones with stars if avoidable).
  const autoPick = () => {
    const others = pool.filter((c) => c.id !== baseId);
    const plain = others.filter((c) => c.stars === 0 && c.level <= 1);
    const rest = others.filter((c) => !plain.includes(c));
    setMats([...plain, ...rest].slice(0, need).map((c) => c.id));
  };

  const status = !base
    ? "Elige el héroe base."
    : picked.length < need
      ? `Faltan ${need - picked.length} héroes de material.`
      : dry && !dry.ok
        ? dry.error
        : null;

  return (
    <Panel title="Ascender héroes" className="space-y-3">
      <div className="space-y-1 border-2 border-yellow-300/50 bg-yellow-300/10 p-2 text-sm">
        <p>
          <b className="text-yellow-300">Qué hace:</b> junta varios héroes del <b>mismo rango</b> en
          <b> uno solo de rango mayor</b>.
        </p>
        <p>
          Eliges un héroe <b>base</b> (el que quieres conservar) y se gastan otros del mismo rango. Cuántos hacen falta y cuántas monedas
          cuesta lo ves en el paso 1.
        </p>
        <p>
          El base <b>conserva</b> clase, elemento, nombre, nivel, habilidad y rasgos, y <b>gana</b> los rasgos del rango nuevo.{" "}
          <b>Necesita {FUSION_STARS}★ y las gasta</b>: con 4★ le queda 1★, con 5★ le quedan 2★. Los héroes de material se pierden (su equipo
          vuelve a tu colección).
        </p>
        <p className="opacity-80">Si ya tienes a ese héroe en el rango nuevo, en vez de crear otro le suma 1 estrella.</p>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-yellow-300">1. ¿De qué rango?</h4>
        <div className="flex flex-wrap gap-1.5">
          {ranks.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rank === r}
              className={`btn text-center text-sm ${rank === r ? "" : "btn-gray"}`}
              onClick={() => pickRank(r)}
            >
              {RARITIES[r].label} {byRank(r).length}/{HERO_FUSION[r]!.ratio}
            </button>
          ))}
        </div>
        <p className="text-xs opacity-80">
          Rango {RARITIES[rank].label} → {RARITIES[next].label}: <b>{rule.ratio} héroes</b> (el base + {need} más) y{" "}
          <b>{rule.coins} monedas</b>.
        </p>
      </div>

      {ranks.length === 0 ? (
        <p className="text-sm text-red-300">
          No puedes ascender ningún héroe todavía: necesitas varios del mismo rango y uno con {FUSION_STARS}★. Consíguelos en el gacha.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-yellow-300">2. Elige el héroe base: el que se queda (necesita {FUSION_STARS}★)</h4>
            {
              <HeroGrid
                heroes={pool.filter((c) => c.stars >= FUSION_STARS)}
                isOn={(c) => c.id === baseId}
                onPick={(c) => {
                  setBaseId(c.id);
                  setMats((m) => m.filter((x) => x !== c.id));
                }}
              />
            }
          </div>

          <div className="space-y-1.5">
            <h4 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-yellow-300">
              <span>
                3. Elige {need} héroes de material ({picked.length}/{need})
              </span>
              <span className="flex gap-1.5">
                <button type="button" className="btn btn-gray !min-h-8 text-center text-xs" disabled={!base} onClick={autoPick}>
                  Elegir los más débiles
                </button>
                <button type="button" className="btn btn-gray !min-h-8 text-center text-xs" onClick={() => setMats([])}>
                  Limpiar
                </button>
              </span>
            </h4>
            {base ? (
              <HeroGrid heroes={pool.filter((c) => c.id !== baseId)} isOn={(c) => picked.includes(c.id)} onPick={(c) => toggle(c.id)} />
            ) : (
              <p className="text-sm opacity-80">Primero elige el héroe base.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-yellow-300">4. Resultado</h4>
            {result && dry?.ok ? (
              <div className="flex items-center gap-3 border-2 border-yellow-300/60 bg-yellow-300/10 p-2 text-sm">
                <ItemCard item={characterView(result)} size={88} />
                <div className="space-y-1">
                  <div className="font-semibold text-yellow-300">
                    {result.name} · {CLASSES[result.classId].name}
                  </div>
                  <div>
                    {dry.fusion.starTo
                      ? `Ya lo tenías en rango ${RARITIES[result.rarity].label}: sube a ${result.stars}★.`
                      : `Rango ${RARITIES[rank].label} → ${RARITIES[result.rarity].label}, queda con ${result.stars}★.`}
                  </div>
                  {dry.fusion.addedTraits.length > 0 && (
                    <div className="opacity-90">Gana {dry.fusion.addedTraits.length} rasgo(s) nuevo(s) al ascender.</div>
                  )}
                  <div>
                    Gastas {rule.ratio - 1} héroes y {rule.coins} monedas.
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm opacity-80">Aquí verás cómo queda el héroe antes de ascender.</p>
            )}
            {invested.length > 0 && (
              <p className="text-sm text-amber-300">
                ⚠ Entre los materiales hay héroes con estrellas o nivel ({invested.map((c) => c.name).join(", ")}): se pierden.
              </p>
            )}
            {status ? <p className="text-sm text-red-300">{status}</p> : <p className="text-sm text-green-300">Listo para ascender.</p>}
          </div>

          <button className="btn w-full" disabled={busy || !!status} onClick={() => base && onFuse(base.id, picked)}>
            Ascender héroes
          </button>
        </>
      )}
    </Panel>
  );
}

function HeroGrid({
  heroes,
  isOn,
  isOff,
  onPick,
}: {
  heroes: OwnedCharacter[];
  isOn: (c: OwnedCharacter) => boolean;
  isOff?: (c: OwnedCharacter) => boolean; // shown dimmed and not pickable
  onPick: (c: OwnedCharacter) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] justify-items-center gap-x-2 gap-y-3">
      {heroes.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-label={c.name}
          aria-pressed={isOn(c)}
          disabled={isOff?.(c)}
          className={isOff?.(c) ? "opacity-40" : ""}
          onClick={() => onPick(c)}
        >
          <ItemCard item={characterView(c)} size={80} selected={isOn(c)} />
        </button>
      ))}
    </div>
  );
}
