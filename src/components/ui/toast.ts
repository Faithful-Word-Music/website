export interface ToastMessage {
  id: number;
  message: string;
}

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/**
 * Says "done" when the control that was pressed is no longer there to say it:
 * a dialog that closed on saving, a page left behind by a delete. Anything
 * still on screen reports beside its own button instead (use-action.ts).
 * Shown by `Toaster`, in the root layout.
 */
export function toast(message: string) {
  const next = { id: nextId++, message };
  listeners.forEach((listener) => listener(next));
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
