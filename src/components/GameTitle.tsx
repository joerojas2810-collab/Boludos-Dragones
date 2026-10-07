// Painted emblem + wordmark, tagline as live text (the baked one is too small to read).
export function GameTitle() {
  return (
    <div className="game-title">
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src="/art/ui/logo_emblem.webp?v=2"
        alt=""
        className="game-title-emblem"
        draggable={false}
      />
      <div className="game-title-text">
        <img
          src="/art/ui/logo_wordmark.webp?v=2"
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
