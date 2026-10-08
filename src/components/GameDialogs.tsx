"use client";
import { useSyncExternalStore } from "react";
import { getConfirm, getToasts, subscribeDialogs } from "@/lib/dialogs";

// Confirm dialog and "done" toasts in the game's own style (instead of the browser's).
export function GameDialogs() {
  const confirm = useSyncExternalStore(subscribeDialogs, getConfirm, () => null);
  const toasts = useSyncExternalStore(subscribeDialogs, getToasts, () => []);
  return (
    <>
      {toasts.length > 0 && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-3"
        >
          {toasts.map((t) => (
            <div key={t.id} className="tip-panel pointer-events-auto max-w-md text-center text-base text-yellow-200">
              {t.text}
            </div>
          ))}
        </div>
      )}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => confirm.resolve(false)}
          onKeyDown={(e) => e.key === "Escape" && confirm.resolve(false)}
        >
          <div
            className="panel-art w-full max-w-sm space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg">{confirm.text}</p>
            <div className="flex justify-center gap-2">
              <button className="btn text-center" autoFocus onClick={() => confirm.resolve(true)}>
                {confirm.yes}
              </button>
              <button className="btn btn-gray text-center" onClick={() => confirm.resolve(false)}>
                {confirm.no}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
