"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck, IconRefresh } from "./icons";

interface ToastItem {
  id: number;
  text: string;
  type: "info" | "error" | "success";
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastCtx {
  toast: (
    text: string,
    type?: ToastItem["type"],
    action?: { label: string; onClick: () => void }
  ) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback<ToastCtx["toast"]>((text, type = "info", action) => {
    const id = ++counter.current;
    setItems((prev) => [
      ...prev.slice(-2),
      { id, text, type, actionLabel: action?.label, onAction: action?.onClick },
    ]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-[100] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-base font-bold text-white shadow-lg ${
              t.type === "error"
                ? "bg-red-600"
                : t.type === "success"
                ? "bg-primary-700"
                : "bg-ink/90"
            }`}
          >
            <span className="shrink-0">
              {t.type === "error" ? (
                <IconRefresh className="text-lg" />
              ) : (
                <IconCheck className="text-lg" />
              )}
            </span>
            <span className="flex-1">{t.text}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={t.onAction}
                className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold hover:bg-white/30"
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
