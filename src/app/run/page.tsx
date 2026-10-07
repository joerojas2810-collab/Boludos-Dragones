"use client";

import { useEffect, useState } from "react";
import { TowerMode } from "./TowerMode";
import { ProgressMode } from "./ProgressMode";

// /run = Modo Progreso (dungeon levels); `?torre=` opens the weekly tower.
export default function RunPage() {
  const [tower, setTower] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTower(new URLSearchParams(location.search).has("torre"));
  }, []);
  if (tower === null) return null;
  return tower ? <TowerMode /> : <ProgressMode />;
}
