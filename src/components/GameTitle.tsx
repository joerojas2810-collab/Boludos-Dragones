import { uiAsset } from "@/lib/art";

// Emblem and wordmark; tagline stays live text.
export function GameTitle() {
  return (
    <div className="game-title">
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src={uiAsset("logo_emblem")}
        alt=""
        className="game-title-emblem"
        draggable={false}
      />
      <div className="game-title-text">
        <img
          src={uiAsset("logo_wordmark")}
          alt="Boludos & Dragones"
          className="game-title-word"
          draggable={false}
        />
        <p className="game-title-tag">Una aventura entre amigos</p>
      </div>
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
