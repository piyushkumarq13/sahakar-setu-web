"use client";

import type { ChatMessage } from "@/components/chat/ChatParts";

const SESSION_KEY = "ss_session_id";
const CASE_KEY = "ss_case_id";
const CASES_KEY = "ss_saved_cases";
const LANG_KEY = "ss_language";
const LESSON_PROGRESS_KEY = "ss_lesson_progress";
const CHATS_KEY = "ss_saved_chats";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  if (!value) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode etc.
  }
}

function remove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Reactive reads
//
// Components subscribe with useSyncExternalStore instead of copying values
// into useState from an effect: no post-hydration flicker, no
// setState-in-effect, and every subscriber (possibly in several components)
// updates the moment a writer below changes the value.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

// Snapshot caches: writers invalidate their own entry before notify() so a
// subscriber of a different value keeps its stable reference (React compares
// snapshots with Object.is and re-renders only on actual change).
let langCache: string | undefined;
let caseIdCache: string | null | undefined;
let savedCasesCache: SavedCase[] | undefined;
let lessonProgressCache: LessonProgress | undefined;

const EMPTY_SAVED_CASES: SavedCase[] = [];
const EMPTY_LESSON_PROGRESS: LessonProgress = {};

/** Wakes every subscriber; call after invalidating the relevant cache. */
function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureCrossTabSync();
  return () => {
    listeners.delete(listener);
  };
}

/** Changes made in another tab are not visible to our writers; mirror them. */
let crossTabBound = false;
function ensureCrossTabSync() {
  if (crossTabBound || typeof window === "undefined") return;
  crossTabBound = true;
  window.addEventListener("storage", (e) => {
    // e.key is null when the whole storage area is cleared.
    if (e.key !== null && ![LANG_KEY, CASE_KEY, CASES_KEY, LESSON_PROGRESS_KEY].includes(e.key)) {
      return;
    }
    langCache = undefined;
    caseIdCache = undefined;
    savedCasesCache = undefined;
    lessonProgressCache = undefined;
    notify();
  });
}

export function getSessionId(): string | null {
  return read(SESSION_KEY);
}

export function setSessionId(id: string) {
  write(SESSION_KEY, id);
}

export function clearSessionId() {
  remove(SESSION_KEY);
}

export function getCaseId(): string | null {
  return read(CASE_KEY);
}

/** Stable snapshot for useSyncExternalStore; `undefined` means "not read yet". */
export function getCaseIdSnapshot(): string | null {
  if (caseIdCache === undefined) caseIdCache = getCaseId();
  return caseIdCache;
}

/** Server render never has a stored case, so hydration always starts null. */
export function getCaseIdServerSnapshot(): string | null {
  return null;
}

export function subscribeCaseId(listener: () => void): () => void {
  return subscribe(listener);
}

export function setCaseId(id: string) {
  write(CASE_KEY, id);
  // write() ignores empty values, so only trust it for a real id.
  if (id) caseIdCache = id;
  notify();
}

/**
 * Drops the stored case. Needed when the id points at a case that no longer
 * exists on the server (redeployed database, cleared data): keeping it would
 * make every later request attach facts to a non-existent case.
 */
export function clearCaseId() {
  remove(CASE_KEY);
  caseIdCache = null;
  notify();
}

export function getLanguage(): string {
  return read(LANG_KEY) || "hi";
}

export function getLanguageSnapshot(): string {
  if (langCache === undefined) langCache = getLanguage();
  return langCache;
}

export function subscribeLanguage(listener: () => void): () => void {
  return subscribe(listener);
}

export function setLanguage(lang: string) {
  write(LANG_KEY, lang);
  langCache = lang;
  notify();
}

export interface SavedCase {
  trackingId: string;
  caseId: string;
  category: string;
  subject: string;
  date: string;
}

export function getSavedCases(): SavedCase[] {
  const raw = read(CASES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedCase[];
  } catch {
    return [];
  }
}

/**
 * Cached so React sees the same array reference between writes. Returns a
 * shared empty array so server render and hydration agree on identity.
 */
export function getSavedCasesSnapshot(): SavedCase[] {
  if (savedCasesCache === undefined) {
    const list = getSavedCases();
    savedCasesCache = list.length > 0 ? list : EMPTY_SAVED_CASES;
  }
  return savedCasesCache;
}

export function getSavedCasesServerSnapshot(): SavedCase[] {
  return EMPTY_SAVED_CASES;
}

export function subscribeSavedCases(listener: () => void): () => void {
  return subscribe(listener);
}

export function saveCase(entry: SavedCase) {
  const list = getSavedCases().filter(
    (c) => c.trackingId !== entry.trackingId
  );
  list.unshift(entry);
  write(CASES_KEY, JSON.stringify(list.slice(0, 20)));
  savedCasesCache = undefined;
  notify();
}

