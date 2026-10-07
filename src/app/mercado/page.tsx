"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { ItemCard } from "@/components/ItemCard";
import { CLASS_IDS, CLASSES, type ClassId } from "@/lib/game/characters";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "@/lib/game/elements";
import {
  acceptBlock,
  isFairTrade,
  MARKET_MAX_OPEN,
  MARKET_TTL_DAYS,
  pieceLabel,
  parsePieceKey,
  spareKeys,
  TRADE_TOLERANCE,
  tradeBand,
  tradeValue,
  type MarketOffer,
  type PieceKind,
} from "@/lib/game/market";
import { WEAPON_TYPE_DATA, WEAPON_TYPES, type WeaponType } from "@/lib/game/weapons";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import {
  acceptOffer,
  cancelOffer,
  createOffer,
  listOffers,
} from "@/lib/marketClient";
import { repo, useProfile } from "@/lib/useProfile";

const selectCls =
  "px-2 py-1.5 text-base";

function Piece({ k }: { k: string }) {
  const r = parsePieceKey(k);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {r && (
        <ItemCard
          size={44}
          item={
            r.kind === "character"
              ? {
                  kind: "character",
                  classId: r.base as ClassId,
                  name: pieceLabel(k),
                  rarity: r.rarity,
                  stars: 0,
                  element: r.element,
                }
              : {
                  kind: "weapon",
                  type: r.base as WeaponType,
                  name: pieceLabel(k),
                  rarity: r.rarity,
                  stars: 0,
                  element: r.element,
                }
          }
        />
      )}
      <span style={{ color: r ? RARITIES[r.rarity].color : undefined }}>
        {pieceLabel(k)}
      </span>
    </span>
  );
}

