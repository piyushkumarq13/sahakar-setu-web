"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  IconChat,
  IconChevronDown,
  IconClock,
  IconHelp,
  IconMail,
  IconPhone,
} from "@/components/icons";

const HELPLINE = "+13469986840";
const EMAIL = "support@sahakar-setu.in";

export default function HelpPage() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>("1");

  const faqs = [
    { id: "1", q: t("hp.faq1"), a: t("hp.faq1a") },
    { id: "2", q: t("hp.faq2"), a: t("hp.faq2a") },
    { id: "3", q: t("hp.faq3"), a: t("hp.faq3a") },
    { id: "4", q: t("hp.faq4"), a: t("hp.faq4a") },
  ];

  return (
    <div className="container-page">
      <h1 className="section-title flex items-center gap-2">
        <IconHelp /> {t("hp.title")}
      </h1>

      <h2 className="mb-3 mt-6 text-xl font-extrabold text-ink">{t("hp.faqTitle")}</h2>
      <div className="space-y-3">
        {faqs.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="card overflow-hidden p-0!">
              <button
                onClick={() => setOpen(isOpen ? null : f.id)}
                aria-expanded={isOpen}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-5 py-4 text-start"
              >
                <span className="text-base font-extrabold text-ink">{f.q}</span>
                <IconChevronDown
                  className={`shrink-0 text-xl text-primary transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p className="border-t border-ink/10 px-5 py-4 text-base font-bold leading-relaxed text-ink/75">
                  {f.a}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-xl font-extrabold text-ink">{t("hp.contactTitle")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href={`tel:${HELPLINE.replace(/[^+\d]/g, "")}`}
          className="card flex min-h-[52px] items-center gap-4 transition-shadow hover:shadow-lg"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-2xl text-accent">
            <IconPhone />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink/60">{t("footer.helpline")}</span>
            <span className="block text-lg font-extrabold text-ink">{HELPLINE}</span>
          </span>
        </a>

        <a
          href={`mailto:${EMAIL}`}
          className="card flex min-h-[52px] items-center gap-4 transition-shadow hover:shadow-lg"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-logo-blue/15 text-2xl text-logo-blue">
            <IconMail />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink/60">{t("footer.email")}</span>
            <span className="block text-lg font-extrabold text-ink">{EMAIL}</span>
          </span>
        </a>

        <div className="card flex min-h-[52px] items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-2xl text-primary">
            <IconClock />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink/60">{t("hp.hours")}</span>
            <span className="block text-lg font-extrabold text-ink">{t("hp.hoursValue")}</span>
          </span>
        </div>

        <div className="card flex min-h-[52px] items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-2xl text-ink/60">
            <IconChat />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink/60">{t("footer.address")}</span>
            <span className="block text-lg font-extrabold leading-snug text-ink">
              {t("footer.addressValue")}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row">
        <a
          href={`tel:${HELPLINE.replace(/[^+\d]/g, "")}`}
          className="btn-accent min-h-[52px] flex-1"
        >
          <IconPhone /> {t("hp.callNow")}
        </a>
        <Link href="/chat" className="btn-primary min-h-[52px] flex-1">
          <IconChat /> {t("nav.chat")}
        </Link>
      </div>

      <p className="mt-8 rounded-2xl bg-cream p-4 text-sm font-bold leading-relaxed text-ink/60">
        {t("hp.disclaimer")}
      </p>
    </div>
  );
}
