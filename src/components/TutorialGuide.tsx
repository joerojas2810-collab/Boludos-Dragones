"use client";

// Day-1 tutorial overlay (local mode; remote profiles come without the field = done).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { CLASSES, CLASS_IDS } from "@/lib/game/characters";
import { TUTORIAL_DONE } from "@/lib/game/profile";
import { createRng } from "@/lib/game/rng";
import {
  autoAdvance,
  createStarterHero,
  setTutorialStep,
  TUTORIAL_STEPS,
  tutorialStep,
} from "@/lib/game/tutorial";
import { updateProfile, useProfile } from "@/lib/useProfile";

const HREF = ["", "/run", "/coleccion", "/run", "/gacha", "/forja", "/misiones"];

export function TutorialGuide() {
  const { profile } = useProfile();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    updateProfile(autoAdvance);
  }, [profile]);
  if (!profile) return null;
  const step = tutorialStep(profile);
  if (step >= TUTORIAL_DONE) return null;
  const t = TUTORIAL_STEPS[step];
  const skip = () => updateProfile((p) => setTutorialStep(p, TUTORIAL_DONE));
  if (step === 0)
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3">
        <Panel title={t.title} className="w-full max-w-xl">
          <p className="mb-3 text-center">{t.text}</p>
          <div className="grid grid-cols-2 gap-2">
            {CLASS_IDS.map((c) => (
              <button
                key={c}
                className="btn"
                onClick={() =>
                  updateProfile((p) =>
                    createStarterHero(p, c, createRng(Date.now() >>> 0)),
                  )
                }
              >
                {CLASSES[c].name}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    );
  if (hidden)
    return (
      <button
        className="btn btn-gray !min-h-8 !px-3 fixed bottom-24 left-2 z-40 text-sm"
        onClick={() => setHidden(false)}
      >
        Tutorial {step}/{TUTORIAL_DONE - 1}
      </button>
    );
  return (
    <aside
      role="status"
      className="fixed inset-x-2 bottom-24 z-40 mx-auto max-w-xl rounded border border-yellow-600 bg-black/85 p-3 text-sm"
    >
      <p className="font-bold text-yellow-300">
        Tutorial {step}/{TUTORIAL_DONE - 1} · {t.title}
      </p>
      <p className="my-1">{t.text}</p>
      <div className="flex flex-wrap gap-2">
        {HREF[step] && (
          <Link href={HREF[step]} className="btn !min-h-8 !px-3">
            Ir
          </Link>
        )}
        <button
          className="btn btn-gray !min-h-8 !px-3"
          onClick={() => updateProfile((p) => setTutorialStep(p, step + 1))}
        >
          {step === TUTORIAL_DONE - 1 ? "Terminar" : "Hecho"}
        </button>
        <button
          className="ml-auto underline opacity-70"
          onClick={() => setHidden(true)}
        >
          Ocultar
        </button>
        <button className="underline opacity-70" onClick={skip}>
          Saltar tutorial
        </button>
      </div>
    </aside>
  );
}
