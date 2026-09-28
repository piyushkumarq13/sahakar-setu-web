"use client";

import { useI18n } from "@/lib/i18n";
import { IconBook, IconDoc, IconGlobe, IconScale, IconSprout, IconLandmark } from "@/components/icons";

interface RefEntry {
  title: string;
  authors?: string;
  desc: string;
  url?: string;
  tag: string;
}

const TECH_STACK: RefEntry[] = [
  {
    title: "Node.js + Express + TypeScript",
    desc: "ref.tech1Desc",
    tag: "Backend",
  },
  {
    title: "Next.js 16 + React 19 + Tailwind v4",
    desc: "ref.tech2Desc",
    tag: "Web Portal",
  },
  {
    title: "Native Android (Kotlin)",
    desc: "ref.tech3Desc",
    tag: "Kiosk App",
  },
  {
    title: "Supabase (PostgreSQL + pgvector)",
    desc: "ref.tech4Desc",
    tag: "Database",
  },
  {
    title: "Groq LLM API",
    desc: "ref.tech5Desc",
    tag: "AI / LLM",
  },
  {
    title: "Vosk STT + Edge TTS",
    desc: "ref.tech6Desc",
    tag: "Voice",
  },
];

const ARCHITECTURE: RefEntry[] = [
  {
    title: "BM25 RAG Retrieval Engine",
    desc: "ref.arch1Desc",
    tag: "RAG",
  },
  {
    title: "Multi-Channel Architecture",
    desc: "ref.arch2Desc",
    tag: "Channels",
  },
  {
    title: "VAPI IVR Integration",
    desc: "ref.arch3Desc",
    tag: "IVR",
  },
  {
    title: "Grievance Redressal System",
    desc: "ref.arch4Desc",
    tag: "Grievance",
  },
  {
    title: "Document OCR + AI Analysis",
    desc: "ref.arch5Desc",
    tag: "OCR",
  },
  {
    title: "Case Strength Scoring",
    desc: "ref.arch6Desc",
    tag: "Legal",
  },
];

const EXTERNAL_SERVICES: RefEntry[] = [
  {
    title: "Groq Cloud API",
    desc: "ref.ext1Desc",
    url: "https://console.groq.com",
    tag: "LLM Inference",
  },
  {
    title: "Supabase",
    desc: "ref.ext2Desc",
    url: "https://supabase.com",
    tag: "Database + Auth",
  },
  {
    title: "VAPI Voice Platform",
    desc: "ref.ext3Desc",
    url: "https://vapi.ai",
    tag: "Telephony / IVR",
  },
  {
    title: "Vosk Speech Recognition",
    desc: "ref.ext4Desc",
    url: "https://alphacephei.com/vosk/",
    tag: "Offline STT",
  },
  {
    title: "Microsoft Edge TTS",
    desc: "ref.ext5Desc",
    url: "https://github.com/rany2/edge-tts",
    tag: "Neural TTS",
  },
  {
    title: "sentence-transformers",
    desc: "ref.ext6Desc",
    url: "https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    tag: "Embeddings",
  },
  {
    title: "Tesseract.js OCR",
    desc: "ref.ext7Desc",
    url: "https://github.com/naptha/tesseract.js",
    tag: "Document Scanning",
  },
  {
    title: "Render Cloud Hosting",
    desc: "ref.ext8Desc",
    url: "https://render.com",
    tag: "Deployment",
  },
];

const RESEARCH: RefEntry[] = [
  {
    title: "BM25 Information Retrieval",
    authors: "Robertson & Walker, 1994",
    desc: "ref.res1Desc",
    url: "https://trec.nist.gov/pubs/trec3/t3_proceedings.html",
    tag: "IR Theory",
  },
  {
    title: "Retrieval-Augmented Generation (RAG)",
    authors: "Lewis et al., NeurIPS 2020",
    desc: "ref.res2Desc",
    url: "https://arxiv.org/abs/2005.11401",
    tag: "NLP Research",
  },
  {
    title: "Multilingual Sentence Embeddings",
    authors: "Reimers & Gurevych, EMNLP 2020",
    desc: "ref.res3Desc",
    url: "https://arxiv.org/abs/2007.15207",
    tag: "Embeddings",
  },
  {
    title: "Few-Shot Continual Learning for Audio",
    authors: "Wang et al., ICASSP 2021",
    desc: "ref.res4Desc",
    url: "https://ccrma.stanford.edu/~njb/research/icassp2021_continualFSL.pdf",
    tag: "Audio ML",
  },
];

