"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui";
import { adminGet, fmtDate } from "@/components/admin/bits";
import type { SessionDetailResponse } from "@/lib/admin/types";

function roleLabel(t: (key: string) => string, role: string): string {
  if (role === "user") return t("adm.msgUser");
  if (role === "assistant") return t("adm.msgAssistant");
  return t("adm.msgSystem");
}

export default function AdminSessionDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId || "";
  const [data, setData] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    adminGet<SessionDetailResponse>(
      `/api/admin/sessions/${encodeURIComponent(sessionId)}`
    )
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  if (error) {
    return (
      <p className="card rounded-xl bg-red-50 text-base font-bold text-red-700">
        {t("common.error")}: {error}
      </p>
    );
  }
  if (!data) {
    return <LoadingBlock lines={6} note={t("common.loading")} />;
  }

  return (
    <div>
      <Link
        href="/admin/sessions"
        className="mb-3 inline-flex min-h-[44px] items-center text-base font-bold text-logo-blue underline"
      >
        ← {t("adm.backSessions")}
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="section-title text-xl sm:text-2xl">
          {t("adm.sessionsTitle")}
        </h1>
        <span className="chip-blue">{data.session.channel}</span>
        <span className="chip-gray">{data.session.language}</span>
        <span className="text-sm font-bold text-ink/50">
          {fmtDate(data.session.started_at)}
        </span>
      </div>

      {data.messages.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-base font-bold text-ink/60">{t("adm.noMessages")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.messages.map((m) => (
            <li key={m.id} className="card">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={
                    m.role === "user"
                      ? "chip-blue"
                      : m.role === "assistant"
                        ? "chip-green"
                        : "chip-gray"
                  }
                >
                  {roleLabel(t, m.role)}
                </span>
                <span className="text-xs font-bold text-ink/50">
                  {fmtDate(m.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-ink/75">
                {m.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
