"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { IconShield } from "@/components/icons";
import { Spinner } from "@/components/ui";

export default function AdminLoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setError(t("adm.loginWrong"));
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError(t("adm.loginWrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page mx-auto max-w-md py-10">
      <div className="card">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <IconShield className="text-2xl text-primary" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">
              {t("adm.loginTitle")}
            </h1>
            <p className="text-sm font-bold text-ink/60">{t("adm.loginIntro")}</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            className="input min-h-[52px]"
            placeholder={t("adm.passcode")}
            aria-label={t("adm.passcode")}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoFocus
          />
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary min-h-[52px]"
            disabled={busy || !passcode}
          >
            {busy ? <Spinner className="border-white/30 border-t-white" /> : t("adm.loginBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
