"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  ensureAwake,
  getServerStatus,
  subscribeServerStatus,
  type ServerStatus,
} from "@/lib/api";
import { Spinner } from "./ui";

/** Shown only while the API is unreachable or cold-starting; hidden otherwise. */
export function ServerNotice() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ServerStatus>(getServerStatus);
  const [checking, setChecking] = useState(false);

  useEffect(() => subscribeServerStatus(setStatus), []);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      await ensureAwake(45_000);
    } finally {
      setChecking(false);
    }
  }, []);

  if (status === "ok") return null;
  const offline = status === "offline";

  return (
    <div className="page-row pt-3">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          offline ? "bg-red-600 text-white" : "bg-accent/20 text-ink"
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="min-w-0 flex-1">
          {offline ? t("common.networkError") : t("common.coldStart")}
        </span>
        <button
          onClick={retry}
          disabled={checking}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60 ${
            offline ? "bg-white/20 hover:bg-white/30" : "bg-ink/10 hover:bg-ink/20"
          }`}
        >
          {checking && (
            <Spinner
              className={`h-4 w-4 ${
                offline ? "border-white/40 border-t-white" : ""
              }`}
            />
          )}
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}
