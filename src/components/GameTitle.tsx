export function GameTitle() {
  return (
    <div className="game-plate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/art/ui/logo_primary.webp"
        alt="Boludos & Dragones"
        className="game-logo"
        draggable={false}
      />
    </div>
  );
}
