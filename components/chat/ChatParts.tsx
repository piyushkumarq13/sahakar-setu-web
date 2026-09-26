"use client";

import { useI18n } from "@/lib/i18n";
import { MarkdownText } from "../Markdown";
import { PlaybackBar } from "../PlaybackBar";
import { IconChat, IconChevronDown } from "../icons";

export const DECLINE_TEXT = "Mere paas iska verified jawab nahi hai";
export const BOUNDARY_PREFIX = "Main Sahakar Setu hoon aur sirf";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "note";
  text: string;
  citations?: string[];
  time: string;
  audioUrl?: string | null;
  /** Voice-originated turns answer aloud automatically once ready. */
  autoPlay?: boolean;
}

function isDecline(text: string): boolean {
  return text.includes(DECLINE_TEXT);
}

function isBoundary(text: string): boolean {
  return text.trim().startsWith(BOUNDARY_PREFIX);
}

export function AnswerBubble({
  msg,
  lang,
  onAskMore,
  onTopicClick,
}: {
  msg: ChatMessage;
  lang: string;
  onAskMore?: () => void;
  onTopicClick?: (topic: string) => void;
}) {
  const { t } = useI18n();
  const decline = isDecline(msg.text);
  const boundary = isBoundary(msg.text);
  const topics = ["PMFBY", "PACS", t("nav.schemes"), t("nav.lessons"), t("nav.grievance")];

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-ink/10 bg-white px-4 py-3 shadow-sm md:max-w-[85%]">
        <MarkdownText text={msg.text} />

        {boundary && (
          <div className="mt-3">
            <p className="mb-2 text-sm font-bold text-ink/70">{t("chat.topicChips")}</p>
            <div className="flex flex-wrap gap-2">
              {topics.map((tp) => (
                <button
                  key={tp}
                  onClick={() => onTopicClick?.(tp)}
                  className="chip min-h-[40px] cursor-pointer border-2 border-primary/25 bg-cream px-3 text-sm font-bold text-primary hover:bg-primary/10"
                >
                  {tp}
                </button>
              ))}
            </div>
          </div>
        )}

        {decline && (
          <button
            onClick={onAskMore}
            className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-accent/15 px-4 py-2 text-base font-bold text-accent-600 hover:bg-accent/25"
          >
            <IconChat className="text-lg" aria-hidden="true" />
            {t("chat.askMore")}
          </button>
        )}

        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2" aria-label={t("chat.sources")}>
            {msg.citations.map((c, i) => (
              <button
                key={`${c}-${i}`}
                onClick={() => onTopicClick?.(c.split(" ")[0])}
                className="chip min-h-[36px] cursor-pointer bg-logo-blue/10 px-3 text-sm font-bold text-logo-blue hover:bg-logo-blue/20"
                title={c}
              >
                <IconChevronDown className="rotate-[-90deg] text-sm" aria-hidden="true" />
                {c}
              </button>
            ))}
          </div>
        )}

        <PlaybackBar text={msg.text} lang={lang} audioUrl={msg.audioUrl} autoPlay={msg.autoPlay} />

        <p className="mt-1.5 text-xs font-bold text-ink/45">{msg.time}</p>
      </div>
    </div>
  );
}

export function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-2xl rounded-br-md bg-primary px-4 py-3 shadow-sm md:max-w-[85%]">
        <p className="whitespace-pre-wrap break-words text-base font-medium leading-relaxed text-white md:text-[17px]">
          {msg.text}
        </p>
        <p className="mt-1.5 text-right text-xs font-bold text-white/70">{msg.time}</p>
      </div>
    </div>
  );
}

export function NoteBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <p className="chip-gray min-h-[40px] px-4 py-2 text-sm font-bold">{text}</p>
    </div>
  );
}

export function SourcesPanel({ citations }: { citations: string[] }) {
  const { t } = useI18n();
  if (!citations || citations.length === 0) return null;
  return (
    <div className="card">
      <h3 className="mb-3 text-lg font-extrabold text-ink">{t("chat.sources")}</h3>
        <ul className="space-y-2">
          {citations.map((c, i) => (
            <li
              key={`${c}-${i}`}
              className="break-all rounded-xl border border-ink/10 bg-cream px-3 py-2.5 text-sm font-bold text-ink"
            >
              {c}
            </li>
          ))}
        </ul>
    </div>
  );
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function newMessage(
  role: ChatMessage["role"],
  text: string,
  citations?: string[],
  audioUrl?: string | null,
  autoPlay?: boolean
): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    citations,
    time: formatClock(new Date()),
    audioUrl,
    autoPlay,
  };
}
