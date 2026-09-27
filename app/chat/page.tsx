"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { genChatId } from "@/lib/storage";
import { Skeleton } from "@/components/ui";

/**
 * /chat without an id opens a fresh conversation. Any query string (?q=…
 * deep links from the landing page, schemes, etc.) is carried over.
 */
export default function ChatIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const search = window.location.search;
    router.replace(`/chat/${genChatId()}${search}`);
  }, [router]);

  return (
    <div className="container-page">
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