export default function MercadoPage() {
  const { profile, session, ready } = useProfile();
  const [offers, setOffers] = useState<MarketOffer[] | null>(null);
  const [kind, setKind] = useState<PieceKind>("character");
  const [give, setGive] = useState("");
  const [wantBase, setWantBase] = useState(""); // class id / weapon type, "" = sell for coins
  const [wantElement, setWantElement] = useState<Element>("fuego");
  const [wantRank, setWantRank] = useState<RarityId>("f");
  const [coins, setCoins] = useState("0");
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
  const want = wantBase
    ? `${kind === "character" ? "c" : "w"}-${wantBase}-${wantElement}-${wantRank}`
    : "";
  const band = give ? tradeBand(give, want || null) : null;
  const coinsNum = Number.parseInt(coins, 10);
  const fair =
    !!give &&
    Number.isFinite(coinsNum) &&
    isFairTrade(give, want || null, coinsNum);
  const spare = spareKeys(profile, kind);
  const bases: [string, string][] =
    kind === "character"
      ? CLASS_IDS.map((c) => [c, CLASSES[c].name])
      : WEAPON_TYPES.map((t) => [t, WEAPON_TYPE_DATA[t].label]);
  const suggest = (g: string, w: string) => {
    if (g) setCoins(String(tradeBand(g, w || null).fair));
  };
  const offerText = (o: MarketOffer) => {
    const parts = [<Piece key="g" k={o.give} />];
    return (
      <>
        {parts}
        {" · "}
        {o.want ? (
          <>
            pide <Piece k={o.want} />
          </>
        ) : (
          "venta"
        )}
        {o.coins > 0 && ` + ${o.coins} monedas (las paga quien acepta)`}
        {o.coins < 0 && ` + ${-o.coins} monedas (las paga quien ofrece)`}
      </>
    );
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      {msg && (
        <p role="status" className="text-center text-yellow-300">
          {msg}
        </p>
      )}
      <Panel title="Publicar oferta" className="space-y-3">
        <p className="text-sm opacity-80">
          Solo repetidas: das 1 estrella y conservas la pieza. Trueque{" "}
          <b>equivalente</b> (±{TRADE_TOLERANCE * 100}% de valor). Máx.{" "}
          {MARKET_MAX_OPEN} ofertas, caducan a los {MARKET_TTL_DAYS} días.
        </p>
        {give && (
          <div className="flex justify-center">
            <Piece k={give} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            className={selectCls}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PieceKind);
              setGive("");
              setWantBase("");
              setCoins("0");
            }}
            aria-label="Tipo de pieza"
          >
            <option value="character">Personajes</option>
            <option value="weapon">Equipo</option>
          </select>
          <select
            className={selectCls}
            value={give}
            onChange={(e) => {
              setGive(e.target.value);
              suggest(e.target.value, want);
            }}
            aria-label="Pieza que das"
          >
            <option value="">Doy…</option>
            {spare.map((k) => (
              <option key={k} value={k}>
                {pieceLabel(k)} (vale {tradeValue(k)})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={selectCls}
            value={wantBase}
            onChange={(e) => {
              setWantBase(e.target.value);
              const w = e.target.value
                ? `${kind === "character" ? "c" : "w"}-${e.target.value}-${wantElement}-${wantRank}`
                : "";
              suggest(give, w);
            }}
            aria-label="Pieza que pido"
          >
            <option value="">Pido solo monedas (vendo)</option>
            {bases.map(([id, label]) => (
              <option key={id} value={id}>
                Pido: {label}
              </option>
            ))}
          </select>
          {wantBase && (
            <>
              <select
                className={selectCls}
                value={wantElement}
                onChange={(e) => {
                  const el = e.target.value as Element;
                  setWantElement(el);
                  suggest(
                    give,
                    `${kind === "character" ? "c" : "w"}-${wantBase}-${el}-${wantRank}`,
                  );
                }}
                aria-label="Elemento que pido"
              >
                {ELEMENTS.map((el) => (
                  <option key={el} value={el}>
                    {ELEMENT_LABEL[el]}
                  </option>
                ))}
              </select>
              <select
                className={selectCls}
                value={wantRank}
                onChange={(e) => {
                  const r = e.target.value as RarityId;
                  setWantRank(r);
                  suggest(
                    give,
                    `${kind === "character" ? "c" : "w"}-${wantBase}-${wantElement}-${r}`,
                  );
                }}
                aria-label="Rango que pido"
              >
                {RARITY_IDS.map((r) => (
                  <option key={r} value={r}>
                    Rango {RARITIES[r].label}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="flex items-center gap-1 text-sm">
            Monedas
            <input
              className={`${selectCls} w-28`}
              type="number"
              value={coins}
              onChange={(e) => setCoins(e.target.value)}
              aria-label="Monedas (positivo: las paga quien acepta; negativo: las pagas tú)"
            />
          </label>
          <button
            className="btn"
            disabled={!fair || busy}
            onClick={() =>
              void act(
                () => createOffer(kind, give, want || null, coinsNum),
                "Oferta publicada.",
              ).then(() => setGive(""))
            }
          >
            Publicar
          </button>
        </div>
        {band && (
          <p className={`text-sm ${fair ? "text-green-300" : "text-red-300"}`}>
            {fair
              ? "Intercambio equivalente."
              : "No es equivalente: ajusta las monedas."}{" "}
            Valor justo: {band.fair} monedas · permitido de {band.min} a{" "}
            {band.max}. (Positivo: las paga quien acepta; negativo: las pagas
            tú.)
          </p>
        )}
        {spare.length === 0 && (
          <p className="text-sm opacity-80">
            Aún no tienes piezas repetidas de este tipo.
          </p>
        )}
      </Panel>

      <Panel title="Mis ofertas" className="space-y-2">
        {mine.length === 0 && <p className="text-sm opacity-80">Ninguna.</p>}
        {mine.map((o) => (
          <div key={o.id} className="tile-art flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">Das {offerText(o)}</span>
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
            <div key={o.id} className="tile-art flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <b>{o.seller}</b> da {offerText(o)}
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
