// Dragon crest + wordmark (painted); the baked-in tagline of logo_primary is too small to read.
export function GameTitle() {
  return (
    <div className="game-plate">
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src="/art/ui/logo_emblem.webp"
        alt=""
        className="game-emblem"
        draggable={false}
      />
      <img
        src="/art/ui/logo_wordmark.webp"
        alt="Boludos & Dragones"
        className="game-logo"
        draggable={false}
      />
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
