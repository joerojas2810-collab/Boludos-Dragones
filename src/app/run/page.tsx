"use client";

import { useEffect, useState } from "react";
import { TowerRun } from "./TowerRun";
import { ProgressMode } from "./ProgressMode";

// /run = Modo Progreso (dungeon levels). `?torre=` still opens the weekly tower on
// the classic engine until the tower moves to the stage engine.
export default function RunPage() {
  const [tower, setTower] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTower(new URLSearchParams(location.search).has("torre"));
  }, []);
  if (tower === null) return null;
  return tower ? <TowerRun /> : <ProgressMode />;
}
