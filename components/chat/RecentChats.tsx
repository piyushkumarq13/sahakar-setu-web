"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  deleteSavedChat,
  getSavedChatsServerSnapshot,
  getSavedChatsSnapshot,
  subscribeSavedChats,
} from "@/lib/storage";
import { useSyncExternalStore } from "react";
import { IconChat, IconClose } from "../icons";

/**
 * Locally saved chats, each reachable at /chat/<id>. Clicking one reopens the
 * conversation; the × removes it from local storage (the server session it
 * pointed at may be long gone).
 */
export function RecentChats({ activeChatId }: { activeChatId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const chats = useSyncExternalStore(
    subscribeSavedChats,
    getSavedChatsSnapshot,
    getSavedChatsServerSnapshot
  );

  if (chats.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-2 text-lg font-extrabold text-ink">{t("chat.recentChats")}</h3>
      <ul className="space-y-1.5">
        {chats.slice(0, 10).map((c) => (
          <li key={c.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.push(`/chat/${c.id}`)}
              className={`flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-start transition-colors ${
                c.id === activeChatId
                  ? "bg-cream text-primary"
                  : "text-ink hover:bg-cream"
              }`}
              aria-current={c.id === activeChatId ? "page" : undefined}
            >
              <IconChat className="shrink-0 text-lg text-primary/60" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {c.title || t("chat.untitled")}
                </span>
                <span className="block text-xs font-bold text-ink/50">
                  {new Date(c.updatedAt).toLocaleString()}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => deleteSavedChat(c.id)}
              className="flex min-h-[48px] min-w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-lg text-ink/40 hover:bg-red-50 hover:text-red-600"
              aria-label={t("chat.deleteChat")}
            >
              <IconClose aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
