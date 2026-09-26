"use client";

import { useI18n } from "@/lib/i18n";
import {
  CALCULATORS,
  CalculatorCard,
} from "@/components/calculators/Calculators";

export default function CalculatorsPage() {
  const { t } = useI18n();

  return (
    <div className="container-page">
      <h1 className="section-title">{t("calc.title")}</h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("calc.subtitle")}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {CALCULATORS.map((c) => (
          <CalculatorCard key={c.id} def={c} />
        ))}
      </div>
    </div>
  );
}
