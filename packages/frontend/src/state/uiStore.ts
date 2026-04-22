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

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  pushToast: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      ],
    })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  cliMissingShown: false,
  setCliMissingShown: (cliMissingShown) => set({ cliMissingShown }),
}));
