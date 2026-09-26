"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui";
import { adminGet, fmtDate } from "@/components/admin/bits";
import type { SessionListResponse } from "@/lib/admin/types";

export default function AdminSessionsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SessionListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    adminGet<SessionListResponse>("/api/admin/sessions")
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p className="card rounded-xl bg-red-50 text-base font-bold text-red-700">
        {t("common.error")}: {error}
      </p>
    );
  }

  return (
    <div>
      <h1 className="section-title">{t("adm.sessionsTitle")}</h1>
      <p className="mb-4 text-sm font-bold text-ink/50">
        {data ? data.total : ""}
      </p>

      {!data ? (
        <LoadingBlock lines={5} note={t("common.loading")} />
      ) : data.items.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-base font-bold text-ink/60">{t("adm.sessionsEmpty")}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-ink/10 text-sm font-extrabold text-ink/60">
                <th className="px-4 py-3 text-start">{t("adm.colStarted")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colChannel")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colLang")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colMsgs")}</th>
                <th className="px-4 py-3 text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {data.items.map((s) => (
                <tr key={s.id} className="text-sm">
                  <td className="px-4 py-3 font-bold text-ink/80">
                    {fmtDate(s.started_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="chip-blue">{s.channel}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-ink/60">{s.language}</td>
                  <td className="px-4 py-3 font-extrabold text-ink">
                    {s.messageCount}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/sessions/${s.id}`}
                      className="btn-outline min-h-[40px] px-4 py-1.5 text-sm"
                    >
                      {t("adm.open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
