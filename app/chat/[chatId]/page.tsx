"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
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
  genChatId,
  getCaseId,
  getCaseIdServerSnapshot,
  getCaseIdSnapshot,
  getSavedChatMessages,
  getSessionId,
  saveChatMessages,
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
import { RecentChats } from "@/components/chat/RecentChats";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  IconChat,
  IconMic,
  IconRefresh,
  IconSend,
  IconStop,
} from "@/components/icons";
import { LANGUAGES } from "@/lib/i18n";

function ChatInner({ chatId }: { chatId: string }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getSavedChatMessages(chatId)
  );
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
  // The messages pane (not the page) is what auto-follows new output.
  const paneRef = useRef<HTMLDivElement>(null);
  // True while the reader sits near the bottom of the pane; reading older
  // messages flips it off so streaming never yanks them away.
  const atBottomRef = useRef(true);
  const lastFailedRef = useRef<string>("");
  const busyRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Touch devices get newline-on-Enter (software keyboard); desktops send.
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
  );
  // Which chatId the current `messages` content belongs to — the persist
  // effect saves only when this matches, so switching chats never writes the
  // old conversation into the new chat's storage slot.
  const messagesOwnerRef = useRef<string | null>(null);

  // Switching to another chat (recent-chats list, "new chat", deep link)
  // loads that conversation and cancels anything still in flight.
  useEffect(() => {
    if (messagesOwnerRef.current === chatId) return;
    abortRef.current?.abort();
    // setState runs inside microtasks only — never synchronously in the
    // effect body (react-hooks/set-state-in-effect). The owner ref flips
    // together with the state so the persist effect never writes the old
    // conversation into the new chat's storage slot.
    Promise.resolve().then(() => {
      busyRef.current = false;
      // A freshly opened conversation starts pinned to its latest message.
      atBottomRef.current = true;
      setMessages(getSavedChatMessages(chatId));
      messagesOwnerRef.current = chatId;
      setCitations([]);
      setPartial("");
      setStatus("idle");
      lastFailedRef.current = "";
    });
  }, [chatId]);

  // Mirror the active chat into localStorage so a refresh (or closing the
  // tab) loses nothing. Blob audio URLs are stripped in saveChatMessages.
  useEffect(() => {
    if (messages.length === 0 || messagesOwnerRef.current !== chatId) return;
    saveChatMessages(chatId, messages);
  }, [messages, chatId]);

  const startNewChat = useCallback(() => {
    router.push(`/chat/${genChatId()}`);
  }, [router]);

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

  const handlePaneScroll = useCallback(() => {
    const el = paneRef.current;
    if (!el) return;
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Follow new output only while the reader is already near the bottom; a
  // reader scrolling through earlier messages is never yanked down. The pane
  // itself is scrolled (never scrollIntoView, which walks up every scrollable
  // ancestor and was dragging the whole page along on each turn). The jump is
  // instant on purpose: a smooth animation would still be running when the
  // next streaming chunk lands, making the follow flip off mid-animation.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
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
      // Sending means "take me to my new message", even from far up the pane.
      atBottomRef.current = true;
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
      atBottomRef.current = true;
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
      // The id stays in the URL, so the deep link remains shareable.
      window.history.replaceState(null, "", `/chat/${chatId}`);
      sendText(q);
    }
  }, [searchParams, chatId, sendText]);

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
              onClick={startNewChat}
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
              onClick={startNewChat}
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
            {/* Scroll chaining is ON at every size: once the pane reaches its
                top/bottom the wheel or touch continues onto the page, so the
                document never feels frozen while the cursor is over the chat. */}
            <div
              ref={paneRef}
              onScroll={handlePaneScroll}
              className="flex-1 min-h-0 space-y-4 overflow-y-auto"
            >
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
            <RecentChats activeChatId={chatId} />
            <CasePanel caseId={caseId} refreshKey={caseRefresh} />
            <SourcesPanel citations={citations} />
          </aside>
        </div>
      </div>
    </>
  );
}

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  return (
    <Suspense
      fallback={
        <div className="container-page">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ChatInner chatId={chatId} />
    </Suspense>
  );
}
