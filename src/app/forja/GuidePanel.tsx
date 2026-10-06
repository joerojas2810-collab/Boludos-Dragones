"use client";

import { useState } from "react";
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
        </Panel>
      )}
    </aside>
  );
}
