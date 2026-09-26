"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  CALCULATORS,
  CalculatorCard,
  findCalculator,
} from "@/components/calculators/Calculators";

export default function CalculatorDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ slug: string }>();
  const def = findCalculator(params?.slug || "");

  return (
    <div className="container-page mx-auto max-w-3xl">
      <Link
        href="/calculators"
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-base font-bold text-logo-blue underline"
      >
        ← {t("calc.backToCalcs")}
      </Link>

      {def ? (
        <>
          <h1 className="section-title flex items-center gap-2">
            <def.Icon aria-hidden="true" /> {t(def.titleKey)}
          </h1>
          <p className="mb-5 text-base font-bold text-ink/60">{t(def.descKey)}</p>
          <def.View />

          <h2 className="mb-3 mt-8 text-xl font-extrabold text-ink">
            {t("calc.title")}
          </h2>
          <div className="grid gap-4">
            {CALCULATORS.filter((c) => c.id !== def.id).map((c) => (
              <CalculatorCard key={c.id} def={c} />
            ))}
          </div>
        </>
      ) : (
        <div className="card text-center">
          <p className="text-lg font-extrabold text-ink">{t("calc.notFound")}</p>
          <Link href="/calculators" className="btn-primary mt-4">
            {t("calc.backToCalcs")}
          </Link>
        </div>
      )}
    </div>
  );
}
