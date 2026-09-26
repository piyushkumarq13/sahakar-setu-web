"use client";

import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { startKeepAlive, warmUpServer } from "@/lib/api";
import { ToastProvider } from "./Toast";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { BottomNav } from "./BottomNav";
import { ServerNotice } from "./ServerNotice";

export function Providers({ children }: { children: ReactNode }) {
  // Wake the API as soon as the app mounts and keep pinging /health while the
  // tab is open, so a sleeping instance is warm by the time the user submits.
  useEffect(() => {
    warmUpServer();
    return startKeepAlive();
  }, []);

  return (
    <I18nProvider>
      <ToastProvider>
        <Navbar />
        <ServerNotice />
        <main className="flex-1">{children}</main>
        <Footer />
        <BottomNav />
      </ToastProvider>
    </I18nProvider>
  );
}
