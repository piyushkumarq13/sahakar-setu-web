import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "सहकार सेतु — Sahakar Setu",
  description:
    "हर सहकारी सदस्य के लिए एक भरोसेमंद डिजिटल साथी — सहकारी कानून, योजनाएं, PACS सेवाएं, PMFBY और शिकायत समाधान, आपकी भाषा में।",
  icons: { icon: "/img/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2E8B57",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
