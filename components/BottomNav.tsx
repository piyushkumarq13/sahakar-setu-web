"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  IconCalculator,
  IconChat,
  IconGrid,
  IconHome,
  IconUser,
} from "./icons";

const TABS = [
  { href: "/", key: "nav.home", Icon: IconHome },
  { href: "/chat", key: "nav.chat", Icon: IconChat },
  { href: "/schemes", key: "nav.schemes", Icon: IconGrid },
  { href: "/calculators", key: "nav.calculators", Icon: IconCalculator },
  { href: "/profile", key: "nav.profile", Icon: IconUser },
];

export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/10 bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ href, key, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
            isActive(href) ? "text-accent-600" : "text-ink/60"
          }`}
          aria-current={isActive(href) ? "page" : undefined}
        >
          <Icon className={`text-xl ${isActive(href) ? "text-accent" : ""}`} />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