/** Drops one saved case (my-cases page). `write` stores "[]" for the last one. */
export function removeSavedCase(trackingId: string) {
  const list = getSavedCases().filter((c) => c.trackingId !== trackingId);
  write(CASES_KEY, JSON.stringify(list));
  savedCasesCache = list.length > 0 ? list : EMPTY_SAVED_CASES;
  notify();
}

export function clearAllData() {
  try {
    [SESSION_KEY, CASE_KEY, CASES_KEY, LESSON_PROGRESS_KEY].forEach((k) =>
      window.localStorage.removeItem(k)
    );
  } catch {
    // ignore
  }
  caseIdCache = null;
  savedCasesCache = EMPTY_SAVED_CASES;
  lessonProgressCache = EMPTY_LESSON_PROGRESS;
  notify();
}

export interface LessonProgress {
  [lessonId: string]: { seconds: number; done: boolean };
}

export function getLessonProgress(): LessonProgress {
  const raw = read(LESSON_PROGRESS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return {};
  }
}

export function getLessonProgressSnapshot(): LessonProgress {
  if (lessonProgressCache === undefined) {
    const p = getLessonProgress();
    lessonProgressCache = Object.keys(p).length > 0 ? p : EMPTY_LESSON_PROGRESS;
  }
  return lessonProgressCache;
}

export function getLessonProgressServerSnapshot(): LessonProgress {
  return EMPTY_LESSON_PROGRESS;
}

export function subscribeLessonProgress(listener: () => void): () => void {
  return subscribe(listener);
}

export function setLessonProgress(lessonId: string, seconds: number, done: boolean) {
  const p = getLessonProgress();
  p[lessonId] = { seconds, done };
  write(LESSON_PROGRESS_KEY, JSON.stringify(p));
  lessonProgressCache = undefined;
  notify();
}

// ---------------------------------------------------------------------------
// Saved chats
//
// Every chat keeps a unique id (the /chat/<id> route) and its messages are
// mirrored into localStorage, so a refresh no longer loses the conversation.
// Chats are kept for a bounded time (30 days) and bounded in count (50); the
// most recent activity wins. blob: audio URLs die with the session, so they
// are dropped before persisting — the play button just regenerates TTS.
// ---------------------------------------------------------------------------

export interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const MAX_SAVED_CHATS = 50;
const MAX_CHAT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const chatListeners = new Set<() => void>();
let chatsCache: SavedChat[] | undefined;

function notifyChatListeners() {
  chatListeners.forEach((listener) => listener());
}

function readChats(): Record<string, SavedChat> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CHATS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeChats(map: Record<string, SavedChat>) {
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(map));
  } catch {
    // storage full / private mode — chats still live in memory this session
  }
  chatsCache = undefined;
}

/** Unique, URL-safe chat id like "ed3u2u33". */
export function genChatId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function getSavedChats(): SavedChat[] {
  return Object.values(readChats()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSavedChatMessages(id: string): ChatMessage[] {
  return readChats()[id]?.messages ?? [];
}

export function saveChatMessages(id: string, messages: ChatMessage[]) {
  if (!id || messages.length === 0) return;
  const map = readChats();
  const firstUser = messages.find((m) => m.role === "user");
  map[id] = {
    id,
    title: firstUser ? firstUser.text.slice(0, 60) : "",
    // Whitelist the persistable fields: blob: audio URLs die with the session
    // (the play button regenerates TTS), and old chats must not auto-speak.
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      citations: m.citations,
      time: m.time,
    })),
    updatedAt: Date.now(),
  };
  // Bound count (newest first) and age so storage cannot grow forever.
  const kept: SavedChat[] = [];
  for (const chat of getSavedChats()) {
    if (chat.updatedAt < Date.now() - MAX_CHAT_AGE_MS) delete map[chat.id];
    else if (kept.length < MAX_SAVED_CHATS) kept.push(chat);
    else delete map[chat.id];
  }
  writeChats(map);
  notifyChatListeners();
}

export function deleteSavedChat(id: string) {
  const map = readChats();
  delete map[id];
  writeChats(map);
  notifyChatListeners();
}

/** Cached so React sees the same array reference between writes. */
export function getSavedChatsSnapshot(): SavedChat[] {
  if (chatsCache === undefined) chatsCache = getSavedChats();
  return chatsCache;
}

export function getSavedChatsServerSnapshot(): SavedChat[] {
  return [];
}

export function subscribeSavedChats(listener: () => void): () => void {
  chatListeners.add(listener);
  return () => {
    chatListeners.delete(listener);
  };
}
