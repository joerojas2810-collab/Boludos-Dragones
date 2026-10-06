"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import {
  acceptBlock,
  MARKET_MAX_OPEN,
  MARKET_TTL_DAYS,
  pieceLabel,
  parsePieceKey,
  spareKeys,
  type MarketOffer,
  type PieceKind,
} from "@/lib/game/market";
import { RARITIES } from "@/lib/game/rarity";
import {
  acceptOffer,
  cancelOffer,
  createOffer,
  listOffers,
} from "@/lib/marketClient";
import { repo, useProfile } from "@/lib/useProfile";

const selectCls =
  "border-2 border-[var(--edge)] bg-[var(--panel)] px-2 py-1.5 text-base";

function Piece({ k }: { k: string }) {
  const r = parsePieceKey(k);
  return (
    <span style={{ color: r ? RARITIES[r.rarity].color : undefined }}>
      {pieceLabel(k)}
    </span>
  );
}

export default function MercadoPage() {
  const { profile, session, ready } = useProfile();
  const [offers, setOffers] = useState<MarketOffer[] | null>(null);
  const [kind, setKind] = useState<PieceKind>("character");
  const [give, setGive] = useState("");
  const [want, setWant] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      listOffers()
        .then(setOffers)
        .catch((e: Error) => setMsg(e.message)),
    [],
  );
  useEffect(() => {
    if (repo.mode === "remote" && session.status === "user") void refresh();
  }, [session.status, refresh]);

  if (!ready || !profile) return null;
  if (repo.mode !== "remote")
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <TopBar current="/mercado" />
        <Panel title="Mercado">
          <p>El mercado solo existe con sesión en línea.</p>
        </Panel>
      </main>
    );

  const act = async (job: () => Promise<unknown>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await job();
      setMsg(okMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
    await refresh();
    setBusy(false);
  };

  const mine = (offers ?? []).filter((o) => o.seller === session.name);
  const others = (offers ?? []).filter((o) => o.seller !== session.name);
  const spare = spareKeys(profile, kind);
  const owned = (
    kind === "character" ? profile.characters : profile.weapons
  ).map((x) => x.id);
  const wishable = Array.from(new Set(owned)).filter((k) => k !== give);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <TopBar current="/mercado" />
      {msg && (
        <p role="status" className="text-center text-yellow-300">
          {msg}
        </p>
      )}
      <Panel title="Publicar oferta" className="space-y-3">
        <p className="text-sm opacity-80">
          Solo se pueden ofrecer piezas repetidas (con al menos 1 estrella): das
          una estrella y conservas la pieza. Pide otra pieza tuya repetida a
          cambio o déjalo vacío para regalar. Hasta {MARKET_MAX_OPEN} ofertas
          abiertas; caducan a los {MARKET_TTL_DAYS} días. Sin monedas.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className={selectCls}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PieceKind);
              setGive("");
              setWant("");
            }}
            aria-label="Tipo de pieza"
          >
            <option value="character">Personajes</option>
            <option value="weapon">Armas</option>
          </select>
          <select
            className={selectCls}
            value={give}
            onChange={(e) => setGive(e.target.value)}
            aria-label="Pieza que das"
          >
            <option value="">Doy…</option>
            {spare.map((k) => (
              <option key={k} value={k}>
                {pieceLabel(k)}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={want}
            onChange={(e) => setWant(e.target.value)}
            aria-label="Pieza que pido"
          >
            <option value="">Regalo (no pido nada)</option>
            {wishable.map((k) => (
              <option key={k} value={k}>
                Pido: {pieceLabel(k)}
              </option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!give || busy}
            onClick={() =>
              void act(
                () => createOffer(kind, give, want || null),
                "Oferta publicada.",
              ).then(() => setGive(""))
            }
          >
            Publicar
          </button>
        </div>
        {spare.length === 0 && (
          <p className="text-sm opacity-80">
            Aún no tienes piezas repetidas de este tipo.
          </p>
        )}
      </Panel>

      <Panel title="Mis ofertas" className="space-y-2">
        {mine.length === 0 && <p className="text-sm opacity-80">Ninguna.</p>}
        {mine.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">
              Das <Piece k={o.give} /> ·{" "}
              {o.want ? (
                <>
                  pides <Piece k={o.want} />
                </>
              ) : (
                "regalo"
              )}
            </span>
            <button
              className="btn btn-gray !min-h-9 !px-2 !py-1"
              disabled={busy}
              onClick={() =>
                void act(() => cancelOffer(o.id), "Oferta cancelada.")
              }
            >
              Cancelar
            </button>
          </div>
        ))}
      </Panel>

      <Panel title="Ofertas de amigos" className="space-y-2">
        {offers === null && <p className="text-sm">Cargando…</p>}
        {offers && others.length === 0 && (
          <p className="text-sm opacity-80">No hay ofertas abiertas.</p>
        )}
        {others.map((o) => {
          const block = acceptBlock(profile, o, false);
          return (
            <div key={o.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <b>{o.seller}</b> da <Piece k={o.give} /> ·{" "}
                {o.want ? (
                  <>
                    pide <Piece k={o.want} />
                  </>
                ) : (
                  "regalo"
                )}
                {block && <em className="block text-sm opacity-70">{block}</em>}
              </span>
              <button
                className="btn !min-h-9 !px-2 !py-1"
                disabled={busy || !!block}
                onClick={() =>
                  void act(() => acceptOffer(o.id), "Intercambio hecho.")
                }
              >
                Aceptar
              </button>
            </div>
          );
        })}
      </Panel>
    </main>
  );
}
