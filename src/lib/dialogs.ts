// In-game replacements for window.confirm and "done" messages. A tiny event bus: callers
// use askConfirm()/toast() anywhere; <GameDialogs/> (mounted once in the layout) shows them.
type Listener = () => void;
export interface ConfirmReq {
  text: string;
  yes: string;
  no: string;
  resolve: (ok: boolean) => void;
}
export interface Toast {
  id: number;
  text: string;
}

let confirmReq: ConfirmReq | null = null;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const subscribeDialogs = (l: Listener) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const getConfirm = () => confirmReq;
export const getToasts = () => toasts;

export function askConfirm(text: string, yes = "Sí", no = "Cancelar"): Promise<boolean> {
  confirmReq?.resolve(false); // a newer question replaces the old one
  return new Promise((resolve) => {
    confirmReq = {
      text,
      yes,
      no,
      resolve: (ok) => {
        confirmReq = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function toast(text: string, ms = 3500) {
  const id = nextId++;
  toasts = [...toasts, { id, text }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}
