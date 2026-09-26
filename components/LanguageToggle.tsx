"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { IconGlobe } from "./icons";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  const short = lang === "hi" ? "हिं" : lang === "en" ? "EN" : current.name;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[48px] min-w-[64px] cursor-pointer items-center gap-1.5 rounded-xl border-2 border-ink/15 bg-white px-3 py-1.5 text-base font-bold text-ink hover:border-logo-blue"
        aria-label={`Language: ${current.name}`}
        aria-expanded={open}
      >
        <IconGlobe className="text-lg text-logo-blue" />
        <span className="whitespace-nowrap">{short}</span>
      </button>
      {open && (
        <ul className="absolute end-0 z-50 mt-2 max-h-80 w-44 overflow-auto rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left text-base font-bold hover:bg-cream ${
                  l.code === lang ? "text-primary" : "text-ink"
                }`}
              >
                {l.name}
                {l.code === lang && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
