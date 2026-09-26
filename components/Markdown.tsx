"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders server/LLM text (chat answers, OCR output, analysis summaries) as
 * markdown: headings, bold, lists, tables, links, quotes. react-markdown
 * builds React elements (never innerHTML), so model output is XSS-safe.
 */
export function MarkdownText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
