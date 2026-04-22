import { create } from "zustand";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: ToastTone;
}

interface UIState {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  cliMissingShown: boolean;
  setCliMissingShown: (shown: boolean) => void;
}

const TOAST_AUTO_DISMISS_MS = 3000;

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  pushToast: (t) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, TOAST_AUTO_DISMISS_MS);
    }
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  cliMissingShown: false,
  setCliMissingShown: (cliMissingShown) => set({ cliMissingShown }),
}));
