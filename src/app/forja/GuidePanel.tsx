"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Panel } from "@/components/Panel";
import { GUIDE } from "./guide";

const KEY = "forja-guide-open";

export function GuidePanel({ tab }: { tab: keyof typeof GUIDE }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(KEY, open ? "0" : "1");
    } catch {}
  };
  const [tutorial, setTutorial] = useState(false);
  const [step, setStep] = useState(0);
  const g = GUIDE[tab];
  return (
    <aside className="lg:sticky lg:top-16 lg:self-start">
      <button
        className="btn btn-gray mb-2 !min-h-8 w-full !px-2 text-sm"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? "Ocultar guía ✕" : "? ¿Qué hace esta sección?"}
      </button>
      {open && (
        <Panel title={`Guía · ${g.title}`} className="space-y-2 text-sm">
          <p>{g.what}</p>
          <p>
            <b className="text-yellow-300">Necesitas:</b> {g.needs}
          </p>
          <p>
            <b className="text-green-300">Obtienes:</b> {g.gives}
          </p>
          <p className="opacity-80">
            <b>Ejemplo:</b> {g.example}
          </p>
          <button
            className="btn btn-gray !min-h-8 w-full !px-2 text-sm"
            onClick={() => {
              setStep(0);
              setTutorial(true);
            }}
          >
            Ver tutorial
          </button>
        </Panel>
      )}
      {tutorial &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
            role="dialog"
            aria-modal="true"
            aria-label={`Tutorial · ${g.title}`}
            onKeyDown={(e) => e.key === "Escape" && setTutorial(false)}
          >
            <Panel title={`Tutorial · ${g.title}`} className="w-full max-w-lg">
              <div className="max-h-[70vh] space-y-4 overflow-y-auto">
                <p className="text-center text-sm opacity-70">
                  Paso {step + 1} de {g.steps.length}
                </p>
                <p className="min-h-24 text-base">{g.steps[step]}</p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-gray flex-1"
                    onClick={() =>
                      step === 0 ? setTutorial(false) : setStep(step - 1)
                    }
                  >
                    {step === 0 ? "Cerrar" : "Atrás"}
                  </button>
                  <button
                    autoFocus
                    className="btn flex-1"
                    onClick={() =>
                      step === g.steps.length - 1
                        ? setTutorial(false)
                        : setStep(step + 1)
                    }
                  >
                    {step === g.steps.length - 1 ? "Finalizar" : "Siguiente"}
                  </button>
                </div>
              </div>
            </Panel>
          </div>,
          document.body,
        )}
    </aside>
  );
}
