"use client";

import { useI18n } from "@/lib/i18n";
import { IconBook, IconDoc, IconGlobe } from "@/components/icons";

interface RefEntry {
  title: string;
  authors?: string;
  desc: string;
  url: string;
  tag: string;
}

const RESEARCH: RefEntry[] = [
  {
    title: "Few-Shot Continual Learning for Audio Classification",
    authors: "Yu Wang, Nicholas J. Bryan, Mark Cartwright, Juan Pablo Bello, Justin Salamon",
    desc: "ref.research1Desc",
    url: "https://ccrma.stanford.edu/~njb/research/icassp2021_continualFSL.pdf",
    tag: "ICASSP 2021",
  },
  {
    title: "Dynamic Few-Shot Visual Learning without Forgetting",
    authors: "Spyros Gidaris, Nikos Komodakis",
    desc: "ref.research2Desc",
    url: "https://openaccess.thecvf.com/content_cvpr_2018/papers/Gidaris_Dynamic_Few-Shot_Visual_CVPR_2018_paper.pdf",
    tag: "CVPR 2018",
  },
  {
    title: "CNNs for Audio Classification",
    authors: "Towards Data Science",
    desc: "ref.research3Desc",
    url: "https://towardsdatascience.com/cnns-for-audio-classification-6244954665ab",
    tag: "Article",
  },
];

const REFERENCES: RefEntry[] = [
  {
    title: "Falkon SIH — Technical Approach",
    desc: "ref.ref1Desc",
    url: "https://mauk9086.github.io/Falkon_SIH/Technical_Approach.html",
    tag: "Documentation",
  },
  {
    title: "Keyword Classification Dataset",
    authors: "DrParad0x / HuggingFace",
    desc: "ref.ref2Desc",
    url: "https://huggingface.co/datasets/DrParad0x/Keyword_Classification",
    tag: "Dataset",
  },
  {
    title: "Falkon SIH — Idea Approach (PDF)",
    desc: "ref.ref3Desc",
    url: "https://drive.google.com/file/d/1yDRVxiDwkWZjmrDBTkSxGr3tPFQ9vDPs/view?usp=sharing",
    tag: "PDF",
  },
  {
    title: "Falkon SIH — Weight Generator (PDF)",
    desc: "ref.ref4Desc",
    url: "https://drive.google.com/file/d/1J0Djz8GIHV_iW6X6omCmpc8F9rfD18AC/view?usp=sharing",
    tag: "PDF",
  },
];

const REPOS: RefEntry[] = [
  {
    title: "sahakar-setu-server",
    authors: "ismailmo9090-del",
    desc: "ref.repo1Desc",
    url: "https://github.com/ismailmo9090-del/sahakar-setu-server",
    tag: "Backend",
  },
  {
    title: "sahakar-setu-web",
    authors: "piyushkumarq13",
    desc: "ref.repo2Desc",
    url: "https://github.com/piyushkumarq13/sahakar-setu-web",
    tag: "Frontend",
  },
];

function Section({
  icon: Icon,
  title,
  entries,
  t,
}: {
  icon: typeof IconBook;
  title: string;
  entries: RefEntry[];
  t: (k: string) => string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
        <Icon className="text-primary" />
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <a
            key={e.url}
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
        ))}
      </div>
    </section>
  );
}

export default function ReferencesPage() {
  const { t } = useI18n();

  return (
    <div className="container-page">
      <h1 className="section-title flex items-center gap-2">
        <IconBook /> {t("ref.title")}
      </h1>
      <p className="mt-2 text-base leading-relaxed text-ink/75 md:text-lg">
        {t("ref.subtitle")}
      </p>

      <Section icon={IconBook} title={t("ref.researchTitle")} entries={RESEARCH} t={t} />
      <Section icon={IconDoc} title={t("ref.referencesTitle")} entries={REFERENCES} t={t} />
      <Section icon={IconGlobe} title={t("ref.reposTitle")} entries={REPOS} t={t} />
    </div>
  );
}
