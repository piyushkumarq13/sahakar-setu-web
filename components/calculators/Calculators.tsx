"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { useI18n } from "@/lib/i18n";
import {
  emiCalc,
  getSchemes,
  pmfbyPremium,
  schemeEligibility,
  type EmiResponse,
  type PmfbyResponse,
  type SchemeInfo,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import {
  IconCalculator,
  IconCheck,
  IconClose,
  IconScale,
  IconSprout,
} from "@/components/icons";

const CROPS = ["dhan", "gehun", "kapas", "makka", "ganna", "other"];
const SEASONS = ["kharif", "rabi", "commercial"];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function ResultRow({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
      <span className="text-base font-bold text-ink/70">{label}</span>
      <span className={`font-extrabold text-ink ${big ? "text-xl text-primary" : "text-lg"}`}>
        {value}
      </span>
    </div>
  );
}

function EmiCalc() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(9);
  const [tenure, setTenure] = useState(24);
  const [res, setRes] = useState<EmiResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const calc = useCallback(async () => {
    setBusy(true);
    try {
      const r = await emiCalc(principal, rate, tenure);
      setRes(r);
    } catch {
      toast(t("common.networkError"), "error");
    } finally {
      setBusy(false);
    }
  }, [principal, rate, tenure, t, toast]);

  return (
    <div className="card">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="emi-p">{t("calc.principal")}</label>
          <input
            id="emi-p"
            type="number"
            min={1000}
            className="input"
            value={principal}
            onChange={(e) => setPrincipal(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="emi-r">{t("calc.annualRate")}</label>
          <input
            id="emi-r"
            type="number"
            min={0}
            step={0.1}
            className="input"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="emi-t">{t("calc.tenure")}</label>
          <input
            id="emi-t"
            type="number"
            min={1}
            className="input"
            value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))}
          />
        </div>
      </div>
      <button onClick={calc} disabled={busy} className="btn-primary mt-4">
        {busy ? <Spinner className="border-white/30 border-t-white" /> : t("calc.calculate")}
      </button>
      {res && (
        <div className="mt-4 space-y-2">
          <ResultRow label={t("calc.monthlyEmi")} value={inr(res.emi)} big />
          <ResultRow label={t("calc.totalInterest")} value={inr(res.totalInterest)} />
          <ResultRow label={t("calc.totalPayment")} value={inr(res.totalPayment)} />
        </div>
      )}
    </div>
  );
}

