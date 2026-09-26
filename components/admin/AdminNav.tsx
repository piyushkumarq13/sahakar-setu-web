"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const TABS = [
  { href: "/admin", key: "adm.navDashboard" },
  { href: "/admin/reports", key: "adm.navReports" },
  { href: "/admin/analytics", key: "adm.navAnalytics" },
  { href: "/admin/sessions", key: "adm.navSessions" },
] as const;

export function AdminNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin"
              ? pathname === "/admin"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`min-h-[44px] px-4 py-2 text-sm font-extrabold sm:text-base ${
                active
                  ? "rounded-xl bg-primary text-white"
                  : "rounded-xl border-2 border-ink/15 bg-white text-ink/70 hover:bg-ink/5"
              }`}
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Link
          href="/"
          className="min-h-[44px] rounded-xl border-2 border-ink/15 bg-white px-4 py-2 text-sm font-bold text-ink/70 hover:bg-ink/5 sm:text-base"
        >
          {t("adm.navSite")}
        </Link>
        <button
          onClick={logout}
          className="min-h-[44px] cursor-pointer rounded-xl border-2 border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 sm:text-base"
        >
          {t("adm.navLogout")}
        </button>
      </div>
    </div>
  );
}
