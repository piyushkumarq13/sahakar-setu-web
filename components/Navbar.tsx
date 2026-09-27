"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { IconClose, IconMenu } from "./icons";

const LINKS = [
  { href: "/", key: "nav.home" },
  { href: "/chat", key: "nav.chat" },
  { href: "/lawyer", key: "nav.lawyer" },
  { href: "/grievance", key: "nav.grievance" },
  { href: "/track", key: "nav.track" },
  { href: "/my-cases", key: "nav.myCases" },
  { href: "/schemes", key: "nav.schemes" },
  { href: "/calculators", key: "nav.calculators" },
  { href: "/lessons", key: "nav.lessons" },
  { href: "/help", key: "nav.help" },
  { href: "/profile", key: "nav.profile" },
];

export function Navbar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // On /chat, phones & tablets swap this navbar for the page's own compact
  // top bar (title + language picker + new chat). Desktops keep this navbar.
  const chatCompactBar =
    pathname === "/chat" || pathname.startsWith("/chat/");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Lock page scroll while the drawer is open: scrolling inside the sidebar
  // (or over the backdrop) must not move the page behind it. The cleanup
  // restores whatever overflow the body had before.
  useEffect(() => {
    if (!menuOpen || chatCompactBar) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen, chatCompactBar]);

  return (
    <>
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

          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            {/* Mobile only: opens the drawer with the nav links that are
                hidden on small screens (the full nav shows from md up). */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex min-h-[48px] min-w-[48px] cursor-pointer items-center justify-center rounded-xl border-2 border-ink/15 bg-white px-3 text-xl text-ink hover:border-logo-blue md:hidden"
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <IconMenu />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sidebar drawer — sibling of the header so the fixed panel is
          never clipped; hidden from md up where the inline nav is visible. */}
      {menuOpen && !chatCompactBar && (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/40 md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="mobile-nav-drawer"
            className="fixed inset-y-0 end-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl md:hidden"
            aria-label={t("nav.menu")}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink/10 px-4">
              <span className="text-lg font-extrabold text-ink">
                {t("nav.menu")}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[48px] min-w-[48px] cursor-pointer items-center justify-center rounded-xl text-2xl text-ink hover:text-primary"
                aria-label={t("common.close")}
              >
                <IconClose />
              </button>
            </div>
            <nav className="flex flex-col gap-1 overflow-y-auto overscroll-contain p-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-lg px-4 py-3 text-base font-bold transition-colors ${
                    isActive(l.href)
                      ? "bg-cream text-primary"
                      : "text-ink hover:bg-cream"
                  }`}
                  aria-current={isActive(l.href) ? "page" : undefined}
                >
                  {t(l.key)}
                </Link>
              ))}
            </nav>
          </aside>
        </>
      )}
    </>
  );
}