const GOVT_SOURCES: RefEntry[] = [
  {
    title: "Ministry of Cooperation",
    desc: "ref.gov1Desc",
    url: "https://cooperation.gov.in",
    tag: "Government",
  },
  {
    title: "PMFBY Operations Manual",
    desc: "ref.gov2Desc",
    url: "https://pmfby.gov.in",
    tag: "Crop Insurance",
  },
  {
    title: "NALSA — Free Legal Aid",
    desc: "ref.gov3Desc",
    url: "https://nalsa.gov.in",
    tag: "Legal Aid",
  },
  {
    title: "Cooperative Societies Act, 1912",
    desc: "ref.gov4Desc",
    url: "https://www.indiacode.nic.in",
    tag: "Legislation",
  },
];

function CardGrid({
  entries,
  t,
}: {
  entries: RefEntry[];
  t: (k: string) => string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) =>
        e.url ? (
          <a
            key={e.title}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card group flex flex-col justify-between gap-3 transition-shadow hover:shadow-lg"
          >
            <div>
              <span className="chip mb-2 inline-block bg-primary/10 text-xs font-bold text-primary">
                {e.tag}
              </span>
              <h3 className="text-base font-extrabold leading-snug text-ink group-hover:text-primary">
                {e.title}
              </h3>
              {e.authors && (
                <p className="mt-1 text-sm font-bold text-ink/60">{e.authors}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-ink/75">
                {t(e.desc)}
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-primary">
              {t("ref.openLink")} &rarr;
            </span>
          </a>
        ) : (
          <div key={e.title} className="card flex flex-col justify-between gap-3">
            <div>
              <span className="chip mb-2 inline-block bg-primary/10 text-xs font-bold text-primary">
                {e.tag}
              </span>
              <h3 className="text-base font-extrabold leading-snug text-ink">
                {e.title}
              </h3>
              {e.authors && (
                <p className="mt-1 text-sm font-bold text-ink/60">{e.authors}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-ink/75">
                {t(e.desc)}
              </p>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof IconBook;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
        <Icon className="text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ReferencesPage() {
  const { t } = useI18n();

  return (
    <div className="container-page">
      <h1 className="section-title flex items-center gap-2">
        <IconLandmark /> {t("ref.title")}
      </h1>
      <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink/75 md:text-lg">
        {t("ref.subtitle")}
      </p>

      {/* Stats bar */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "ref.statLangs", value: "11" },
          { label: "ref.statPassages", value: "333" },
          { label: "ref.statChannels", value: "5" },
          { label: "ref.statSchemes", value: "6+" },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <p className="text-2xl font-extrabold text-primary md:text-3xl">
              {s.value}
            </p>
            <p className="mt-1 text-xs font-bold text-ink/60 md:text-sm">
              {t(s.label)}
            </p>
          </div>
        ))}
      </div>

      <Section icon={IconSprout} title={t("ref.techTitle")}>
        <CardGrid entries={TECH_STACK} t={t} />
      </Section>

      <Section icon={IconScale} title={t("ref.archTitle")}>
        <CardGrid entries={ARCHITECTURE} t={t} />
      </Section>

      <Section icon={IconGlobe} title={t("ref.extTitle")}>
        <CardGrid entries={EXTERNAL_SERVICES} t={t} />
      </Section>

      <Section icon={IconBook} title={t("ref.researchTitle")}>
        <CardGrid entries={RESEARCH} t={t} />
      </Section>

      <Section icon={IconDoc} title={t("ref.govTitle")}>
        <CardGrid entries={GOVT_SOURCES} t={t} />
      </Section>

      {/* Repositories */}
      <section className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
          <IconGlobe className="text-primary" />
          {t("ref.reposTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="https://github.com/ismailmo9090-del/sahakar-setu-server"
            target="_blank"
            rel="noopener noreferrer"
            className="card group flex flex-col justify-between gap-3 transition-shadow hover:shadow-lg"
          >
            <div>
              <span className="chip mb-2 inline-block bg-primary/10 text-xs font-bold text-primary">
                Backend
              </span>
              <h3 className="text-base font-extrabold leading-snug text-ink group-hover:text-primary">
                sahakar-setu-server
              </h3>
              <p className="mt-1 text-sm font-bold text-ink/60">Node.js · Express · Supabase · Groq · Vosk</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/75">
                {t("ref.repo1Desc")}
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-primary">
              GitHub &rarr;
            </span>
          </a>
          <a
            href="https://github.com/piyushkumarq13/sahakar-setu-web"
            target="_blank"
            rel="noopener noreferrer"
            className="card group flex flex-col justify-between gap-3 transition-shadow hover:shadow-lg"
          >
            <div>
              <span className="chip mb-2 inline-block bg-primary/10 text-xs font-bold text-primary">
                Frontend
              </span>
              <h3 className="text-base font-extrabold leading-snug text-ink group-hover:text-primary">
                sahakar-setu-web
              </h3>
              <p className="mt-1 text-sm font-bold text-ink/60">Next.js 16 · React 19 · Tailwind v4</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/75">
                {t("ref.repo2Desc")}
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-primary">
              GitHub &rarr;
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}
