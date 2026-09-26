"use client";

import { useI18n } from "@/lib/i18n";
import { IconClock, IconMail, IconPhone } from "./icons";

const HELPLINE = "+13469986840";
const EMAIL = "support@sahakar-setu.in";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-10 border-t border-ink/10 bg-white pb-24 md:pb-0">
      <div className="page-row grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-base font-extrabold text-navy">
            <span aria-hidden="true" className="text-xl">🇮🇳</span>
            {t("footer.ministry")}
          </p>
          <p className="text-sm font-bold text-ink/60">{t("brand.desc")}</p>
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-base font-bold text-ink">
            <IconPhone className="text-lg text-primary" aria-hidden="true" />
            <span>
              {t("footer.helpline")}:{" "}
              <a href={`tel:${HELPLINE.replace(/-/g, "")}`} className="text-logo-blue underline">
                {HELPLINE}
              </a>
            </span>
          </p>
          <p className="flex items-center gap-2 text-base font-bold text-ink">
            <IconMail className="text-lg text-primary" aria-hidden="true" />
            <a href={`mailto:${EMAIL}`} className="text-logo-blue underline">
              {EMAIL}
            </a>
          </p>
          <p className="flex items-start gap-2 text-sm font-bold text-ink/70">
            <IconClock className="mt-0.5 text-lg text-primary" aria-hidden="true" />
            {t("hp.hoursValue")}
          </p>
        </div>
        <div className="text-sm font-bold text-ink/70">
          <p>{t("footer.address")}: {t("footer.addressValue")}</p>
          <p className="mt-2">
            {t("footer.version")} · © {new Date().getFullYear()} {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
