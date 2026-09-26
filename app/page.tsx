"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  IconChat,
  IconDoc,
  IconLandmark,
  IconMic,
  IconPhone,
  IconSprout,
} from "@/components/icons";

const HELPLINE = "+13469986840";

export default function LandingPage() {
  const { t } = useI18n();

  const popular = [
    t("landing.popular1"),
    t("landing.popular2"),
    t("landing.popular3"),
    t("landing.popular4"),
  ];

  const quickCards = [
    {
      icon: IconPhone,
      title: t("landing.ivrTitle"),
      desc: t("landing.ivrDesc"),
      href: `tel:${HELPLINE.replace(/-/g, "")}`,
      external: true,
    },
    {
      icon: IconLandmark,
      title: t("landing.pacsTitle"),
      desc: t("landing.pacsDesc"),
      href: "/chat?q=PACS%20registration%20kaise%20hoti%20hai%3F",
    },
    {
      icon: IconSprout,
      title: t("landing.betiTitle"),
      desc: t("landing.betiDesc"),
      href: "/schemes",
    },
  ];

  return (
    <div className="container-page">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(33,33,33,0.08)]">
        <div className="grid items-center gap-0 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-4 p-5 sm:p-7 lg:p-10">
            <Image
              src="/img/logo.png"
              alt="सहकार सेतु — Sahakar Setu"
              width={720}
              height={265}
              className="h-14 w-auto md:h-16 lg:h-[72px]"
              priority
            />
            <h1 className="text-[28px] font-extrabold leading-[1.15] text-balance text-navy sm:text-4xl xl:text-[42px]">
              {t("landing.heroTagline")}
            </h1>
            <p className="max-w-xl text-lg font-bold text-ink/70 md:text-xl">
              {t("landing.heroText")}
            </p>
            <div className="mt-1 flex w-full flex-col gap-3 sm:flex-row">
              <Link href="/chat" className="btn-primary flex-1">
                <IconMic className="shrink-0 text-xl" aria-hidden="true" />
                {t("landing.ctaChat")}
              </Link>
              <Link href="/grievance" className="btn-accent flex-1">
                <IconDoc className="shrink-0 text-xl" aria-hidden="true" />
                {t("landing.ctaGrievance")}
              </Link>
            </div>
          </div>
          <div className="relative min-h-[220px] sm:min-h-[300px] lg:min-h-[440px]">
            <Image
              src="/img/hero.png"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Quick access cards */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("landing.quickAccess")}>
        {quickCards.map((c) => {
          const body = (
            <>
              <c.icon className="text-3xl text-primary" aria-hidden="true" />
              <span className="text-lg font-extrabold text-ink">{c.title}</span>
              <span className="text-sm font-bold text-ink/60">{c.desc}</span>
            </>
          );
          const cls = "card group flex min-h-[130px] flex-col gap-1.5 transition-shadow hover:shadow-lg";
          // External schemes (tel:) need a plain anchor; everything else
          // should navigate client-side without a full page reload.
          return c.external ? (
            <a key={c.title} href={c.href} className={cls}>
              {body}
            </a>
          ) : (
            <Link key={c.title} href={c.href} className={cls}>
              {body}
            </Link>
          );
        })}
      </section>

      {/* Popular questions */}
      <section className="mt-8">
        <h2 className="section-title mb-3">{t("landing.popularTitle")}</h2>
        <div className="flex flex-wrap gap-3">
          {popular.map((q) => (
            <Link
              key={q}
              href={`/chat?q=${encodeURIComponent(q)}`}
              className="chip min-h-[48px] cursor-pointer border-2 border-primary/25 bg-white px-4 py-2.5 text-base font-bold text-primary transition-colors hover:bg-primary/5"
            >
              <IconChat className="text-lg" aria-hidden="true" />
              {q}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
