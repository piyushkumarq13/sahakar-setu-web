"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { getLessons, lessonAudioUrl, type LessonInfo } from "@/lib/api";
import {
  getLessonProgressServerSnapshot,
  getLessonProgressSnapshot,
  setLessonProgress,
  subscribeLessonProgress,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/ui";
import { IconBook, IconCheck, IconPause, IconPlay } from "@/components/icons";

const LANGS: { code: string; label: string }[] = [
  { code: "hi", label: "हिन्दी" },
  { code: "en", label: "English" },
];

const FALLBACK_LESSONS: { id: string; title: string; duration: string }[] = [
  { id: "fb-agri", title: "कृषि में नई तकनीक", duration: "15 मिनट" },
  { id: "fb-interest", title: "ब्याज और निवेश", duration: "18 मिनट" },
  { id: "fb-safety", title: "सुरक्षा", duration: "16 मिनट" },
  { id: "fb-legal", title: "कानूनी जानकारी", duration: "20 मिनट" },
];

function durationSeconds(duration: string): number {
  const n = parseInt(duration, 10);
  if (Number.isNaN(n) || n <= 0) return 15 * 60;
  return n * 60;
}

function durationLabel(duration: string): string {
  return Number.isNaN(parseInt(duration, 10)) ? duration : `${parseInt(duration, 10)} मिनट`;
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default function LessonsPage() {
  const { t, lang: uiLang } = useI18n();
  const { toast } = useToast();

  const [lang, setLang] = useState(uiLang === "hi" || uiLang === "en" ? uiLang : "hi");
  const [lessons, setLessons] = useState<LessonInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const progress = useSyncExternalStore(
    subscribeLessonProgress,
    getLessonProgressSnapshot,
    getLessonProgressServerSnapshot
  );

  // Reset the list when the language tab changes: adjusting state during
  // render (React's documented pattern) instead of clearing it in an effect.
  const [prevLang, setPrevLang] = useState(lang);
  if (prevLang !== lang) {
    setPrevLang(lang);
    setLessons(null);
    setFailed(false);
    setPlayingId(null);
    setLoadingId(null);
  }

  useEffect(() => {
    let alive = true;
    getLessons(lang)
      .then((res) => {
        if (!alive) return;
        if (res.lessons && res.lessons.length > 0) {
          setLessons(res.lessons);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      // Leaving the page or switching language must stop playback. The ref is
      // read here (not captured at effect setup) so it sees the element that
      // was created during playback.
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      }
    };
  }, [lang]);

  const stopAudio = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  };

  const togglePlay = (lesson: { lesson_id: string; duration: string }) => {
    if (playingId === lesson.lesson_id) {
      stopAudio();
      return;
    }

    stopAudio();
    const audio = new Audio(lessonAudioUrl(lesson.lesson_id, lang));
    audioRef.current = audio;
    setPlayingId(lesson.lesson_id);
    setLoadingId(lesson.lesson_id);

    audio.addEventListener("timeupdate", () => {
      // Keep a finished lesson marked done while it is being replayed.
      const wasDone =
        getLessonProgressSnapshot()[lesson.lesson_id]?.done ?? false;
      setLessonProgress(lesson.lesson_id, audio.currentTime, wasDone);
    });
    audio.addEventListener("playing", () => setLoadingId(null));
    audio.addEventListener("canplay", () => setLoadingId(null));
    audio.addEventListener("ended", () => {
      setLessonProgress(
        lesson.lesson_id,
        audio.duration || durationSeconds(lesson.duration),
        true
      );
      setPlayingId(null);
      setLoadingId(null);
    });
    audio.addEventListener("error", () => {
      toast(t("ls.audioError"), "error");
      setPlayingId(null);
      setLoadingId(null);
    });

    audio.play().catch(() => {
      toast(t("ls.audioError"), "error");
      setPlayingId(null);
      setLoadingId(null);
    });
  };

  const showFallback = failed || (lessons !== null && lessons.length === 0);
  const list: { lesson_id: string; title: string; duration: string; isFallback: boolean }[] =
    showFallback
      ? FALLBACK_LESSONS.map((f) => ({
          lesson_id: f.id,
          title: f.title,
          duration: f.duration,
          isFallback: true,
        }))
      : (lessons || []).map((l) => ({
          lesson_id: l.lesson_id,
          title: l.title,
          duration: l.duration,
          isFallback: false,
        }));

  return (
    <div className="container-page">
      <h1 className="section-title">{t("ls.title")}</h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("ls.subtitle")}</p>

      <div className="mb-6 flex gap-2" role="tablist" aria-label={t("common.language")}>
        {LANGS.map((l) => (
          <button
            key={l.code}
            role="tab"
            aria-selected={lang === l.code}
            onClick={() => setLang(l.code)}
            className={`min-h-[48px] rounded-full px-6 text-base font-extrabold transition-colors ${
              lang === l.code
                ? "bg-primary text-white"
                : "bg-white text-ink/70 ring-1 ring-ink/15 hover:bg-cream"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {lessons === null && !failed ? (
        <div className="space-y-4" role="status" aria-live="polite">
          <p className="text-base font-bold text-ink/70">{t("common.waitCold")}</p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-2.5 w-full" />
              </div>
              <Skeleton className="h-12 w-28 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((lesson) => {
            const p = progress[lesson.lesson_id];
            const isPlaying = playingId === lesson.lesson_id;
            const isLoading = loadingId === lesson.lesson_id;
            const done = p?.done === true;
            const percent =
              done || !p ? 0 : Math.min(100, (p.seconds / durationSeconds(lesson.duration)) * 100);

            return (
              <article
                key={lesson.lesson_id}
                className="card flex flex-wrap items-center gap-3 md:gap-5"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl text-primary">
                  <IconBook />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-extrabold leading-snug text-ink">{lesson.title}</h2>
                  <p className="text-sm font-bold text-ink/60">
                    {durationLabel(lesson.duration)}
                    {done && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-extrabold text-success">
                        <IconCheck /> {t("ls.completed")}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 max-w-[280px]">
                    <div className="mb-1 flex items-center justify-between text-xs font-bold text-ink/60">
                      <span>{t("ls.progress")}</span>
                      <span>{Math.round(done ? 100 : percent)}%</span>
                    </div>
                    <ProgressBar percent={done ? 100 : percent} />
                  </div>
                </div>

                <button
                  onClick={() =>
                    lesson.isFallback ? undefined : togglePlay(lesson)
                  }
                  disabled={!!lesson.isFallback}
                  className={`btn-primary w-full gap-2 md:ml-auto md:w-auto md:shrink-0 md:px-6 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isPlaying ? "!bg-accent" : ""
                  }`}
                >
                  {isLoading ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {t("ls.generating")}
                    </>
                  ) : isPlaying ? (
                    <>
                      <IconPause /> {t("common.pause")}
                    </>
                  ) : (
                    <>
                      <IconPlay /> {done ? t("ls.listenAgain") : t("ls.playLesson")}
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
