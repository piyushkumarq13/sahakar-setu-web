"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { claimPlayback, formatTime, releasePlayback } from "@/lib/audio";
import { IconPause, IconPlay, IconSpeaker } from "./icons";

interface Props {
  text: string;
  lang: string;
  audioUrl?: string | null;
  onPlaybackChange?: (playing: boolean) => void;
}

export function PlaybackBar({ text, lang, audioUrl, onPlaybackChange }: Props) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Object URL we created for a fetched TTS blob; revoked on teardown. */
  const objectUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  function teardown() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      releasePlayback(audio);
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        releasePlayback(audio);
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    onPlaybackChange?.(playing);
  }, [playing, onPlaybackChange]);

  async function start() {
    let url = audioUrl;
    if (!url) {
      setLoading(true);
      try {
        const { tts } = await import("@/lib/api");
        const blob = await tts(text, lang);
        if (!mountedRef.current) {
          // Navigated away while the TTS request was in flight: there is no
          // UI left to control this audio, so drop it instead of leaking.
          return;
        }
        url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
      } catch {
        if (mountedRef.current) {
          setLoading(false);
          setFailed(true);
        }
        return;
      }
      setLoading(false);
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    // Only one answer plays at a time across the whole app.
    claimPlayback(audio);
    // Handlers are attached here, at element creation: an effect keyed on
    // state would run before the element exists and never see it.
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => setCurrent(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.onended = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.onerror = () => setFailed(true);
    audio.play().catch(() => setFailed(true));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      claimPlayback(audio);
      audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  if (failed) {
    return (
      <button
        onClick={() => {
          setFailed(false);
          teardown();
          start();
        }}
        className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-ink/70 hover:bg-ink/5"
      >
        <IconSpeaker className="text-lg text-primary" aria-hidden="true" />
        {t("ls.audioError")}
      </button>
    );
  }

  const label = loading
    ? t("ls.generating")
    : playing
    ? t("chat.playing")
    : t("chat.playAnswer");

  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/70 px-2 py-1.5">
      <button
        onClick={() => (audioRef.current ? toggle() : start())}
        disabled={loading}
        className="flex min-h-[48px] min-w-[48px] cursor-pointer items-center justify-center rounded-full bg-primary text-xl text-white hover:bg-primary-600 disabled:opacity-60"
        aria-label={label}
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
        ) : playing ? (
          <IconPause />
        ) : (
          <IconPlay />
        )}
      </button>
      <div className="flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{
              width: duration > 0 ? `${(current / duration) * 100}%` : "0%",
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-xs font-bold text-ink/60">
          <span>{formatTime(current)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <span className="whitespace-nowrap pr-1 text-sm font-bold text-ink/70">
        <IconSpeaker className="me-1 inline text-primary" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
