"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  chat as chatOnce,
  getCase,
  isRateLimited,
  RateLimitError,
  streamChat,
  voice as voiceApi,
  type StreamEvent,
} from "@/lib/api";
import {
  MicRecorder,
  base64ToBlobUrl,
} from "@/lib/audio";
import {
  clearCaseId,
  clearSessionId,
  getCaseId,
  getCaseIdServerSnapshot,
  getCaseIdSnapshot,
  getSessionId,
  setCaseId,
  setSessionId,
  subscribeCaseId,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/ui";
import {
  AnswerBubble,
  NoteBubble,
  SourcesPanel,
  UserBubble,
  newMessage,
  type ChatMessage,
} from "@/components/chat/ChatParts";
import { CasePanel } from "@/components/chat/CasePanel";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  IconChat,
  IconMic,
  IconRefresh,
  IconSend,
  IconStop,
} from "@/components/icons";
import { LANGUAGES } from "@/lib/i18n";

function ChatInner() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "retrieving" | "answering">("idle");
  const [partial, setPartial] = useState("");
  const [citations, setCitations] = useState<string[]>([]);
  const caseId = useSyncExternalStore(
    subscribeCaseId,
    getCaseIdSnapshot,
    getCaseIdServerSnapshot
  );
  const [caseRefresh, setCaseRefresh] = useState(0);
  const [recording, setRecording] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const recorderRef = useRef<MicRecorder | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastFailedRef = useRef<string>("");
  const busyRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Touch devices get newline-on-Enter (software keyboard); desktops send.
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
  );

  useEffect(() => {
    const stored = getCaseId();
    if (!stored) return;
    let cancelled = false;
    // A case id kept from an earlier deployment can point at a case the server
    // no longer has; reusing it would make the server drop the facts silently.
    // Clearing the stored id notifies the subscribers of caseId above.
    getCase(stored).catch((err) => {
      if (cancelled) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        // Both ids come from the same deployment; a dead case means the session
        // is gone too, and the server silently fails to create cases for it.
        clearCaseId();
        clearSessionId();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partial, status]);

  // The composer grows with the draft up to a cap, then scrolls internally.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const langName = LANGUAGES.find((l) => l.code === lang)?.name ?? "हिन्दी";

  const rememberIds = useCallback(
    (sessionId?: string, newCaseId?: string) => {
      if (newCaseId) {
        if (sessionId) {
          setSessionId(sessionId);
        }
        // Writes notify the caseId store, which feeds CasePanel below.
        setCaseId(newCaseId);
        setCaseRefresh((n) => n + 1);
        return;
      }
      // The server creates the case as part of the turn, so a missing case id
      // means the session id we sent is not on the server any more. Drop both
      // so the next turn starts a clean session instead of failing forever.
      clearSessionId();
      clearCaseId();
    },
    []
  );

  const addAssistant = useCallback((text: string, cits?: string[]) => {
    setMessages((prev) => [...prev, newMessage("assistant", text, cits)]);
    if (cits?.length) setCitations(cits);
  }, []);

  const handleStreamError = useCallback(
    (err: unknown, text: string) => {
      if (err instanceof RateLimitError) {
        busyRef.current = false;
        setStatus("idle");
        lastFailedRef.current = text;
        setCooldownLeft(60);
        toast(t("common.rateLimited"), "error");
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") return;
      // fall back to non-streaming chat
      chatOnce({
        message: text,
        sessionId: getSessionId(),
        caseId: getCaseId(),
        language: lang,
      })
        .then((res) => {
          rememberIds(res.sessionId, res.caseId);
          addAssistant(res.answer, res.citations);
        })
        .catch((e2) => {
          if (e2 instanceof RateLimitError) {
            lastFailedRef.current = text;
            setCooldownLeft(60);
            toast(t("common.rateLimited"), "error");
          } else {
            toast(t("common.networkError"), "error");
          }
        })
        .finally(() => {
          busyRef.current = false;
          setStatus("idle");
          setPartial("");
        });
    },
    [addAssistant, lang, rememberIds, t, toast]
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current || isRateLimited()) return;
      busyRef.current = true;
      setInput("");
      setMessages((prev) => [...prev, newMessage("user", trimmed)]);
      setStatus("retrieving");
      setPartial("");
      setCitations([]);
      toast(t("common.waitCold"));
      abortRef.current = new AbortController();

      let gotAnswer = false;
      let finalAnswer = "";
      let finalCits: string[] = [];
      try {
        await streamChat(
          {
            message: trimmed,
            sessionId: getSessionId(),
            caseId: getCaseId(),
            language: lang,
          },
          (evt: StreamEvent) => {
            if (evt.type === "start") {
              rememberIds(evt.sessionId, evt.caseId);
            } else if (evt.type === "retrieving") {
              setStatus("retrieving");
            } else if (evt.type === "answer") {
              gotAnswer = true;
              finalAnswer = evt.answer || "";
              finalCits = evt.citations || [];
              setStatus("answering");
              setPartial(finalAnswer);
              if (finalCits.length) setCitations(finalCits);
            }
          },
          abortRef.current.signal
        );
        if (gotAnswer) {
          addAssistant(finalAnswer || t("common.error"), finalCits);
        } else {
          await chatOnce({
            message: trimmed,
            sessionId: getSessionId(),
            caseId: getCaseId(),
            language: lang,
          }).then((res) => {
            rememberIds(res.sessionId, res.caseId);
            addAssistant(res.answer, res.citations);
          });
        }
      } catch (err) {
        handleStreamError(err, trimmed);
        return;
      } finally {
        busyRef.current = false;
        setStatus("idle");
        setPartial("");
      }
    },
    [addAssistant, handleStreamError, lang, rememberIds, t, toast]
  );

  const sendVoice = useCallback(
    async (wavBase64: string) => {
      if (isRateLimited()) {
        toast(t("common.rateLimited"), "error");
        return;
      }
      setStatus("answering");
      toast(t("common.waitCold"));
      try {
        const res = await voiceApi(
          wavBase64,
          lang,
          getSessionId(),
          getCaseId()
        );
        rememberIds(res.sessionId, res.caseId);
        if (!res.transcript.trim()) {
          setMessages((prev) => [
            ...prev,
            newMessage("note", t("common.voiceNotUnderstood")),
          ]);
          return;
        }
        const audioUrl = res.audio ? base64ToBlobUrl(res.audio, "audio/mpeg") : null;
        // The user spoke, so the answer speaks too: the message carries its
        // TTS audio and auto-plays the moment it lands.
        setMessages((prev) => [
          ...prev,
          newMessage("user", res.transcript),
          newMessage("assistant", res.answer, res.citations, audioUrl, true),
        ]);
        if (res.citations?.length) setCitations(res.citations);
      } catch (err) {
        if (err instanceof RateLimitError) {
          setCooldownLeft(60);
          toast(t("common.rateLimited"), "error");
        } else {
          toast(t("common.networkError"), "error");
        }
      } finally {
        setStatus("idle");
      }
    },
    [lang, rememberIds, t, toast]
  );

  const toggleVoice = useCallback(async () => {
    if (recording) {
      const rec = recorderRef.current;
      if (!rec) return;
      const { wavBase64, seconds } = rec.stop();
      recorderRef.current = null;
      setRecording(false);
      if (seconds < 0.4 || wavBase64.length < 5000) {
        toast(t("common.voiceNotUnderstood"), "error");
        return;
      }
      await sendVoice(wavBase64);
      return;
    }
    try {
      const rec = new MicRecorder();
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast(t("common.micDenied"), "error");
    }
  }, [recording, sendVoice, t, toast]);

  // deep link ?q=
  const deepLinkSentRef = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !deepLinkSentRef.current) {
      deepLinkSentRef.current = true;
      window.history.replaceState(null, "", "/chat");
      sendText(q);
    }
  }, [searchParams, sendText]);

  // 429 cooldown countdown
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      setCooldownLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  const busy = status !== "idle";

  return (
    <>
      {/* Phones/tablets only (lg:hidden): replaces the global navbar, which is
          hidden below lg on this route (see Navbar.tsx). Desktop keeps the
          navbar + the original header row inside container-page below. */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white lg:hidden">
        <div className="page-row flex min-h-16 items-center justify-between gap-2 py-2">
          <h1 className="min-w-0 truncate text-lg font-extrabold text-ink sm:text-xl">
            {t("chat.title")}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={() => setMessages([])}
              className="btn-ghost min-h-[48px] px-3 py-2 text-sm sm:px-4 sm:text-base"
            >
              <IconRefresh className="text-lg" aria-hidden="true" />
              {t("chat.newChat")}
            </button>
          </div>
        </div>
      </header>

      <div className="container-page">
        {/* Desktop-only original header row (hidden on small screens, which get
            the compact sticky bar above). */}
        <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <div>
            <h1 className="section-title">{t("chat.title")}</h1>
            <p className="text-base font-bold text-ink/60">{t("chat.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip-green">
              {t("chat.languageSession")}: {langName}
            </span>
            <button
              type="button"
              onClick={() => setMessages([])}
              className="btn-ghost min-h-[48px] px-4 py-2 text-base"
            >
              <IconRefresh className="text-lg" aria-hidden="true" />
              {t("chat.newChat")}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          {/* Conversation pane — fixed height at every breakpoint so the page
              size never grows with chat length; long chats scroll INSIDE the
              messages pane, and the input row stays pinned at the card bottom
              (the pane's flex-1 + min-h-0 absorbs all remaining space). */}
          <section className="card flex h-[calc(100dvh-300px)] min-h-[420px] max-h-[720px] flex-col gap-3 p-4 lg:h-[calc(100dvh-250px)] lg:min-h-[500px] lg:max-h-[760px]">
            {/* Mobile: no overscroll-contain — swipes that can't scroll the pane
                must chain to the page or the whole page freezes (card is now
                height-bounded at all sizes, so the pane scrolls internally).
                Desktop keeps contain: pane-only scrolling below lg. */}
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto lg:overscroll-contain">
              {messages.length === 0 && !busy && (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
                  <IconMic className="text-5xl text-primary/40" aria-hidden="true" />
                  <p className="max-w-sm text-base font-bold text-ink/60">
                    {t("chat.subtitle")}
                  </p>
                  <div className="flex w-full max-w-md flex-col gap-2">
                    {[
                      t("landing.popular1"),
                      t("landing.popular2"),
                      t("landing.popular3"),
                      t("landing.popular4"),
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendText(q)}
                        className="chip min-h-[48px] w-full cursor-pointer justify-start border-2 border-primary/25 bg-cream px-4 py-2.5 text-start text-base font-bold text-primary transition-colors hover:bg-primary/10"
                      >
                        <IconChat className="shrink-0 text-lg" aria-hidden="true" />
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <UserBubble key={m.id} msg={m} />
                ) : m.role === "note" ? (
                  <NoteBubble key={m.id} text={m.text} />
                ) : (
                  <AnswerBubble
                    key={m.id}
                    msg={m}
                    lang={lang}
                    onAskMore={() => {
                      setInput(t("landing.popular1"));
                    }}
                    onTopicClick={(topic) => sendText(topic)}
                  />
                )
              )}

              {busy && (
                <div className="flex justify-start">
                  <div className="w-3/4 rounded-2xl rounded-bl-md border border-ink/10 bg-white px-4 py-3 shadow-sm">
                    {status === "retrieving" ? (
                      <p className="mb-2 text-base font-bold text-primary">
                        {t("chat.retrieving")}
                      </p>
                    ) : partial ? (
                      <p className="whitespace-pre-wrap break-words text-base font-medium text-ink">
                        {partial}
                        <span className="animate-pulse text-primary">▌</span>
                      </p>
                    ) : (
                      <p className="mb-2 text-base font-bold text-primary">
                        {t("chat.thinking")}
                      </p>
                    )}
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-2/3" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {cooldownLeft > 0 && (
              <p className="rounded-xl bg-accent/15 px-4 py-2.5 text-center text-base font-bold text-accent-600">
                {t("common.retryIn", { s: cooldownLeft })}
              </p>
            )}

            {/* Input bar */}
            <form
              className="flex items-center gap-2 border-t border-ink/10 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                sendText(input);
              }}
            >
              <button
                type="button"
                onClick={toggleVoice}
                disabled={busy}
                className={`flex h-[52px] w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-xl text-xl text-white transition-colors disabled:opacity-50 ${
                  recording
                    ? "animate-pulse bg-red-600 hover:bg-red-700"
                    : "bg-primary hover:bg-primary-600"
                }`}
                aria-label={recording ? t("chat.stop") : t("chat.micHint")}
              >
                {recording ? <IconStop /> : <IconMic />}
              </button>
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Desktop: Enter sends, Shift+Enter inserts a newline. On
                  // touch devices Enter always inserts a newline (software
                  // keyboards own that key). Never send while an IME
                  // composition (e.g. Hindi transliteration) is confirming.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    if (!isTouch) {
                      e.preventDefault();
                      sendText(input);
                    }
                  }
                }}
                placeholder={t("chat.placeholder")}
                className="input max-h-40 min-h-[52px] min-w-0 flex-1 resize-none overflow-y-auto py-3"
                disabled={busy}
                aria-label={t("chat.placeholder")}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="btn-primary min-h-[52px] min-w-[52px] px-4"
                aria-label={t("common.send")}
              >
                <IconSend className="text-xl" aria-hidden="true" />
                <span className="hidden sm:inline">{t("common.send")}</span>
              </button>
            </form>
            {recording && (
              <p className="text-center text-base font-bold text-red-600">
                ● {t("chat.recording")}
              </p>
            )}
          </section>

          {/* Side panel */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <CasePanel caseId={caseId} refreshKey={caseRefresh} />
            <SourcesPanel citations={citations} />
          </aside>
        </div>
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ChatInner />
    </Suspense>
  );
}