function PmfbyCalc() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [crop, setCrop] = useState("dhan");
  const [season, setSeason] = useState("kharif");
  const [sum, setSum] = useState(50000);
  const [res, setRes] = useState<PmfbyResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const calc = useCallback(async () => {
    setBusy(true);
    try {
      const r = await pmfbyPremium(crop, season, sum);
      setRes(r);
    } catch {
      toast(t("common.networkError"), "error");
    } finally {
      setBusy(false);
    }
  }, [crop, season, sum, t, toast]);

  return (
    <div className="card">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="pm-crop">{t("calc.crop")}</label>
          <select id="pm-crop" className="input" value={crop} onChange={(e) => setCrop(e.target.value)}>
            {CROPS.map((c) => (
              <option key={c} value={c}>{t(`calc.crop.${c}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pm-season">{t("calc.season")}</label>
          <select id="pm-season" className="input" value={season} onChange={(e) => setSeason(e.target.value)}>
            {SEASONS.map((s) => (
              <option key={s} value={s}>{t(`calc.${s}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pm-sum">{t("calc.sumInsured")}</label>
          <input
            id="pm-sum"
            type="number"
            min={1000}
            className="input"
            value={sum}
            onChange={(e) => setSum(Number(e.target.value))}
          />
        </div>
      </div>
      <button onClick={calc} disabled={busy} className="btn-primary mt-4">
        {busy ? <Spinner className="border-white/30 border-t-white" /> : t("calc.calculate")}
      </button>
      {res && (
        <div className="mt-4 space-y-2">
          <ResultRow label={t("calc.farmerShare")} value={inr(res.farmerShare)} big />
          <ResultRow label={t("calc.govtShare")} value={inr(res.govtShare)} />
          <ResultRow label={t("calc.ratePercent")} value={`${(res.rate * 100).toFixed(1)}%`} />
        </div>
      )}
    </div>
  );
}

function EligCalc() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [schemes, setSchemes] = useState<SchemeInfo[]>([]);
  const [scheme, setScheme] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ eligible: boolean; reason?: string; docs?: string[] } | null>(null);

  useEffect(() => {
    getSchemes()
      .then((r) => setSchemes(r.schemes || []))
      .catch(() => setSchemes([]));
  }, []);

  const current = schemes.find((s) => s.scheme === scheme);

  const submit = useCallback(async () => {
    if (!current) return;
    const parsed: Record<string, unknown> = {};
    for (const q of current.questions) {
      const v = answers[q.id];
      if (v === undefined || v === "") {
        toast(t("sch.quizIntro"), "error");
        return;
      }
      parsed[q.id] = q.type === "number" ? Number(v) : q.type === "boolean" ? v === "true" : v;
    }
    setBusy(true);
    try {
      const r = await schemeEligibility(current.scheme, parsed);
      setRes({ eligible: r.eligible, reason: r.reason || r.reasons?.join(", "), docs: r.docs || r.nextSteps });
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }, [answers, current, t, toast]);

  return (
    <div className="card">
      <label className="label" htmlFor="elig-s">{t("nav.schemes")}</label>
      <select
        id="elig-s"
        className="input"
        value={scheme}
        onChange={(e) => {
          setScheme(e.target.value);
          setAnswers({});
          setRes(null);
        }}
      >
        <option value="">—</option>
        {schemes.map((s) => (
          <option key={s.scheme} value={s.scheme}>{s.scheme}</option>
        ))}
      </select>
      {current && (
        <div className="mt-4 space-y-3">
          {current.questions.map((q) => (
            <div key={q.id}>
              <label className="label" htmlFor={`eq-${q.id}`}>{q.text} *</label>
              {q.type === "boolean" ? (
                <div className="flex gap-2">
                  {["true", "false"].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      className={`btn min-h-[48px] flex-1 py-2 text-base ${
                        answers[q.id] === v ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      {v === "true" ? t("common.yes") : t("common.no")}
                    </button>
                  ))}
                </div>
              ) : q.type === "choice" && q.options ? (
                <select
                  id={`eq-${q.id}`}
                  className="input"
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                >
                  <option value="">—</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`eq-${q.id}`}
                  className="input"
                  type={q.type === "number" ? "number" : "text"}
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy ? <Spinner className="border-white/30 border-t-white" /> : t("sch.done")}
          </button>
        </div>
      )}
      {res && (
        <p
          className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-lg font-extrabold ${
            res.eligible ? "bg-success/20 text-primary-700" : "bg-accent/15 text-accent-600"
          }`}
        >
          {res.eligible ? <IconCheck aria-hidden="true" /> : <IconClose aria-hidden="true" />}
          {res.eligible ? t("sch.eligible") : `${t("sch.notEligible")} — ${res.reason || ""}`}
        </p>
      )}
      {res?.docs && res.docs.length > 0 && (
        <ul className="mt-3 list-inside list-disc text-base font-bold text-ink/70">
          {res.docs.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CropCalc() {
  const { t } = useI18n();
  const [sum, setSum] = useState(50000);
  const [loss, setLoss] = useState(50);
  const claim = (sum * loss) / 100;

  return (
    <div className="card">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="cc-sum">{t("calc.sumInsured")}</label>
          <input
            id="cc-sum"
            type="number"
            min={1000}
            className="input"
            value={sum}
            onChange={(e) => setSum(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="cc-loss">{t("calc.lossPercent")}</label>
          <input
            id="cc-loss"
            type="range"
            min={0}
            max={100}
            className="mt-3 w-full accent-[#2E8B57]"
            value={loss}
            onChange={(e) => setLoss(Number(e.target.value))}
          />
          <p className="mt-1 text-center text-lg font-extrabold text-primary">{loss}%</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <ResultRow label={t("calc.claimEstimate")} value={inr(claim)} big />
      </div>
      <p className="mt-3 rounded-xl bg-accent/10 px-4 py-3 text-sm font-bold text-ink/70">
        {t("calc.estimateNote")}
      </p>
    </div>
  );
}

export interface CalculatorDef {
  id: string;
  titleKey: string;
  descKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  View: ComponentType;
}

export const CALCULATORS: CalculatorDef[] = [
  { id: "emi", titleKey: "calc.emiTitle", descKey: "calc.emiDesc", Icon: IconCalculator, View: EmiCalc },
  { id: "pmfby", titleKey: "calc.pmfbyTitle", descKey: "calc.pmfbyDesc", Icon: IconSprout, View: PmfbyCalc },
  { id: "elig", titleKey: "calc.eligTitle", descKey: "calc.eligDesc", Icon: IconCheck, View: EligCalc },
  { id: "crop", titleKey: "calc.cropTitle", descKey: "calc.cropDesc", Icon: IconScale, View: CropCalc },
];

export function findCalculator(id: string): CalculatorDef | undefined {
  return CALCULATORS.find((c) => c.id === id);
}

/** Card linking to a calculator's own page; shared by the list and detail views. */
export function CalculatorCard({ def }: { def: CalculatorDef }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/calculators/${def.id}`}
      className="card flex cursor-pointer flex-col gap-3 text-start transition-shadow hover:shadow-lg sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="flex min-w-0 flex-1 items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl text-primary">
          <def.Icon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold text-ink">{t(def.titleKey)}</span>
          <span className="block text-sm font-bold text-ink/60">{t(def.descKey)}</span>
        </span>
      </span>
      <span className="btn-accent w-full shrink-0 px-4 py-2 text-sm sm:w-auto">
        {t("calc.openCalc")}
      </span>
    </Link>
  );
}
