"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";

const LINKS = [
  { href: "/", key: "nav.home" },
  { href: "/chat", key: "nav.chat" },
  { href: "/grievance", key: "nav.grievance" },
  { href: "/track", key: "nav.track" },
  { href: "/schemes", key: "nav.schemes" },
  { href: "/calculators", key: "nav.calculators" },
  { href: "/lessons", key: "nav.lessons" },
  { href: "/help", key: "nav.help" },
];

export function Navbar() {
  const { t } = useI18n();
  const pathname = usePathname();

  // On /chat, phones & tablets swap this navbar for the page's own compact
  // top bar (title + language picker + new chat). Desktops keep this navbar.
  const chatCompactBar = pathname === "/chat";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-ink/10 bg-white ${
        chatCompactBar ? "max-lg:hidden" : ""
      }`}
    >
      <div className="page-row flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex min-h-[48px] shrink-0 items-center">
          <Image
            src="/img/logo.png"
            alt="सहकार सेतु — Sahakar Setu"
            width={720}
            height={265}
            priority
            className="h-9 w-auto shrink-0 sm:h-10 md:h-11"
          />
        </Link>

        <nav
          aria-label="Main"
          className="no-scrollbar hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex md:justify-start lg:justify-center lg:gap-1"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative shrink-0 whitespace-nowrap rounded-lg px-1.5 py-2 text-[13px] font-bold text-ink transition-colors hover:text-primary lg:px-2.5 lg:text-[15px] ${
                isActive(l.href)
                  ? "text-primary after:absolute after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-full after:bg-saffron lg:after:inset-x-2.5"
                  : ""
              }`}
              aria-current={isActive(l.href) ? "page" : undefined}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <LanguageToggle />
      </div>
    </header>
  );
}
